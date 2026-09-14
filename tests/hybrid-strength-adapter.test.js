const assert = require("node:assert/strict");
const adapter = require("../hybrid-strength-adapter.js");
const stress = require("../hybrid-stress.js");
const scheduler = require("../hybrid-scheduler.js");

const upper = { id: "saved-upper", name: "Upper", exercises: [{ id: "bench", name: "Bench Press", primaryMuscle: "Chest", sets: 4, targetRir: 2 }] };
const lower = { id: "saved-lower", name: "Lower", exercises: [{ id: "squat", name: "Back Squat", primaryMuscle: "Quads", sets: 4, targetRir: 2 }, { id: "rdl", name: "Romanian Deadlift", primaryMuscle: "Hamstrings", sets: 4, targetRir: 2 }] };
const full = { id: "saved-full", name: "Full Body", exercises: [...upper.exercises, { id: "goblet", name: "Goblet Squat", primaryMuscle: "Quads", sets: 2, targetRir: 3 }] };

const originals = JSON.stringify([upper, lower, full]);
const selected = adapter.snapshotSavedWorkouts([upper, lower, full], [upper.id, lower.id, full.id]);
assert.equal(selected.length, 3, "saved Strength workouts are selected without recreation");
assert.notEqual(selected[0], upper, "Hybrid receives an independent workout object");
selected[0].name = "Edited Hybrid Upper";
assert.equal(JSON.stringify([upper, lower, full]), originals, "editing a Hybrid snapshot leaves the original Strength workouts intact");

const highLower = adapter.analyzeStrengthWorkoutForHybrid(lower, stress);
const lowLower = adapter.analyzeStrengthWorkoutForHybrid(full, stress);
assert.ok(highLower.stress.lowerBody > lowLower.stress.lowerBody, "actual exercise contents distinguish high- and modest-lower-stress workouts");
assert.match(highLower.classification, /Lower/, "high-stress Lower is classified from content");

const fakeTemplate = {
  id: "test-template",
  schedule: [
    { workout: { name: "Template Upper", focus: "Upper", exercises: [{ exerciseId: "bench", sets: 3 }] } },
    { workout: { name: "Template Lower", focus: "Lower", exercises: [{ exerciseId: "squat", sets: 3 }] } },
    { workout: { name: "Template Full", focus: "Full", exercises: [{ exerciseId: "row", sets: 3 }] } }
  ]
};
const catalog = {
  bench: { id: "bench", name: "Bench Press", primaryMuscle: "Chest" },
  squat: { id: "squat", name: "Back Squat", primaryMuscle: "Quads" },
  row: { id: "row", name: "Cable Row", primaryMuscle: "Back" }
};
const convert = item => ({ ...catalog[item.exerciseId], sets: item.sets, minReps: 8, maxReps: 12, targetRir: 3, rest: 90 });
const generated = adapter.buildStrengthForMe("balanced", [fakeTemplate], convert);
assert.equal(generated.length, 3, "Build Strength For Me creates the Balanced three-workout structure");
assert.ok(generated.every(workout => workout.exercises.length), "automatic Strength workouts contain real exercises rather than placeholders");

const setup = {
  hybridPriority: "balanced",
  strengthSourceMode: "mine",
  selectedStrengthWorkoutCount: 3,
  strengthSessionsTarget: 3,
  runningSessionsTarget: 3,
  trainingDays: 6,
  availableDays: [0, 1, 2, 4, 5, 6],
  twoADayPreference: "no",
  runningBaseline: { runsPerWeek: 3, weeklyMileage: 16, longestRun: 6, consistency: "3-12-months" },
  schedulingPreferences: { longRunDay: "sunday", runningSurface: "Mixed" },
  advanced: { maximumRunningDays: 5, maxConsecutiveDays: 3 }
};
const selectedForSchedule = adapter.snapshotSavedWorkouts([upper, lower, full], [upper.id, lower.id, full.id]);
const plan = scheduler.generateHybridSchedule(setup, selectedForSchedule);
const sessions = plan.schedule.flatMap(day => day.sessions);
assert.equal(sessions.filter(session => session.type === "strength").length, 3, "all selected custom Strength workouts survive scheduling");
assert.equal(sessions.filter(session => session.type === "run").length, 3, "Balanced six-day plan includes three runs");
assert.equal(plan.loadSummary.trainingDaysUsed, 6, "Balanced custom plan uses all six intended training days");
assert.equal(plan.schedule.find(day => day.sessions.some(session => session.runType === "Long Easy Run")).day, "Sunday", "Sunday Long Run remains strongly preserved");
assert.ok(sessions.filter(session => session.type === "run").every(session => session.targetDistance && session.estimatedDurationLabel && session.rpeTarget), "run prescriptions include distance, estimated duration, and RPE");

const changed = { ...selectedForSchedule[2], exercises: [...selectedForSchedule[2].exercises, ...lower.exercises.map(exercise => ({ ...exercise, id: `${exercise.id}-added`, sets: 5 }))] };
const before = adapter.analyzeStrengthWorkoutForHybrid(selectedForSchedule[2], stress);
const after = adapter.analyzeStrengthWorkoutForHybrid(changed, stress);
assert.ok(after.stress.lowerBody > before.stress.lowerBody, "editing a scheduled workout recalculates lower-body stress");

console.log("Hybrid Strength adapter tests passed.");
