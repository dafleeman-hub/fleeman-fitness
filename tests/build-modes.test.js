const assert = require("node:assert/strict");
const { modes, profiles, normalizeMode, profileFor, createDraft } = require("../build-modes.js");

assert.deepEqual(modes, ["strength", "hybrid", "marathon"], "all three build categories are present");
assert.equal(normalizeMode("hybrid"), "hybrid", "known modes are preserved");
assert.equal(normalizeMode("unknown"), "strength", "unknown modes safely return to Strength");

assert.deepEqual(
  profiles.hybrid.map(profile => profile.name),
  ["Strength Priority", "Balanced Hybrid", "Running Priority", "Race Hybrid"],
  "hybrid choices match the approved product structure"
);
assert.deepEqual(
  profiles.marathon.map(profile => profile.name),
  ["First Marathon", "Intermediate", "Advanced"],
  "marathon choices match the approved product structure"
);

assert.equal(profileFor("hybrid", "balanced-hybrid").defaultGoal, "Balanced strength and running");
assert.equal(profileFor("marathon", "missing"), null, "unknown profiles do not silently select another plan");

const createdAt = "2026-09-10T12:00:00.000Z";
const draft = createDraft("hybrid", "strength-priority", { liftingDays: 4, runningDays: 2 }, createdAt);
assert.equal(draft.programMode, "hybrid");
assert.equal(draft.profileId, "strength-priority");
assert.equal(draft.status, "setup-draft");
assert.equal(draft.setup.liftingDays, 4);
assert.equal(draft.setup.runningDays, 2);
assert.equal(draft.updatedAt, createdAt);

assert.throws(() => createDraft("marathon", "missing"), /Unknown program setup profile/);

console.log("Build-mode unit tests passed.");
