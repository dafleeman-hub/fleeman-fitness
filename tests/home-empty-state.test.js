let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("SKIP Home empty-state test: Playwright is not on this Node.js module path."); process.exit(0); }
const assert = require("node:assert/strict");

const url = process.env.FLEEMAN_TEST_URL || "http://127.0.0.1:8812/";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") pageErrors.push(message.text()); });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator("#dismissOnboardingButton").click().catch(() => {});

  assert.equal(await page.locator("#todaySessionBadge").innerText(), "NO ACTIVE TRAINING PLAN");
  assert.equal(await page.locator("#todayMesoMeta").innerText(), "SCHEDULE OPEN");
  assert.equal(await page.locator("#todayWorkoutName").innerText(), "READY FOR YOUR NEXT BLOCK?");
  assert.ok(await page.locator("#noActivePlanActions").isVisible(), "empty-state actions are visible");
  assert.equal(await page.locator("#homeView .hero-actions").isVisible(), false, "saved-workout hero actions are hidden");
  assert.notEqual(await page.locator("#todayWorkoutName").innerText(), "Push A", "selected saved workout is not promoted as today's plan");
  assert.equal(await page.locator("#reviewLastMesocycleFromHomeButton").isVisible(), false, "review button stays hidden before a completed mesocycle exists");
  for (const width of [320, 360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${width}px Home has no horizontal overflow (${overflow}px)`);
    assert.ok(await page.locator("#buildNewPlanFromHomeButton").isVisible(), `${width}px keeps the primary action visible`);
  }

  await page.locator("#buildNewPlanFromHomeButton").click();
  assert.ok(await page.locator("#programsView").evaluate(element => element.classList.contains("active")), "Build button opens Build");
  await page.locator('[data-dock-view="homeView"]').click();
  await page.locator("#oneTimeWorkoutFromHomeButton").click();
  assert.ok(await page.locator("#builderView").evaluate(element => element.classList.contains("active")), "one-time button opens Library");
  assert.ok(await page.locator('[data-library-panel="workouts"]').evaluate(element => element.classList.contains("active")), "one-time button opens saved workouts");

  await page.evaluate(() => {
    data.mesocycles.completed.unshift({ id: "completed-test", name: "Completed Test", totalWeeks: 4, daysPerWeek: 3, schedule: [], progress: { completed: [], skipped: [] }, status: "completed" });
    saveData();
  });
  await page.locator('[data-dock-view="homeView"]').click();
  assert.ok(await page.locator("#reviewLastMesocycleFromHomeButton").isVisible(), "review button appears when a completed mesocycle exists");
  await page.locator("#reviewLastMesocycleFromHomeButton").click();
  assert.ok(await page.locator("#historyView").evaluate(element => element.classList.contains("active")), "review button opens History");
  assert.equal((await page.locator("#completedMesocycles .mesocycle-card").first().locator("h3").innerText()).toLowerCase(), "completed test");

  await page.locator('[data-dock-view="homeView"]').click();
  assert.deepEqual(pageErrors, [], `no browser errors: ${pageErrors.join(" | ")}`);
  await browser.close();
  console.log("Home empty-state browser test passed.");
})().catch(error => { console.error(error); process.exitCode = 1; });
