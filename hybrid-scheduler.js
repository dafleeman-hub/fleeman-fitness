(function (root, factory) {
  const config = typeof module === "object" && module.exports ? require("./hybrid-config.js") : root.FleemanHybridConfig;
  const stress = typeof module === "object" && module.exports ? require("./hybrid-stress.js") : root.FleemanHybridStress;
  const api = factory(config, stress);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FleemanHybridScheduler = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (config, stress) {
  function runningClassification(baseline = {}) {
    const runs = Number(baseline.runsPerWeek) || 0;
    const mileage = Number(baseline.weeklyMileage) || 0;
    const consistency = baseline.consistency || "not-running";
    if (runs <= 1 || mileage < 8 || ["not-running", "under-3-months"].includes(consistency)) return "new";
    if (runs >= 4 && mileage >= 20 && ["1-3-years", "3-plus-years"].includes(consistency)) return "experienced";
    return "developing";
  }

  function racePhase(setup = {}, referenceDate = new Date()) {
    if (!setup.raceGoal?.enabled || !setup.raceGoal.date) return { name: "general", weeksToRace: null, runMultiplier: 1, strengthMultiplier: 1 };
    const weeksToRace = Math.max(0, Math.ceil((new Date(`${setup.raceGoal.date}T12:00:00`) - referenceDate) / 604800000));
    if (weeksToRace <= 2) return { name: "taper", weeksToRace, runMultiplier: .72, strengthMultiplier: .55 };
    if (weeksToRace <= 6) return { name: "race-specific", weeksToRace, runMultiplier: .95, strengthMultiplier: .65 };
    if (weeksToRace <= 12) return { name: "build", weeksToRace, runMultiplier: 1, strengthMultiplier: .75 };
    return { name: "base", weeksToRace, runMultiplier: .95, strengthMultiplier: .8 };
  }

  function sessionTargets(setup = {}) {
    const defaults = config.PRIORITIES[setup.hybridPriority] || config.PRIORITIES.balanced;
    const selectedStrength = setup.strengthSessionsTarget === "auto" || setup.strengthSessionsTarget == null ? defaults.strengthSessions : Number(setup.strengthSessionsTarget);
    const baselineRuns = Number(setup.runningBaseline?.runsPerWeek) || 0;
    const runCeiling = Number(setup.advanced?.maximumRunningDays) || 7;
    const selectedRuns = setup.runningSessionsTarget === "auto" || setup.runningSessionsTarget == null
      ? Math.min(runCeiling, setup.hybridPriority === "strength" ? Math.max(2, Math.min(3, baselineRuns + 1)) : setup.hybridPriority === "balanced" ? Math.max(3, Math.min(4, baselineRuns + 1)) : Math.max(3, Math.min(defaults.runSessions, baselineRuns + 1)))
      : Number(setup.runningSessionsTarget);
    const strengthMinimum = config.clamp(setup.advanced?.minLiftingDays || 2, 1, 4);
    const strengthMaximum = Math.max(strengthMinimum, config.clamp(setup.advanced?.maxLiftingDays || 4, 1, 4));
    return { strength: config.clamp(selectedStrength, strengthMinimum, strengthMaximum), running: config.clamp(selectedRuns, 1, Math.min(5, runCeiling)) };
  }

  function chooseStrengthWorkouts(workouts = [], count = 3, priority = "balanced", setup = {}) {
    const avoidTerms = String(setup.advanced?.exercisesToAvoid || "").split(/[,;\n]/).map(item => item.trim().toLowerCase()).filter(Boolean);
    const permitted = workouts.filter(workout => Array.isArray(workout.exercises) && workout.exercises.length).filter(workout => !avoidTerms.some(term => workout.exercises.some(exercise => String(exercise.name || "").toLowerCase().includes(term))));
    const candidates = permitted.map(workout => ({ workout, ...stress.classifyStrengthSession(workout) }));
    const lower = candidates.filter(item => item.stress.lowerBody >= item.stress.upperBody).sort((a, b) => b.stress.lowerBody - a.stress.lowerBody);
    const upper = candidates.filter(item => item.stress.upperBody > item.stress.lowerBody).sort((a, b) => b.stress.upperBody - a.stress.upperBody);
    const ordered = priority === "running" || priority === "race" ? [...upper, ...lower] : priority === "strength" ? [...lower, ...upper] : [upper[0], lower[0], upper[1], lower[1], ...candidates].filter(Boolean);
    const unique = [];
    for (const item of ordered) if (item && !unique.some(chosen => chosen.workout.id === item.workout.id)) unique.push(item);
    for (const item of candidates) if (!unique.some(chosen => chosen.workout.id === item.workout.id)) unique.push(item);
    if (!unique.length) return [];
    while (unique.length < count) unique.push(unique[unique.length % Math.max(1, unique.length)]);
    return unique.slice(0, count).map((item, index) => ({
      id: `strength-${index}-${item.workout.id}`,
      type: "strength",
      title: item.workout.name,
      subtype: item.classification,
      workoutId: item.workout.id,
      priority: item.stress.lowerBody >= 3 && (priority === "strength" || index === 0) ? "A" : "B",
      stress: item.stress,
      volumeMultiplier: config.PRIORITIES[priority]?.lowerVolumeMultiplier || .85
    }));
  }

  function applyRaceStrengthPhase(sessions, setup) {
    const phase = racePhase(setup);
    if (setup.hybridPriority !== "race") return sessions;
    return sessions.map(session => ({ ...session, racePhase: phase.name, volumeMultiplier: Number((Number(session.volumeMultiplier || 1) * phase.strengthMultiplier).toFixed(2)), holdProgression: phase.name === "taper" || phase.name === "race-specific" }));
  }

  function distributeRunDistance(total, count, baseline) {
    if (!total) return Array.from({ length: count }, (_, index) => ({ targetDuration: index === count - 1 ? 45 : 30 }));
    const longShare = baseline.classification === "new" ? .35 : .4;
    const remaining = 1 - longShare;
    return Array.from({ length: count }, (_, index) => ({ targetDistance: Number((index === count - 1 ? total * longShare : total * remaining / Math.max(1, count - 1)).toFixed(1)) }));
  }

  function buildRunSessions(setup, count) {
    const baseline = { ...(setup.runningBaseline || {}) };
    baseline.classification = runningClassification(baseline);
    const existingMileage = Number(baseline.weeklyMileage) || 0;
    const initialMileage = existingMileage ? existingMileage * (baseline.classification === "new" ? 1 : 1.03) : 0;
    const targets = distributeRunDistance(initialMileage, count, baseline);
    if (targets.length && Number(setup.advanced?.preferredLongRunDuration)) targets[targets.length - 1].targetDuration = Number(setup.advanced.preferredLongRunDuration);
    const speedworkPreference = setup.advanced?.speedworkPreference || "auto";
    const qualityEligible = speedworkPreference !== "none" && speedworkPreference !== "strides" && baseline.classification !== "new" && Number(baseline.runsPerWeek) >= 2 && !setup.recoveryPreferences?.limitations?.some(item => item !== "None");
    const phase = racePhase(setup);
    const raceSpecific = setup.hybridPriority === "race" && qualityEligible;
    const types = Array.from({ length: count }, () => "Easy Run");
    if (count >= 2) types[count - 1] = "Long Easy Run";
    if (qualityEligible && count >= 3) {
      if (!raceSpecific) types[count - 2] = "Threshold";
      else if (phase.name === "taper") types[count - 2] = "Easy Run";
      else if (setup.raceGoal?.distance === "Marathon") types[count - 2] = "Marathon Pace";
      else if (["5K", "10K"].includes(setup.raceGoal?.distance) && phase.name === "race-specific") types[count - 2] = "Intervals";
      else if (setup.raceGoal?.distance === "Half Marathon") types[count - 2] = "Tempo";
      else types[count - 2] = "Threshold";
    }
    return types.map((runType, index) => {
      const session = {
        id: `run-${index}-${runType.toLowerCase().replace(/\s+/g, "-")}`,
        type: "run",
        title: runType,
        runType,
        priority: runType === "Long Easy Run" || /Threshold|Marathon Pace|Intervals|Race/.test(runType) ? "A" : index === 0 ? "B" : "C",
        rpeTarget: runType === "Recovery Run" ? "2-3" : runType === "Long Easy Run" || runType === "Easy Run" ? "3-4" : runType === "Steady Run" ? "4-5" : runType === "Marathon Pace" ? "5-6" : runType === "Tempo" ? "6-7" : /Threshold|Hills/.test(runType) ? "7-8" : /Intervals|Race/.test(runType) ? "8-9" : "3-4",
        intensityDisplay: setup.runningIntensityDisplay || "pace-rpe",
        paceTarget: /pace/.test(setup.runningIntensityDisplay || "") ? setup.advanced?.knownEasyPace || "Use RPE when pace varies" : "",
        heartRateTarget: /heart-rate/.test(setup.runningIntensityDisplay || "") ? setup.advanced?.heartRateZones || "Use RPE when HR zones are unavailable" : "",
        surface: setup.schedulingPreferences?.runningSurface || "Mixed",
        ...targets[index], racePhase: phase.name
      };
      if (setup.hybridPriority === "race") {
        if (session.targetDistance) session.targetDistance = Number((session.targetDistance * phase.runMultiplier).toFixed(1));
        if (session.targetDuration) session.targetDuration = Math.max(15, Math.round(session.targetDuration * phase.runMultiplier));
      }
      if ((baseline.classification === "new" || speedworkPreference === "strides") && runType === "Easy Run" && index === Math.max(0, count - 2)) session.strides = "4 × 15 seconds relaxed, full recovery";
      session.stress = stress.calculateRunStress(session, baseline, setup.runHistory || []);
      return session;
    });
  }

  function trimForAvailability(strengthSessions, runSessions, setup) {
    const days = Math.min(setup.availableDays.length, Math.max(1, Number(setup.trainingDays) || setup.availableDays.length));
    const allowDoubles = setup.twoADayPreference !== "no";
    const capacity = allowDoubles ? days * 2 : days;
    let strengthList = [...strengthSessions], runList = [...runSessions];
    while (strengthList.length + runList.length > capacity) {
      if (setup.hybridPriority === "strength" && runList.length > 1) runList.splice(runList.findIndex(item => item.priority === "C") >= 0 ? runList.findIndex(item => item.priority === "C") : 0, 1);
      else if (["running", "race"].includes(setup.hybridPriority) && strengthList.length > 2) strengthList.pop();
      else if (runList.length > strengthList.length && runList.length > 1) runList.shift();
      else if (strengthList.length > 2) strengthList.pop();
      else break;
    }
    if (days === 3 && allowDoubles) {
      strengthList = strengthList.slice(0, Math.min(2, strengthList.length));
      runList = runList.slice(0, Math.min(2, runList.length));
      [...strengthList, ...runList].forEach(session => { session.compressedWeek = true; if (session.type === "strength") session.volumeMultiplier *= .8; });
    }
    return [...strengthList, ...runList];
  }

  function buildSessionInventory(setup, workouts = []) {
    const targets = sessionTargets(setup);
    const strengthSessions = applyRaceStrengthPhase(chooseStrengthWorkouts(workouts, targets.strength, setup.hybridPriority, setup), setup);
    if (!strengthSessions.length) throw new Error("No saved strength workout remains after applying the exercises-to-avoid preference.");
    const runSessions = buildRunSessions(setup, targets.running);
    const sessions = trimForAvailability(strengthSessions, runSessions, setup);
    return sessions.sort((a, b) => ({ A: 0, B: 1, C: 2 }[a.priority] - ({ A: 0, B: 1, C: 2 }[b.priority])));
  }

  function dayStress(day = []) {
    return day.reduce((result, session) => ({ lowerBody: Math.min(5, result.lowerBody + Number(session.stress?.lowerBody || 0)), upperBody: Math.min(5, result.upperBody + Number(session.stress?.upperBody || 0)), cardio: Math.min(5, result.cardio + Number(session.stress?.cardio || 0)), overall: Math.min(5, Math.max(result.overall, Number(session.stress?.overall || 0)) + (day.length > 1 ? .25 : 0)) }), { lowerBody: 0, upperBody: 0, cardio: 0, overall: 0 });
  }

  function orderSameDay(sessions, priority) {
    if (sessions.length < 2) return sessions;
    return [...sessions].sort((a, b) => {
      if (priority === "strength") return a.type === "strength" ? -1 : 1;
      if (["running", "race"].includes(priority) && a.priority === "A" && a.type === "run") return -1;
      return { A: 0, B: 1, C: 2 }[a.priority] - { A: 0, B: 1, C: 2 }[b.priority];
    });
  }

  function exceedsMaxConsecutiveDays(days, maximum = 3, circular = false) {
    let consecutive = 0;
    const sequence = circular ? [...days, ...days.slice(0, Math.min(days.length, Number(maximum) || 3))] : days;
    for (const day of sequence) {
      consecutive = day.sessions.length ? consecutive + 1 : 0;
      if (consecutive > Number(maximum || 3)) return true;
    }
    return false;
  }

  function scoreHybridSchedule(days, setup) {
    let score = 100;
    const conflicts = [];
    const stresses = days.map(day => dayStress(day.sessions));
    for (let index = 0; index < days.length; index++) {
      const current = days[index];
      if (current.sessions.length > 1) {
        const sameDayConflict = stress.calculateConflict(current.sessions[0].stress, current.sessions[1].stress, { separationHours: current.separationHours || 0 });
        score += sameDayConflict.penalty + (sameDayConflict.rating === "red" ? config.CONFLICT.penalties.sameDayRed : 0);
        if (sameDayConflict.rating !== "green") conflicts.push({ dayIndex: index, type: "same-day", ...sameDayConflict });
        if (current.sessions.some(item => item.type === "strength" && item.stress.upperBody >= 2) && current.sessions.some(item => item.type === "run" && /Easy|Recovery/.test(item.runType || ""))) score += config.CONFLICT.rewards.upperRunPairing;
      }
      if (index < days.length - 1 && days[index].sessions.length && days[index + 1].sessions.length) {
        const adjacent = stress.calculateConflict(stresses[index], stresses[index + 1], { separationHours: 24 });
        score += adjacent.penalty;
        if (["orange", "red"].includes(adjacent.rating)) conflicts.push({ dayIndex: index, nextDayIndex: index + 1, type: "adjacent", ...adjacent });
        const currentHard = Number(stresses[index].overall || 0) >= 4;
        const nextHard = Number(stresses[index + 1].overall || 0) >= 4;
        const currentEasy = Number(stresses[index].overall || 0) <= 2.5;
        const nextEasy = Number(stresses[index + 1].overall || 0) <= 2.5;
        if ((currentHard && nextEasy) || (nextHard && currentEasy)) score += config.CONFLICT.rewards.hardEasyAlternation;
        if (setup.advanced?.stressDistribution === "spread" && Number(stresses[index].overall || 0) >= 3.5 && Number(stresses[index + 1].overall || 0) >= 3.5) score += config.CONFLICT.penalties.yellow;
      }
    }
    if (setup.scheduleType !== "rolling") {
      const prefs = setup.schedulingPreferences || {};
      const preferredMap = [[prefs.longRunDay, session => session.runType === "Long Easy Run"], [prefs.heavyLowerDay, session => session.subtype === "Heavy Lower"]];
      preferredMap.forEach(([day, matcher]) => { if (day !== "" && day != null && days[Number(day)]?.sessions.some(matcher)) score += config.CONFLICT.rewards.preferredDay; });
      if (prefs.restDay !== "" && prefs.restDay != null && days[Number(prefs.restDay)]?.sessions.length === 0) score += config.CONFLICT.rewards.preferredDay;
    }
    const aDays = days.flatMap((day, index) => day.sessions.some(session => session.priority === "A") ? [index] : []);
    if (aDays.every((value, index) => index === 0 || value - aDays[index - 1] > 1)) score += config.CONFLICT.rewards.separatedA;
    return { score, conflicts, dayStress: stresses };
  }

  function generateHybridSchedule(setup, workouts = []) {
    if (setup.scheduleType === "rolling") return generateRollingHybridSchedule(setup, workouts);
    const available = [...new Set((setup.availableDays || []).map(config.dayIndex))].sort((a, b) => a - b);
    if (!available.length) throw new Error("Choose at least one available training day.");
    const inventory = buildSessionInventory({ ...setup, availableDays: available }, workouts);
    if (!inventory.length) throw new Error("At least one saved strength workout is required to build a Hybrid program.");
    let beam = [{ slots: Array.from({ length: 7 }, () => []), heuristic: 0 }];
    for (const session of inventory) {
      const expanded = [];
      for (const candidate of beam) {
        for (const day of available) {
          const existing = candidate.slots[day];
          const maxPerDay = setup.twoADayPreference === "no" ? 1 : 2;
          if (existing.length >= maxPerDay) continue;
          if (existing.length && setup.twoADayPreference === "occasionally" && existing.some(item => item.priority === "A") && session.priority === "A") continue;
          if (existing.length && stress.calculateConflict(existing[0].stress, session.stress).rating === "red") continue;
          const slots = candidate.slots.map(list => [...list]);
          slots[day].push(session);
          const usedTrainingDays = slots.filter(daySessions => daySessions.length).length;
          if (usedTrainingDays > Math.max(1, Number(setup.trainingDays) || available.length)) continue;
          const localPenalty = existing.length ? stress.calculateConflict(existing[0].stress, session.stress, { separationHours: Number(setup.advanced?.hoursBetweenMajor || 6) }).penalty : 0;
          expanded.push({ slots, heuristic: candidate.heuristic + localPenalty });
        }
      }
      beam = expanded.sort((a, b) => b.heuristic - a.heuristic).slice(0, 180);
      if (!beam.length) throw new Error("The requested sessions cannot fit the selected days without enabling occasional two-a-days or reducing session targets.");
    }
    let candidates = beam.map(candidate => {
      const days = candidate.slots.map((sessions, dayIndex) => ({ dayIndex, day: config.DAYS[dayIndex], sessionType: sessions.length === 0 ? "rest" : sessions.length === 1 ? sessions[0].type : "hybrid", separationHours: sessions.length > 1 ? Math.min(12, Math.max(3, Number(setup.advanced?.hoursBetweenMajor || 6))) : 0, sessions: orderSameDay(sessions, setup.hybridPriority) }));
      return { days, ...scoreHybridSchedule(days, setup) };
    });
    const maxConsecutive = Number(setup.advanced?.maxConsecutiveDays || 3);
    const hardConstraintCandidates = candidates.filter(candidate => !exceedsMaxConsecutiveDays(candidate.days, maxConsecutive));
    if (!hardConstraintCandidates.length) throw new Error("The requested sessions cannot meet the maximum consecutive training-days limit. Enable two-a-days, add availability, or reduce session targets.");
    candidates = hardConstraintCandidates;
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const totals = best.days.flatMap(day => day.sessions);
    const runSessions = totals.filter(item => item.type === "run");
    const strengthSessions = totals.filter(item => item.type === "strength");
    const loadSummary = {
      strengthSessions: strengthSessions.length,
      runningSessions: runSessions.length,
      runningDistance: Number(runSessions.reduce((sum, item) => sum + Number(item.targetDistance || 0), 0).toFixed(1)),
      hardSessions: totals.filter(item => Number(item.stress?.overall || 0) >= 4 || item.subtype === "Heavy Lower" || (item.runType === "Long Easy Run" && Number(item.stress?.overall || 0) >= 3.5)).length,
      lowerBody: stress.stressLabel(Math.max(...best.dayStress.map(item => item.lowerBody))),
      upperBody: stress.stressLabel(Math.max(...best.dayStress.map(item => item.upperBody))),
      cardio: stress.stressLabel(Math.max(...best.dayStress.map(item => item.cardio))),
      recoveryBalance: best.conflicts.some(item => item.rating === "red") ? "Needs Review" : best.conflicts.some(item => item.rating === "orange") ? "Manageable" : "Good"
    };
    const heavyLowerDay = best.days.find(day => day.sessions.some(item => item.subtype === "Heavy Lower"));
    const qualityDay = best.days.find(day => day.sessions.some(item => /Threshold|Intervals|Hills|Marathon Pace/.test(item.runType || "")));
    const longDay = best.days.find(day => day.sessions.some(item => item.runType === "Long Easy Run"));
    const why = [
      heavyLowerDay && qualityDay ? `${heavyLowerDay.day} lower-body strength and ${qualityDay.day} quality running were scored together to reduce avoidable interference.` : null,
      longDay ? `The long run is placed on ${longDay.day} and protected as an A-priority session.` : null,
      setup.twoADayPreference === "no" ? "No day contains two sessions because two-a-days are disabled." : "Any combined day follows the selected Hybrid priority for session order."
    ].filter(Boolean);
    return { schedule: best.days, score: best.score, conflicts: best.conflicts, loadSummary, why, inventory, racePhase: racePhase(setup), alternativesEvaluated: candidates.length };
  }

  function generateRollingHybridSchedule(setup, workouts = []) {
    const cycleLength = config.clamp(setup.rollingCycleLength || 8, 3, 21);
    const rollingSetup = { ...setup, scheduleType: "rolling", trainingDays: cycleLength, availableDays: Array.from({ length: cycleLength }, (_, index) => index) };
    const inventory = buildSessionInventory(rollingSetup, workouts);
    if (!inventory.length) throw new Error("At least one strength session and one run are required for a Hybrid cycle.");
    let beam = [{ slots: Array.from({ length: cycleLength }, () => []), heuristic: 0 }];
    for (const session of inventory) {
      const expanded = [];
      for (const candidate of beam) {
        for (let slotIndex = 0; slotIndex < cycleLength; slotIndex += 1) {
          const existing = candidate.slots[slotIndex];
          const maxPerDay = setup.twoADayPreference === "no" ? 1 : 2;
          if (existing.length >= maxPerDay) continue;
          if (existing.length && setup.twoADayPreference === "occasionally" && existing.some(item => item.priority === "A") && session.priority === "A") continue;
          if (existing.length && stress.calculateConflict(existing[0].stress, session.stress).rating === "red") continue;
          const slots = candidate.slots.map(list => [...list]);
          slots[slotIndex].push(session);
          const localPenalty = existing.length ? stress.calculateConflict(existing[0].stress, session.stress, { separationHours: Math.min(12, Math.max(3, Number(setup.advanced?.hoursBetweenMajor || 6))) }).penalty : 0;
          expanded.push({ slots, heuristic: candidate.heuristic + localPenalty });
        }
      }
      beam = expanded.sort((a, b) => b.heuristic - a.heuristic).slice(0, 240);
      if (!beam.length) throw new Error("The requested sessions cannot fit this rolling-cycle length. Enable occasional two-a-days or use a longer cycle.");
    }
    let candidates = beam.map(candidate => {
      const days = candidate.slots.map((sessions, dayIndex) => ({ dayIndex, cycleDay: dayIndex + 1, day: `Cycle Day ${dayIndex + 1}`, sessionType: sessions.length === 0 ? "rest" : sessions.length === 1 ? sessions[0].type : "hybrid", separationHours: sessions.length > 1 ? Math.min(12, Math.max(3, Number(setup.advanced?.hoursBetweenMajor || 6))) : 0, sessions: orderSameDay(sessions, setup.hybridPriority) }));
      return { days, ...scoreHybridSchedule(days, rollingSetup) };
    });
    const maxConsecutive = Number(setup.advanced?.maxConsecutiveDays || 3);
    candidates = candidates.filter(candidate => !exceedsMaxConsecutiveDays(candidate.days, maxConsecutive, true));
    if (!candidates.length) throw new Error("The requested rolling cycle cannot meet the maximum consecutive training-days limit. Enable two-a-days, lengthen the cycle, or reduce session targets.");
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const trainingSessions = best.days.flatMap(day => day.sessions);
    const schedule = best.days.map(day => day.sessions.length ? day : { ...day, sessionType: "rest", sessions: [{ id: `rolling-rest-${day.dayIndex}`, type: "rest", title: "Rest Day", priority: "C", stress: { lowerBody: 0, upperBody: 0, cardio: 0, overall: 0 } }] });
    const runSessions = trainingSessions.filter(item => item.type === "run");
    const strengthSessions = trainingSessions.filter(item => item.type === "strength");
    const loadSummary = {
      strengthSessions: strengthSessions.length,
      runningSessions: runSessions.length,
      runningDistance: Number(runSessions.reduce((sum, item) => sum + Number(item.targetDistance || 0), 0).toFixed(1)),
      hardSessions: trainingSessions.filter(item => Number(item.stress?.overall || 0) >= 4 || item.subtype === "Heavy Lower").length,
      lowerBody: stress.stressLabel(Math.max(0, ...best.dayStress.map(item => item.lowerBody))),
      upperBody: stress.stressLabel(Math.max(0, ...best.dayStress.map(item => item.upperBody))),
      cardio: stress.stressLabel(Math.max(0, ...best.dayStress.map(item => item.cardio))),
      recoveryBalance: best.conflicts.some(item => item.rating === "red") ? "Needs Review" : best.conflicts.some(item => item.rating === "orange") ? "Manageable" : "Good"
    };
    const why = [
      `This is a ${cycleLength}-day rolling sequence. It advances by completed training or rest days and does not reset on Monday.`,
      "Demanding lower-body lifting and running were separated where the selected cycle length allowed.",
      setup.twoADayPreference === "no" ? "No cycle day contains two sessions." : "Any combined cycle day follows the selected Hybrid priority for session order."
    ];
    return { schedule, score: best.score, conflicts: best.conflicts, loadSummary, why, inventory, racePhase: racePhase(setup), alternativesEvaluated: candidates.length, scheduleType: "rolling", cycleLength };
  }

  function rescheduleRemainingWeek(program, occurrenceId, targetDayIndex) {
    const clone = JSON.parse(JSON.stringify(program));
    let moving = null, sourceDay = null;
    clone.schedule.forEach(day => { const found = day.sessions.find(session => session.occurrenceId === occurrenceId || session.id === occurrenceId); if (found) { moving = found; sourceDay = day; day.sessions = day.sessions.filter(session => session !== found); day.sessionType = day.sessions.length === 0 ? "rest" : day.sessions.length === 1 ? day.sessions[0].type : "hybrid"; } });
    if (!moving) return { program: clone, warning: null };
    const target = clone.schedule[Number(targetDayIndex)];
    if (!target) return { program: clone, warning: { rating: "red", message: "That schedule position is unavailable." } };
    if (clone.scheduleType === "rolling" || clone.setup?.scheduleType === "rolling") {
      target.sessions = target.sessions.filter(session => session.type !== "rest");
      if (sourceDay && sourceDay !== target && sourceDay.sessions.length === 0) sourceDay.sessions = [{ id: `rolling-rest-${sourceDay.dayIndex}`, type: "rest", title: "Rest Day", priority: "C", stress: { lowerBody: 0, upperBody: 0, cardio: 0, overall: 0 } }];
    }
    target.sessions.push(moving); target.sessions = orderSameDay(target.sessions, clone.hybridPriority); target.sessionType = target.sessions.length > 1 ? "hybrid" : moving.type;
    const scored = scoreHybridSchedule(target === undefined ? [] : clone.schedule, clone.setup || clone);
    clone.conflicts = scored.conflicts; clone.scheduleScore = scored.score;
    return { program: clone, warning: scored.conflicts.find(conflict => conflict.dayIndex === Number(targetDayIndex) || conflict.nextDayIndex === Number(targetDayIndex)) || null };
  }
  return { runningClassification, racePhase, sessionTargets, chooseStrengthWorkouts, buildRunSessions, buildSessionInventory, dayStress, scoreHybridSchedule, generateHybridSchedule, generateRollingHybridSchedule, rescheduleRemainingWeek, orderSameDay, exceedsMaxConsecutiveDays };
});
