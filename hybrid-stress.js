(function (root, factory) {
  const config = typeof module === "object" && module.exports ? require("./hybrid-config.js") : root.FleemanHybridConfig;
  const api = factory(config);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FleemanHybridStress = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (config) {
  const lowerPattern = /quad|hamstring|glute|calf|adductor|abductor|lower back|squat|deadlift|romanian|rdl|lunge|leg press|hip thrust|leg curl|leg extension|step[- ]?up/i;
  const upperPattern = /chest|back|shoulder|bicep|tricep|trap|forearm|bench|row|pull|press|curl|fly|raise/i;
  const compoundPattern = /squat|deadlift|rdl|romanian|split squat|leg press|bench press|overhead press|row|pull[- ]?up|pulldown|lunge/i;

  function rirWeight(rir) {
    const value = Number(rir);
    if (value <= 1) return config.RIR_WEIGHTS.zeroOne;
    if (value === 2) return config.RIR_WEIGHTS.two;
    if (value === 3) return config.RIR_WEIGHTS.three;
    if (value === 4) return config.RIR_WEIGHTS.four;
    return config.RIR_WEIGHTS.fivePlus;
  }

  function exerciseRegion(exercise = {}) {
    const text = [exercise.name, exercise.primaryMuscle, exercise.muscle, ...(exercise.secondaryMuscles || []), ...(exercise.muscleTags || [])].join(" ");
    const lower = lowerPattern.test(text);
    const upper = upperPattern.test(text);
    if (lower && upper) return { lower: 1, upper: .25 };
    if (lower) return { lower: 1, upper: 0 };
    if (upper) return { lower: 0, upper: 1 };
    return { lower: .25, upper: .25 };
  }

  function setBucket(sets) {
    if (sets <= 0) return 0;
    if (sets <= 3) return 1;
    if (sets <= 6) return 2;
    if (sets <= 10) return 3;
    if (sets <= 14) return 4;
    return 5;
  }

  function calculateStrengthStress(workout = {}) {
    let upperSets = 0, lowerSets = 0, systemic = 0, compoundCount = 0;
    for (const exercise of workout.exercises || []) {
      const region = exerciseRegion(exercise);
      const multiplier = compoundPattern.test(exercise.name || "") ? 1.15 : 1;
      if (multiplier > 1) compoundCount++;
      const effective = Math.max(0, Number(exercise.sets) || 0) * rirWeight(exercise.targetRir ?? 3) * multiplier;
      upperSets += effective * region.upper;
      lowerSets += effective * region.lower;
      const name = String(exercise.name || "").toLowerCase();
      if (/deadlift/.test(name) && !/romanian|rdl/.test(name)) systemic += config.SYSTEMIC_COST.deadlift;
      else if (/squat/.test(name)) systemic += config.SYSTEMIC_COST.squat;
      else if (/romanian|\brdl\b/.test(name)) systemic += config.SYSTEMIC_COST.rdl;
      if (/nordic/.test(name) && Number(exercise.priorExposures || 0) < 3) lowerSets += .5;
    }
    const upperBody = config.clamp(setBucket(upperSets), 0, 5);
    const lowerBody = config.clamp(setBucket(lowerSets), 0, 5);
    const fullBodyPenalty = upperBody >= 2.5 && lowerBody >= 2.5 ? .75 : 0;
    const overall = config.clamp(Math.max(upperBody, lowerBody) + fullBodyPenalty + Math.min(systemic, .75), 0, 5);
    return { lowerBody, upperBody, cardio: 0, overall, effectiveSets: { upper: upperSets, lower: lowerSets, systemic }, compoundCount };
  }

  function classifyStrengthSession(workout = {}) {
    const stress = calculateStrengthStress(workout);
    const exercises = workout.exercises || [];
    const exerciseNames = exercises.map(item => item.name || "").join(" ");
    const averageRir = exercises.length ? exercises.reduce((sum, item) => sum + Number(item.targetRir ?? 3), 0) / exercises.length : 3;
    let classification = "Full Body Moderate";
    if (/power clean|hang clean|clean and jerk|snatch|box jump|broad jump|plyometric|jump squat/i.test(exerciseNames) && stress.lowerBody >= 1.5) classification = "Power / Explosive Lower";
    else if (stress.lowerBody >= 3 && stress.upperBody < 2.5) classification = averageRir <= 2.5 ? "Heavy Lower" : "Lower Hypertrophy";
    else if (stress.lowerBody >= 2 && stress.upperBody < 2) classification = "Lower Technique";
    else if (stress.upperBody >= 3 && stress.lowerBody < 2.5) classification = averageRir <= 2.5 ? "Heavy Upper" : "Upper Hypertrophy";
    else if (stress.upperBody >= 3 && stress.lowerBody >= 3) classification = averageRir <= 2.5 ? "Full Body Heavy" : "Full Body Moderate";
    return { classification, stress };
  }

  function durationModifier(planned, normal) {
    if (!normal || !planned) return 0;
    const ratio = planned / normal;
    if (ratio < .75) return -.5;
    if (ratio <= 1.25) return 0;
    if (ratio <= 1.5) return .5;
    return 1;
  }

  function longRunModifier(session, baseline = {}) {
    if (session.runType !== "Long Easy Run") return 0;
    const planned = Number(session.targetDistance) || 0;
    const recent = Number(baseline.longestRun) || 0;
    const weekly = Number(baseline.weeklyMileage) || 0;
    const concentration = weekly && planned / weekly > .55 ? 1 : weekly && planned / weekly > .45 ? .5 : 0;
    const increase = !planned ? 0 : !recent ? .5 : planned <= recent * 1.05 ? .25 : planned <= recent * 1.15 ? .5 : 1;
    return Math.max(increase, concentration);
  }

  function calculateRunStress(session = {}, baseline = {}, history = []) {
    const base = config.RUN_BASE_STRESS[session.runType] ?? 2;
    const plannedDuration = Number(session.targetDuration) || 0;
    const normalDuration = Number(baseline.normalRunDuration || baseline.averageEasyDuration) || 0;
    const duration = durationModifier(plannedDuration, normalDuration);
    const longRun = longRunModifier(session, baseline);
    const priorTypeCount = history.filter(item => item.runType === session.runType && item.completion !== "skipped").length;
    const novelty = /Intervals|Hills|Threshold/.test(session.runType || "") && priorTypeCount === 0 ? .5 : 0;
    const surface = String(session.surface || baseline.preferredSurface || "").toLowerCase();
    const familiar = String(baseline.preferredSurface || "").toLowerCase();
    const terrain = /trail|hilly|hills/.test(surface) && surface !== familiar ? .5 : surface && familiar && surface !== familiar ? .25 : 0;
    const overall = config.clamp(base + duration + longRun + novelty + terrain, 1, 5);
    return { lowerBody: config.clamp(overall - (/Recovery|Easy/.test(session.runType || "") ? .25 : 0), 1, 5), upperBody: 0, cardio: overall, overall, modifiers: { base, duration, longRun, novelty, terrain } };
  }

  function separationRelief(hours) {
    if (hours == null) return 0;
    if (hours < 3) return 0;
    if (hours < 6) return .25;
    if (hours < 12) return .5;
    if (hours < 24) return 1;
    if (hours < 36) return 1.5;
    return 2;
  }

  function calculateConflict(first = {}, second = {}, options = {}) {
    const rawCombined = Number(first.lowerBody || 0) + Number(second.lowerBody || 0);
    const combined = Math.max(0, rawCombined - separationRelief(options.separationHours));
    let rating = combined <= config.CONFLICT.greenMax ? "green" : combined <= config.CONFLICT.yellowMax ? "yellow" : combined <= config.CONFLICT.orangeMax ? "orange" : "red";
    if (Number(first.lowerBody) >= 4 && Number(second.lowerBody) >= 4 && rating === "yellow") rating = "orange";
    return { rating, combinedLowerStress: combined, rawCombinedLowerStress: rawCombined, separationHours: options.separationHours ?? null, penalty: config.CONFLICT.penalties[rating], message: rating === "red" ? "High lower-body load: these demanding sessions need more separation." : rating === "orange" ? "Elevated lower-body load: consider more recovery or a lower-stress option." : rating === "yellow" ? "Manageable overlap: monitor readiness and avoid unnecessary progression." : "Productive spacing." };
  }

  function stressLabel(value) {
    if (Number(value) < 1.75) return "Low";
    if (Number(value) < 3.25) return "Moderate";
    if (Number(value) < 4.25) return "High";
    return "Very High";
  }
  return { rirWeight, exerciseRegion, calculateStrengthStress, classifyStrengthSession, durationModifier, longRunModifier, calculateRunStress, calculateConflict, separationRelief, stressLabel };
});
