const assert = require("node:assert/strict");
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
