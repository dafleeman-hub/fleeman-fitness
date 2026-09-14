const assert = require("node:assert/strict");
const reasons = require("../progression-reasons.js");
const progression = require("../hybrid-progression.js");

const recentRun = (daysAgo, overrides = {}) => ({
  date: new Date(Date.now() - daysAgo * 86400000).toISOString(),
  completion: "completed",
  completedDistance: 4,
  durationMinutes: 40,
  runType: "Easy Run",
  rpe: 4,
  painRating: 0,
  ...overrides
});

const goodHistory = [recentRun(1), recentRun(3), recentRun(5, { runType: "Long Easy Run", completedDistance: 7 })];
const goodProgression = progression.calculateRunningProgression(goodHistory, { classification: "developing" });
assert.equal(goodProgression.decision, "PROGRESS", "good completion still uses the existing progression decision");
assert.ok(goodProgression.explanation.shortText, "progression includes a concise reason");

const longRunReason = reasons.running("PROGRESS", goodProgression.summary, { sessionType: "long-run" });
assert.equal(longRunReason.code, reasons.CODES.LONG_RUN_COMPLETED_WELL, "long-run progression receives a long-run-specific reason");

const runningHold = reasons.running("HOLD", goodProgression.summary, { runLoadAlreadyIncreased: true });
assert.equal(runningHold.code, reasons.CODES.RUN_LOAD_ALREADY_INCREASED, "a running-load hold explains the already-applied increase");

const deferredStrength = progression.calculateHybridProgressionBudget({
  priority: "balanced",
  runningProgression: { decision: "PROGRESS", volumeMultiplier: 1.08, longRunIncreased: true },
  strengthEligibility: [{ exerciseId: "squat", exerciseName: "Back Squat", region: "lower", previousWeight: 275, newWeight: 280 }]
});
assert.equal(deferredStrength[0].deferred, true, "the existing Hybrid coordinator still defers the lower-body progression");
assert.equal(deferredStrength[0].explanation.code, reasons.CODES.LONG_RUN_INCREASED, "deferred Strength progression identifies the long-run increase");

const lowerStrengthHold = reasons.running("HOLD", goodProgression.summary, { lowerBodyStrengthIncreased: true });
assert.equal(lowerStrengthHold.code, reasons.CODES.LOWER_STRENGTH_INCREASED, "a running hold can identify increased lower-body Strength load");

const fatigueHistory = [
  recentRun(1, { completion: "partial", partialReason: "Fatigue" }),
  recentRun(3, { completion: "partial", partialReason: "Fatigue" }),
  recentRun(5, { completion: "completed" })
];
const fatigueDecision = progression.calculateRunningProgression(fatigueHistory, {});
assert.equal(fatigueDecision.decision, "CUT BACK", "fatigue keeps the existing cut-back decision");
assert.equal(fatigueDecision.explanation.code, reasons.CODES.HIGH_RECENT_FATIGUE, "fatigue is the primary cut-back reason");

const recoveryDecision = progression.weeklyDecision({ runHistory: goodHistory, recoveryWeeks: 2 });
assert.equal(recoveryDecision.decision, "RECOVERY WEEK", "sustained recovery state still triggers recovery week");
assert.equal(recoveryDecision.explanation.code, reasons.CODES.RECOVERY_WEEK_TRIGGERED, "recovery week receives the recovery reason");

const painHistory = [...goodHistory, recentRun(0, { painRating: 4 })];
const painDecision = progression.calculateRunningProgression(painHistory, {});
assert.notEqual(painDecision.decision, "PROGRESS", "pain still overrides progression");
assert.equal(painDecision.explanation.code, reasons.CODES.PAIN_REPORTED, "pain takes priority over positive completion reasons");

const persisted = JSON.parse(JSON.stringify({ week: 4, decision: goodProgression.decision, explanation: goodProgression.explanation }));
assert.deepEqual(persisted.explanation, goodProgression.explanation, "a stored progression reason remains stable after reload serialization");

const deterministicA = progression.calculateRunningProgression(goodHistory, { classification: "developing" });
const deterministicB = progression.calculateRunningProgression(goodHistory, { classification: "developing" });
assert.deepEqual(deterministicA, deterministicB, "identical inputs produce the same decision and reason");

Object.values(reasons.TEMPLATES).forEach(([shortText]) => {
  const words = shortText.trim().split(/\s+/).length;
  assert.ok(words >= 5 && words <= 12, `short reason stays within 5-12 words: ${shortText}`);
});

console.log("Progression reason tests passed: 10 decision, priority, persistence, and determinism scenarios.");
