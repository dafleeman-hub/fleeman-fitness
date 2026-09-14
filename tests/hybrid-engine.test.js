const assert = require("node:assert/strict");
const config = require("../hybrid-config.js");
const stress = require("../hybrid-stress.js");
const scheduler = require("../hybrid-scheduler.js");
const progression = require("../hybrid-progression.js");
const recovery = require("../hybrid-recovery.js");

const upper = { id: "upper", name: "Upper", exercises: [{ name: "Bench Press", muscle: "Chest", sets: 4, targetRir: 2 }, { name: "Cable Row", muscle: "Back", sets: 4, targetRir: 2 }] };
const lower = { id: "lower", name: "Lower", exercises: [{ name: "Back Squat", muscle: "Quads", sets: 4, targetRir: 2 }, { name: "Romanian Deadlift", muscle: "Hamstrings", sets: 3, targetRir: 2 }] };
const full = { id: "full", name: "Full", exercises: [...upper.exercises, ...lower.exercises] };

assert.equal(stress.exerciseRegion(lower.exercises[0]).lower, 1);
assert.ok(stress.calculateStrengthStress(lower).lowerBody >= 2);
assert.match(stress.classifyStrengthSession(upper).classification, /Upper/);
assert.ok(stress.calculateRunStress({ runType: "Threshold", targetDuration: 45 }, { normalRunDuration: 30 }, []).overall >= 4);
assert.equal(stress.calculateConflict({ lowerBody: 5 }, { lowerBody: 5 }).rating, "red");
assert.ok(stress.calculateConflict({ lowerBody: 4 }, { lowerBody: 4 }, { separationHours: 24 }).combinedLowerStress < 8, "separation reduces effective conflict");
assert.ok(stress.longRunModifier({ runType: "Long Easy Run", targetDistance: 10 }, { weeklyMileage: 10, longestRun: 10 }) > stress.longRunModifier({ runType: "Long Easy Run", targetDistance: 10 }, { weeklyMileage: 40, longestRun: 10 }), "long-run concentration uses weekly baseline");
assert.equal(stress.classifyStrengthSession({ exercises: [{ name: "Power Clean", muscle: "Quads", sets: 4, targetRir: 3 }] }).classification, "Power / Explosive Lower");

const baseSetup = {
  hybridPriority: "balanced", availableDays: [0, 1, 2, 3, 4], twoADayPreference: "occasionally", strengthSessionsTarget: 3, runningSessionsTarget: 3,
  runningBaseline: { runsPerWeek: 3, weeklyMileage: 15, longestRun: 6, consistency: "3-12-months" }, runningIntensityDisplay: "pace-rpe",
  recoveryPreferences: { limitations: ["None"] }, schedulingPreferences: { longRunDay: "5", heavyLowerDay: "1", restDay: "6", runningSurface: "Mixed" }, advanced: { maximumRunningDays: 5 }
};

const weekdayIds = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
weekdayIds.forEach((weekday, index) => {
  assert.equal(config.weekdayId(weekday), weekday, `${weekday} keeps its semantic weekday ID`);
  assert.equal(config.weekdayId(index), weekday, `legacy Monday-first index ${index} maps to ${weekday}`);
  assert.equal(config.dayIndex(weekday), index, `${weekday} maps to Monday-first index ${index}`);
  assert.equal(config.jsDayToHybridIndex(config.hybridIndexToJsDay(index)), index, `${weekday} survives the JavaScript Date boundary`);
});

function preferenceCandidate(longDayIndex, rating = null, score = 100, marker = "candidate") {
  const days = Array.from({ length: 7 }, (_, dayIndex) => ({ dayIndex, sessions: dayIndex === longDayIndex ? [{ type: "run", runType: "Long Easy Run" }] : [] }));
  const conflicts = rating ? [{ rating, dayIndex: 6, nextDayIndex: null }] : [];
  return { marker, days, conflicts, score };
}
const sundayPreferenceSetup = { schedulingPreferences: { longRunDay: "sunday" } };
const higherScoringMoved = preferenceCandidate(0, null, 130, "moved");
const greenSunday = preferenceCandidate(6, null, 100, "green-sunday");
assert.deepEqual(scheduler.selectCandidatesForPreferredLongRun([higherScoringMoved, greenSunday], sundayPreferenceSetup, [0,1,2,3,4,5,6]).candidates.map(item => item.marker), ["green-sunday"], "Case 1: a higher unpreferred score does not displace a conflict-free Sunday long run");
const yellowSunday = preferenceCandidate(6, "yellow", 90, "yellow-sunday");
assert.deepEqual(scheduler.selectCandidatesForPreferredLongRun([higherScoringMoved, yellowSunday], sundayPreferenceSetup, [0,1,2,3,4,5,6]).candidates.map(item => item.marker), ["yellow-sunday"], "Case 2: a manageable Yellow conflict keeps the Sunday preference");
const orangeSunday = preferenceCandidate(6, "orange", 85, "orange-sunday-upper-moved");
assert.deepEqual(scheduler.selectCandidatesForPreferredLongRun([higherScoringMoved, orangeSunday], sundayPreferenceSetup, [0,1,2,3,4,5,6]).candidates.map(item => item.marker), ["orange-sunday-upper-moved"], "Case 3: a resolvable Orange arrangement keeps Sunday and moves the other session");
const redSunday = preferenceCandidate(6, "red", 80, "red-sunday");
const rearrangedSunday = preferenceCandidate(6, "yellow", 78, "heavy-lower-rearranged");
assert.deepEqual(scheduler.selectCandidatesForPreferredLongRun([higherScoringMoved, redSunday, rearrangedSunday], sundayPreferenceSetup, [0,1,2,3,4,5,6]).candidates.map(item => item.marker), ["heavy-lower-rearranged"], "Case 4: a Red conflict is resolved by selecting the rearranged Sunday candidate");
const impossiblePreference = scheduler.selectCandidatesForPreferredLongRun([higherScoringMoved, redSunday], sundayPreferenceSetup, [0,1,2,3,4,5,6]);
assert.equal(impossiblePreference.candidates.length, 2, "Case 5: an unavoidable Red conflict permits the scheduler to move the long run");
assert.match(impossiblePreference.decision.reason, /unavoidable Red conflict/i, "Case 5: the move includes an explicit reason");
assert.equal(scheduler.selectCandidatesForPreferredLongRun([higherScoringMoved, greenSunday], { schedulingPreferences: { longRunDay: "" } }, [0,1,2,3,4,5,6]).decision, null, "Case 6: no preference leaves normal scoring unchanged");

const preferredDayBase = { ...baseSetup, trainingDays: 6, availableDays: [0, 1, 2, 3, 4, 5, 6], twoADayPreference: "no", schedulingPreferences: { longRunDay: "", heavyLowerDay: "", restDay: "", runningSurface: "Mixed" }, advanced: { ...baseSetup.advanced, maxConsecutiveDays: 7 } };
weekdayIds.forEach((weekday, expectedIndex) => {
  const generated = scheduler.generateHybridSchedule({ ...preferredDayBase, schedulingPreferences: { ...preferredDayBase.schedulingPreferences, longRunDay: weekday } }, [upper, lower, full]);
  const longDay = generated.schedule.find(day => day.sessions.some(session => session.runType === "Long Easy Run"));
  assert.equal(longDay.dayIndex, expectedIndex, `preferred ${weekday} long run stays on ${weekday}`);
  assert.equal(generated.preferenceDecision.honored, true, `${weekday} preference is strongly preserved`);
});

const sundayScenario = scheduler.generateHybridSchedule({ ...preferredDayBase, availableDays: ["monday", "tuesday", "wednesday", "friday", "saturday", "sunday"], schedulingPreferences: { ...preferredDayBase.schedulingPreferences, longRunDay: "sunday" }, advanced: { ...preferredDayBase.advanced, maxConsecutiveDays: 3 } }, [upper, lower, full]);
const sundayLongRun = sundayScenario.schedule.find(day => day.sessions.some(session => session.runType === "Long Easy Run"));
assert.equal(sundayLongRun.day, "Sunday", "Sunday availability and Sunday preference use the same representation");
assert.equal(sundayScenario.preferenceDecision.preferredDayIndex, 6, "Sunday normalizes to Hybrid index 6");

const manageableConflict = scheduler.generateHybridSchedule({ ...preferredDayBase, schedulingPreferences: { ...preferredDayBase.schedulingPreferences, longRunDay: "sunday", heavyLowerDay: "sunday" } }, [upper, lower, full]);
const manageableSunday = manageableConflict.schedule[6];
assert.ok(manageableSunday.sessions.some(session => session.runType === "Long Easy Run"), "long run remains Sunday when another movable preference competes with it");
assert.ok(!manageableSunday.sessions.some(session => session.subtype === "Heavy Lower"), "heavy lower work is rearranged away from the protected Sunday long run");

const impossibleSunday = scheduler.generateHybridSchedule({ ...preferredDayBase, availableDays: [0, 1, 2, 3, 4, 5], trainingDays: 5, schedulingPreferences: { ...preferredDayBase.schedulingPreferences, longRunDay: "sunday" } }, [upper, lower, full]);
assert.equal(impossibleSunday.preferenceDecision.honored, false, "an unavailable Sunday may be moved");
assert.match(impossibleSunday.preferenceDecision.reason, /not selected as an available training day/i, "an unavailable preferred day receives an explicit reason");

const noPreferredLongRun = scheduler.generateHybridSchedule(preferredDayBase, [upper, lower, full]);
assert.equal(noPreferredLongRun.preferenceDecision, null, "without a preferred long-run day the scheduler chooses normally");
for (const priority of ["strength", "balanced", "running", "race"]) {
  const setup = { ...baseSetup, hybridPriority: priority, raceGoal: { enabled: priority === "race", distance: "10K" } };
  const generated = scheduler.generateHybridSchedule(setup, [upper, lower, full]);
  assert.equal(generated.schedule.length, 7);
  assert.ok(generated.alternativesEvaluated > 1);
  assert.ok(generated.loadSummary.strengthSessions >= 2);
  assert.ok(generated.loadSummary.runningSessions >= 1);
  assert.ok(generated.why.length >= 1);
}
const sameDayPair = [{ type: "run", priority: "A" }, { type: "strength", priority: "A" }];
assert.equal(scheduler.orderSameDay(sameDayPair, "strength")[0].type, "strength");
assert.equal(scheduler.orderSameDay(sameDayPair, "running")[0].type, "run");

const compressed = scheduler.generateHybridSchedule({ ...baseSetup, availableDays: [0, 2, 4], twoADayPreference: "yes" }, [upper, lower]);
assert.ok(compressed.schedule.flatMap(day => day.sessions).every(session => session.compressedWeek));
const rolling = scheduler.generateHybridSchedule({ ...baseSetup, scheduleType: "rolling", rollingCycleLength: 8, rollingNormalCycles: 3, twoADayPreference: "no" }, [upper, lower, full]);
assert.equal(rolling.scheduleType, "rolling");
assert.equal(rolling.schedule.length, 8, "rolling cycle keeps the selected numbered length");
assert.ok(rolling.schedule.some(day => day.sessions.every(session => session.type === "rest")), "rolling cycle includes explicit rest days");
assert.ok(rolling.schedule.every((day, index) => day.cycleDay === index + 1 && day.day === `Cycle Day ${index + 1}`), "rolling days use stable numbered labels");
assert.ok(rolling.schedule.every(day => day.sessions.length === 1), "rolling no-two-a-day schedule has one training or rest action per cycle day");
const compressedProgram = { schedule: compressed.schedule, setup: baseSetup, hybridPriority: "balanced" };
const moveSource = compressed.schedule.find(day => day.sessions.length)?.sessions[0];
const moved = scheduler.rescheduleRemainingWeek(compressedProgram, moveSource.id, 6);
const movedIds = moved.program.schedule.flatMap(day => day.sessions.map(session => session.id));
assert.equal(movedIds.filter(value => value === moveSource.id).length, 1, "rescheduling moves one occurrence without duplication");
const noDoubles = scheduler.generateHybridSchedule({ ...baseSetup, trainingDays: 6, availableDays: [0, 1, 2, 3, 4, 5, 6], twoADayPreference: "no" }, [upper, lower, full]);
assert.ok(noDoubles.schedule.every(day => day.sessions.length <= 1), "two-a-days disabled is a hard constraint");
assert.equal(noDoubles.loadSummary.trainingDaysUsed, 6, "six-day Balanced Hybrid uses all six intended training days");
assert.equal(noDoubles.loadSummary.targetTrainingDays, 6, "training-day target is preserved in the summary");
assert.equal(noDoubles.loadSummary.strengthSessions, 3, "six-day Balanced Hybrid keeps three strength sessions");
assert.equal(noDoubles.loadSummary.runningSessions, 3, "six-day Balanced Hybrid keeps three runs");
assert.match(noDoubles.why.join(" "), /6 of 6 intended training days/i, "the schedule explains day use");

const newRunnerSixDay = scheduler.generateHybridSchedule({ ...baseSetup, trainingDays: 6, availableDays: [0, 1, 2, 3, 4, 5, 6], twoADayPreference: "occasionally", runningBaseline: { runsPerWeek: 0, weeklyMileage: 0, longestRun: 0, consistency: "not-running" } }, [upper, lower, full]);
assert.ok(newRunnerSixDay.loadSummary.trainingDaysUsed >= 5, "new runners still receive productive use of most intended days");
assert.ok(newRunnerSixDay.schedule.flatMap(day => day.sessions).filter(session => session.type === "run").every(session => session.runType === "Easy Run" || session.runType === "Long Easy Run"), "new runners do not receive advanced speedwork");

for (const priority of ["strength", "running"]) {
  const sixDay = scheduler.generateHybridSchedule({ ...baseSetup, hybridPriority: priority, trainingDays: 6, availableDays: [0, 1, 2, 3, 4, 5, 6], twoADayPreference: "occasionally" }, [upper, lower, full]);
  assert.ok(sixDay.loadSummary.trainingDaysUsed >= 5, `${priority} priority uses five or six intended training days`);
}

const intentionallyLower = scheduler.generateHybridSchedule({ ...baseSetup, trainingDays: 6, availableDays: [0, 1, 2, 3, 4, 5, 6], twoADayPreference: "no", strengthSessionsTarget: 2, runningSessionsTarget: 2 }, [upper, lower, full]);
assert.equal(intentionallyLower.loadSummary.trainingDaysUsed, 4, "explicitly lower session targets remain respected");
assert.match(intentionallyLower.loadSummary.unusedDaysReason, /explicitly requested/i, "unused target days receive a clear reason");

const noMileageRuns = scheduler.buildRunSessions({ ...baseSetup, runPrescriptionStyle: "distance", runningBaseline: { runsPerWeek: 0, weeklyMileage: 0, longestRun: 0, consistency: "not-running" } }, 3);
assert.ok(noMileageRuns.every(session => session.targetDistance > 0 && session.targetDuration > 0 && session.estimatedDurationLabel && session.rpeTarget), "distance, estimated duration, and RPE exist even without mileage history");
assert.ok(noMileageRuns.find(session => session.runType === "Long Easy Run")?.targetDistance > 0, "long runs always receive a distance target");
const knownPacePrescription = scheduler.calculateRunPrescription("Easy Run", { runningDistanceUnit: "mi", runPrescriptionStyle: "distance", advanced: { knownEasyPace: "10:00/mi" } }, { classification: "developing" }, { targetDistance: 4 });
assert.deepEqual(knownPacePrescription.estimatedDurationRange, { min: 37, max: 43 }, "duration estimation uses a sensible range instead of fake precision");
assert.match(knownPacePrescription.suggestedPaceRange, /\/mi/, "pace guidance is shown when the profile provides enough data");

const thresholdRuns = scheduler.buildRunSessions({ ...baseSetup, runPrescriptionStyle: "distance" }, 3);
const thresholdRun = thresholdRuns.find(session => session.runType === "Threshold");
assert.ok(thresholdRun?.targetDistance > 0 && /3 × 8 min/.test(thresholdRun.structure?.mainSet || ""), "threshold segments coexist with a total distance target");

const metricRuns = scheduler.buildRunSessions({ ...baseSetup, runningDistanceUnit: "km", runPrescriptionStyle: "distance", runningBaseline: { runsPerWeek: 0, weeklyMileage: 0, longestRun: 0, consistency: "not-running" } }, 3);
assert.ok(metricRuns.every(session => session.estimatedDistanceLabel.endsWith(" km")), "metric athletes receive kilometer prescriptions");

const timeBasedRuns = scheduler.buildRunSessions({ ...baseSetup, runPrescriptionStyle: "time", runningBaseline: { runsPerWeek: 0, weeklyMileage: 0, longestRun: 0, consistency: "not-running" } }, 3);
assert.ok(timeBasedRuns.every(session => session.prescriptionStyle === "time" && session.targetDuration > 0 && session.targetDistance > 0), "time-based runs retain an estimated distance");

const inventoryForScore = scheduler.buildSessionInventory({ ...baseSetup, trainingDays: 6, availableDays: [0, 1, 2, 3, 4, 5, 6] }, [upper, lower, full]);
const spreadDays = Array.from({ length: 7 }, (_, dayIndex) => ({ dayIndex, sessions: dayIndex < 6 ? [inventoryForScore[dayIndex]] : [] }));
const compressedDays = Array.from({ length: 7 }, (_, dayIndex) => ({ dayIndex, sessions: dayIndex < 3 ? inventoryForScore.slice(dayIndex * 2, dayIndex * 2 + 2) : [] }));
assert.ok(scheduler.scoreHybridSchedule(spreadDays, { ...baseSetup, trainingDays: 6, availableDays: [0, 1, 2, 3, 4, 5, 6] }).score > scheduler.scoreHybridSchedule(compressedDays, { ...baseSetup, trainingDays: 6, availableDays: [0, 1, 2, 3, 4, 5, 6] }).score, "underuse penalty favors six manageable training days over three compressed days");
const limitedTrainingDays = scheduler.generateHybridSchedule({ ...baseSetup, trainingDays: 3, availableDays: [0, 1, 2, 3, 4, 5, 6], twoADayPreference: "yes" }, [upper, lower, full]);
assert.ok(limitedTrainingDays.schedule.filter(day => day.sessions.length).length <= 3, "availability does not create more training days than selected");
const avoided = scheduler.chooseStrengthWorkouts([upper, lower, full], 2, "balanced", { advanced: { exercisesToAvoid: "Back Squat" } });
assert.ok(avoided.every(item => item.workoutId !== "lower" && item.workoutId !== "full"), "avoided exercises are excluded from selected workouts");
const nearRaceDate = new Date(); nearRaceDate.setDate(nearRaceDate.getDate() + 7);
assert.equal(scheduler.racePhase({ raceGoal: { enabled: true, date: nearRaceDate.toISOString().slice(0, 10) } }).name, "taper");
const noSpeedwork = scheduler.buildRunSessions({ ...baseSetup, advanced: { ...baseSetup.advanced, speedworkPreference: "none" } }, 4);
assert.ok(noSpeedwork.every(session => !/Threshold|Tempo|Intervals|Hills/.test(session.runType)), "no-speedwork preference suppresses formal quality running");
const paceAndHeartRate = scheduler.buildRunSessions({ ...baseSetup, runningIntensityDisplay: "pace-heart-rate-rpe", advanced: { ...baseSetup.advanced, knownEasyPace: "10:00/mi", heartRateZones: "Z2 125–145" } }, 3);
assert.ok(paceAndHeartRate.every(session => session.paceTarget && session.heartRateTarget), "selected intensity guidance reaches run prescriptions");
assert.throws(() => scheduler.generateHybridSchedule({ ...baseSetup, availableDays: [], twoADayPreference: "no" }, [upper]), /available training day/);

const noPain = recovery.calculateRecoveryState({ legs: "fresh", fatigue: "low", sleep: "great", painRating: 0 }, { type: "run" });
assert.equal(noPain.level, 0);
const upperPainDuringRun = recovery.calculateRecoveryState({ legs: "fresh", fatigue: "low", sleep: "great", painRating: 4, painLocation: "Elbow" }, { type: "run", stress: { lowerBody: 2 } });
assert.ok(upperPainDuringRun.level <= 2 && !upperPainDuringRun.localConflict, "unrelated upper pain does not block running");
const heavyLegsUpper = recovery.calculateRecoveryState({ legs: "heavy", fatigue: "normal", sleep: "good", painRating: 0 }, { type: "strength", stress: { lowerBody: 0, upperBody: 4 } });
assert.equal(heavyLegsUpper.level, 0, "heavy legs do not reduce an unrelated upper-body session");
const heavyLegsLower = recovery.calculateRecoveryState({ legs: "heavy", fatigue: "normal", sleep: "good", painRating: 0 }, { type: "strength", stress: { lowerBody: 4, upperBody: 0 } });
assert.equal(heavyLegsLower.level, 3, "heavy legs trigger an adjustment for heavy lower training before rest");
const acute = recovery.calculateRecoveryState({ acuteWarning: true }, { type: "run" });
assert.equal(acute.level, 6);
assert.equal(acute.safetyOverride, true);
const adjusted = recovery.adjustSessionForRecovery({ type: "run", runType: "Threshold", targetDistance: 5 }, { level: 3 });
assert.equal(adjusted.runType, "Easy Run");
assert.equal(adjusted.targetDistance, 4.3);

const runHistory = [0, 1, 2].map(days => ({ date: new Date(Date.now() - days * 86400000).toISOString(), completion: "completed", completedDistance: 3, runType: "Easy Run", rpe: 4 }));
assert.equal(progression.calculateRunningProgression(runHistory, { classification: "developing" }).decision, "PROGRESS");
const painHistory = runHistory.concat({ date: new Date().toISOString(), completion: "partial", completedDistance: 1, runType: "Easy Run", rpe: 7, painRating: 4 });
assert.notEqual(progression.calculateRunningProgression(painHistory, {}).decision, "PROGRESS");
const runningIncrease = { decision: "PROGRESS", volumeMultiplier: 1.08 };
const earnedLower = [{ exerciseId: "squat", exerciseName: "Back Squat", region: "lower" }];
const deferred = progression.calculateHybridProgressionBudget({ priority: "balanced", runningProgression: runningIncrease, strengthEligibility: earnedLower });
assert.equal(deferred[0].deferred, true, "lower-body progression can be deferred without being lost");
const reconsidered = progression.calculateHybridProgressionBudget({ priority: "balanced", runningProgression: { decision: "HOLD", volumeMultiplier: 1 }, deferred });
assert.equal(reconsidered[0].applied, true, "deferred progression returns on a stable week");

console.log("Hybrid engine tests passed: stress, scheduler, progression, and recovery.");
