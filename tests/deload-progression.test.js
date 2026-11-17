let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("SKIP Deload progression test: Playwright is not on this Node.js module path."); process.exit(0); }
const assert = require("node:assert/strict");

const url = process.env.FLEEMAN_TEST_URL || "http://127.0.0.1:8810/";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") pageErrors.push(message.text()); });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator("#dismissOnboardingButton").click().catch(() => {});

  const result = await page.evaluate(() => {
    currentSession = null;
    clearSavedActiveWorkout();
    const exercise = {
      id: "deload-bench", name: "Barbell Bench Press", muscle: "Chest", sets: 3,
      minReps: 6, maxReps: 10, startWeight: 195, targetRir: 3, rest: 150, increment: 5,
      progressionMode: "load", weightEntryType: "Total Weight"
    };
    const ropePushdown = {
      id: "deload-rope-pushdown", name: "Rope Pushdown", muscle: "Triceps", sets: 3,
      minReps: 10, maxReps: 15, startWeight: 10, targetRir: 2, rest: 90, increment: 2.5,
      progressionMode: "load", weightEntryType: "Machine Stack",
      startingWeightRecommendation: { weight: 10, label: "Based on your previous mesocycle", reason: "Stored prescription", confidence: "high", calibrationRecommended: false }
    };
    const fallbackExercise = {
      id: "deload-no-history", name: "No History Exercise", muscle: "Chest", sets: 3,
      minReps: 8, maxReps: 12, startWeight: 100, targetRir: 3, rest: 90, increment: 5,
      progressionMode: "load", weightEntryType: "Total Weight",
      startingWeightRecommendation: { weight: 10, label: "Stale saved recommendation", reason: "Regression fixture", confidence: "medium", calibrationRecommended: false }
    };
    const workout = { id: "deload-workout", name: "Chest and Triceps", notes: "Deload regression test", exercises: [exercise, ropePushdown] };
    data.history = [{
      id: "prior-session", date: new Date(Date.now() - 7 * 86400000).toISOString(), workoutName: "Chest",
      exercises: [
        { exerciseId: exercise.id, name: exercise.name, weight: 200, feedback: "about-right", jointPain: { rating: 1, joints: [] }, sets: [{ done: true, reps: 10 }, { done: true, reps: 10 }, { done: true, reps: 10 }] },
        { exerciseId: ropePushdown.id, name: ropePushdown.name, weight: 70.5, feedback: "about-right", jointPain: { rating: 1, joints: [] }, sets: [{ done: true, reps: 15, weight: 70.5 }, { done: true, reps: 11, weight: 70.5 }, { done: true, reps: 11, weight: 70.5 }] }
      ]
    }];
    const meso = { id: "deload-meso", includeDeload: true, totalWeeks: 4, scheduleType: "weekly", schedule: [{ dayIndex: new Date().getDay(), workout }], progress: { completed: [], skipped: [], rescheduled: [] } };
    const occurrence = { week: 4, slot: 0, plan: meso.schedule[0] };
    const normalRecommendation = recommendationFor(exercise);
    const adjusted = workoutForMesoSlot(meso, occurrence, true);
    const deloadRecommendation = recommendationFor(adjusted.exercises[0]);
    const ropeRecommendation = recommendationFor(adjusted.exercises[1]);
    const fallbackWorkout = workoutForMesoSlot({ ...meso, schedule: [{ dayIndex: new Date().getDay(), workout: { id: "fallback-workout", name: "Fallback", exercises: [fallbackExercise] } }] }, { week: 4, slot: 0, plan: { workout: { id: "fallback-workout", name: "Fallback", exercises: [fallbackExercise] } } }, false);
    const rollingMeso = { id: "rolling-deload-meso", scheduleType: "rolling", normalCycles: 1, deloadMode: "final-cycle", cycleLength: 1, schedule: [{ dayType: "training", workout }], progress: { completed: [], skipped: [], restCompleted: [], extraRestDays: [], rescheduled: [] } };
    const rollingOccurrence = { cycle: 2, week: 2, slot: 0, day: 1, phase: "deload", plan: rollingMeso.schedule[0] };
    const rollingAdjusted = workoutForMesoSlot(rollingMeso, rollingOccurrence, false);
    const rollingRopeRecommendation = recommendationFor(rollingAdjusted.exercises[1]);
    openWorkoutPreview(adjusted, { originalWorkout: workout, adjustmentReason: "Deload week: sets and load are reduced and target RIR is increased." });
    const previewText = document.querySelector("#workoutPreviewContent").innerText;
    beginWorkout(adjusted.id, null, { mesocycleId: meso.id, scheduleType: "weekly", week: 4, slot: 0 });
    const weeklyLive = {
      weight: currentSession.exercises[0].weight,
      ropeWeight: currentSession.exercises[1].weight,
      sets: currentSession.exercises[0].sets.length,
      rir: currentSession.exercises[0].targetRir
    };
    currentSession = null;
    clearSavedActiveWorkout();
    const hybridExercise = {
      id: "hybrid-no-history", name: "Hybrid No History Press", muscle: "Chest", sets: 3,
      minReps: 8, maxReps: 12, startWeight: 0, targetRir: 3, rest: 90, increment: 5,
      progressionMode: "load", weightEntryType: "Total Weight",
      startingWeightRecommendation: { weight: 45, label: "Calculated starting recommendation", reason: "Regression fixture", confidence: "medium", calibrationRecommended: false }
    };
    const hybridWorkout = { id: "hybrid-hold-workout", name: "Hybrid Hold", notes: "Hybrid hold regression test", exercises: [hybridExercise] };
    ensureWorkoutTemplate(hybridWorkout);
    beginWorkout(hybridWorkout.id, null, { scheduleType: "hybrid", hybridProgramId: "hybrid-regression", week: 2, hybridAdjustment: { holdProgression: true, volumeMultiplier: 1 } });
    const hybridHeldWeight = currentSession.exercises[0].weight;
    return {
      normalWeight: normalRecommendation.weight,
      reducedStartWeight: adjusted.exercises[0].startWeight,
      recommendedWeight: deloadRecommendation.weight,
      decision: deloadRecommendation.progressionDecision?.action,
      baselineSource: adjusted.exercises[0].deloadPrescription.baselineSource,
      ropeReducedStartWeight: adjusted.exercises[1].startWeight,
      ropeRecommendedWeight: ropeRecommendation.weight,
      ropeBaselineSource: adjusted.exercises[1].deloadPrescription.baselineSource,
      fallbackReducedStartWeight: fallbackWorkout.exercises[0].startWeight,
      fallbackRecommendedWeight: recommendationFor(fallbackWorkout.exercises[0]).weight,
      fallbackBaselineSource: fallbackWorkout.exercises[0].deloadPrescription.baselineSource,
      rollingRopeReducedStartWeight: rollingAdjusted.exercises[1].startWeight,
      rollingRopeRecommendedWeight: rollingRopeRecommendation.weight,
      rollingRopeDecision: rollingRopeRecommendation.progressionDecision?.action,
      rollingRopeBaselineSource: rollingAdjusted.exercises[1].deloadPrescription?.baselineSource,
      previewText,
      liveWeight: weeklyLive.weight,
      liveRopeWeight: weeklyLive.ropeWeight,
      liveSets: weeklyLive.sets,
      liveRir: weeklyLive.rir,
      hybridHeldWeight
    };
  });

  assert.equal(result.normalWeight, 205, "normal progression would increase the prior 200 lb result to 205 lb");
  assert.equal(result.reducedStartWeight, 170, "deload reduces the latest completed 200 lb working load by 15 percent");
  assert.equal(result.recommendedWeight, 170, "normal progression cannot override the history-based deload load cap");
  assert.equal(result.baselineSource, "exercise-history", "deload records that completed history supplied the load baseline");
  assert.equal(result.decision, "deload", "the recommendation is explicitly recorded as a deload instead of normal progression");
  assert.equal(result.ropeReducedStartWeight, 60, "70.5 lb history produces a sensible 60 lb deload load instead of the stale 7.5 lb cap");
  assert.equal(result.ropeRecommendedWeight, 60, "the 70.5 lb to 60 lb fix reaches the final recommendation");
  assert.equal(result.ropeBaselineSource, "exercise-history", "the Rope Pushdown deload uses exercise history");
  assert.equal(result.fallbackReducedStartWeight, 85, "an exercise without history still falls back to its 100 lb planned prescription");
  assert.equal(result.fallbackRecommendedWeight, 85, "a stale starting recommendation cannot undercut a no-history deload prescription");
  assert.equal(result.fallbackBaselineSource, "planned-prescription", "the fallback source is recorded explicitly");
  assert.equal(result.rollingRopeReducedStartWeight, 60, "Rolling Cycle deloads use the latest 70.5 lb working load");
  assert.equal(result.rollingRopeRecommendedWeight, 60, "normal progression cannot override a Rolling Cycle deload cap");
  assert.equal(result.rollingRopeDecision, "deload", "Rolling Cycle recommendations are explicitly marked as deload decisions");
  assert.equal(result.rollingRopeBaselineSource, "exercise-history", "Rolling Cycle records exercise history as the baseline source");
  assert.match(result.previewText, /Recommended weight:\s*170 lb/i, "preview shows the reduced history-based deload weight");
  assert.match(result.previewText, /Original:\s*3 sets at 200 lb, RIR 3/i, "preview compares the deload against the latest completed Bench Press load");
  assert.match(result.previewText, /Adjusted:\s*2 sets at 170 lb, RIR 4/i, "preview explains the reduced sets, load, and increased RIR");
  assert.match(result.previewText, /Recommended weight:\s*60 lb/i, "preview shows the corrected Rope Pushdown deload weight");
  assert.match(result.previewText, /Original:\s*3 sets at 70\.5 lb, RIR 2/i, "preview compares Rope Pushdown against the actual 70.5 lb working load");
  assert.equal(result.liveWeight, 170, "the live workout starts with the history-based reduced deload weight");
  assert.equal(result.liveRopeWeight, 60, "the live Rope Pushdown starts at the corrected deload weight");
  assert.equal(result.liveSets, 2, "the live workout keeps the reduced deload set count");
  assert.equal(result.liveRir, 4, "the live workout keeps the increased deload RIR");
  assert.equal(result.hybridHeldWeight, 45, "a Hybrid progression hold uses the calculated 45 lb recommendation instead of a saved zero");
  assert.deepEqual(pageErrors, [], `browser emitted errors: ${pageErrors.join(" | ")}`);
  await browser.close();
  console.log(JSON.stringify({ status: "PASS", ...result, pageErrors }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
