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
    const workout = { id: "deload-workout", name: "Chest", notes: "Deload regression test", exercises: [exercise] };
    data.history = [{
      id: "prior-session", date: new Date(Date.now() - 7 * 86400000).toISOString(), workoutName: "Chest",
      exercises: [{ exerciseId: exercise.id, name: exercise.name, weight: 200, feedback: "about-right", jointPain: { rating: 1, joints: [] }, sets: [{ done: true, reps: 10 }, { done: true, reps: 10 }, { done: true, reps: 10 }] }]
    }];
    const meso = { id: "deload-meso", includeDeload: true, totalWeeks: 4, scheduleType: "weekly", schedule: [{ dayIndex: new Date().getDay(), workout }], progress: { completed: [], skipped: [], rescheduled: [] } };
    const occurrence = { week: 4, slot: 0, plan: meso.schedule[0] };
    const normalRecommendation = recommendationFor(exercise);
    const adjusted = workoutForMesoSlot(meso, occurrence, true);
    const deloadRecommendation = recommendationFor(adjusted.exercises[0]);
    openWorkoutPreview(adjusted, { originalWorkout: workout, adjustmentReason: "Deload week: sets and load are reduced and target RIR is increased." });
    const previewText = document.querySelector("#workoutPreviewContent").innerText;
    beginWorkout(adjusted.id, null, { mesocycleId: meso.id, scheduleType: "weekly", week: 4, slot: 0 });
    return {
      normalWeight: normalRecommendation.weight,
      reducedStartWeight: adjusted.exercises[0].startWeight,
      recommendedWeight: deloadRecommendation.weight,
      decision: deloadRecommendation.progressionDecision?.action,
      previewText,
      liveWeight: currentSession.exercises[0].weight,
      liveSets: currentSession.exercises[0].sets.length,
      liveRir: currentSession.exercises[0].targetRir
    };
  });

  assert.equal(result.normalWeight, 205, "normal progression would increase the prior 200 lb result to 205 lb");
  assert.equal(result.reducedStartWeight, 165, "deload reduces the planned 195 lb load by 15 percent and rounds to the available increment");
  assert.equal(result.recommendedWeight, 165, "normal progression cannot override the deload load cap");
  assert.equal(result.decision, "deload", "the recommendation is explicitly recorded as a deload instead of normal progression");
  assert.match(result.previewText, /Recommended weight:\s*165 lb/i, "preview shows the reduced deload weight");
  assert.match(result.previewText, /Adjusted:\s*2 sets at 165 lb, RIR 4/i, "preview explains the reduced sets, load, and increased RIR");
  assert.equal(result.liveWeight, 165, "the live workout starts with the reduced deload weight");
  assert.equal(result.liveSets, 2, "the live workout keeps the reduced deload set count");
  assert.equal(result.liveRir, 4, "the live workout keeps the increased deload RIR");
  assert.deepEqual(pageErrors, [], `browser emitted errors: ${pageErrors.join(" | ")}`);
  await browser.close();
  console.log(JSON.stringify({ status: "PASS", ...result, pageErrors }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
