let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("SKIP Hybrid browser test: Playwright is not on this Node.js module path."); process.exit(0); }
const assert = require("node:assert/strict");

const url = process.env.FLEEMAN_TEST_URL || "http://127.0.0.1:8803/";
const mobileWidths = [320, 360, 375, 390, 430];
const desktopWidths = [1024, 1280, 1440];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") pageErrors.push(message.text()); });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator("#dismissOnboardingButton").click();

  await page.locator('[data-dock-view="programsView"]').click();
  await page.locator('[data-build-mode="hybrid"]').click();
  assert.equal(await page.locator("#hybridProgramCards .program-mode-card").count(), 4, "all four Hybrid priorities render");
  await page.locator('[data-profile-id="balanced-hybrid"]').click();
  assert.equal(await page.locator("#hybridBuilderProgress span").count(), 9, "nine-step progress renders");
  assert.ok(await page.locator("#hybridBuilderBody >> text=STEP 1 OF 9").count(), "step 1 rendered");
  await page.locator("#hybridBuilderNext").click();
  assert.ok(await page.locator("#hybridBuilderBody >> text=STEP 2 OF 9").count(), "step 2 rendered before draft close");
  await page.locator("#closeHybridBuilderButton").click();
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator("#dismissOnboardingButton").click().catch(() => {});
  await page.locator('[data-dock-view="programsView"]').click();
  await page.locator('[data-build-mode="hybrid"]').click();
  await page.locator('[data-profile-id="balanced-hybrid"]').click();
  assert.ok(await page.locator("#hybridBuilderBody >> text=STEP 2 OF 9").count(), "builder draft restores at the saved step after reload");
  for (let step = 2; step < 9; step++) {
    assert.ok(await page.locator(`#hybridBuilderBody >> text=STEP ${step} OF 9`).count(), `step ${step} rendered`);
    await page.locator("#hybridBuilderNext").click();
  }
  assert.ok(await page.locator("#hybridBuilderBody details.advanced-options:not([open])").count(), "advanced options start collapsed");
  await page.locator("#hybridBuilderNext").click();
  await page.locator("#hybridProgramDialog").waitFor({ state: "visible" });
  assert.equal(await page.locator("#hybridProgramBody .hybrid-day-card").count(), 7, "generated plan contains seven calendar days");
  assert.match(await page.locator("#hybridProgramBody").innerText(), /Why this schedule/i);
  assert.match(await page.locator("#hybridProgramBody").innerText(), /candidate schedules were scored/i);
  await page.locator('[data-program-action="start"]').click();
  await page.locator("#closeHybridProgramButton").click();
  await page.locator('[data-dock-view="homeView"]').click();
  assert.doesNotMatch(await page.locator("#todaySessionBadge").innerText(), /MISSED/, "midweek activation does not make earlier days missed");

  await page.evaluate(() => {
    const program = data.hybridPrograms.active;
    const sessions = program.schedule.flatMap(day => day.sessions);
    const strength = sessions.find(session => session.type === "strength");
    const run = sessions.find(session => session.type === "run");
    const todayIndex = (new Date().getDay() + 6) % 7;
    program.schedule.forEach(day => { day.sessions = []; day.sessionType = "rest"; });
    program.schedule[todayIndex].sessions = FleemanHybridScheduler.orderSameDay([strength, run], program.hybridPriority);
    program.schedule[todayIndex].sessionType = "hybrid";
    program.progress.completed = [];
    program.progress.skipped = [];
    saveData(); renderHome();
  });
  assert.match(await page.locator("#todaySessionBadge").innerText(), /HYBRID DAY/);
  assert.equal(await page.locator("#startWorkoutButton").isVisible(), true);
  assert.equal(await page.locator("#previewTodayWorkoutButton").isVisible(), true);
  assert.match(`${await page.locator("#startWorkoutButton").innerText()} ${await page.locator("#previewTodayWorkoutButton").innerText()}`, /Start Strength/i);
  assert.match(`${await page.locator("#startWorkoutButton").innerText()} ${await page.locator("#previewTodayWorkoutButton").innerText()}`, /Start Run/i);

  await page.evaluate(() => {
    const program = data.hybridPrograms.active;
    const run = program.schedule.flatMap(day => day.sessions.map(session => ({ day, session }))).find(item => item.session.type === "run");
    data.activeRunSession = {
      id: "browser-test-run", startedAt: new Date().toISOString(),
      context: { programId: program.id, week: 1, dayIndex: run.day.dayIndex, occurrenceId: `1:${run.day.dayIndex}:${run.session.id}` },
      planned: run.session, form: {}
    };
    saveData(); renderHome();
  });
  assert.equal(await page.locator("#startWorkoutButton").innerText(), "RESUME RUN");
  await page.locator("#startWorkoutButton").click();
  await page.locator('#runSessionForm [name="durationMinutes"]').fill("30");
  await page.locator('#runSessionForm [name="completedDistance"]').fill("2.5");
  await page.locator('#runSessionForm [name="rpe"]').fill("4");
  await page.locator("#runSessionForm button[type='submit']").click();
  await page.locator('[data-dock-view="historyView"]').click();
  assert.match(await page.locator("#historyList").innerText(), /RUN/);
  assert.match(await page.locator("#historyList").innerText(), /2.5 mi/);

  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator("#dismissOnboardingButton").click().catch(() => {});
  await page.locator('[data-dock-view="programsView"]').click();
  await page.locator('[data-build-mode="hybrid"]').click();
  assert.match(await page.locator("#activeHybridProgram").innerText(), /ACTIVE HYBRID PROGRAM/);
  const migration = await page.evaluate(() => {
    const legacy = structuredClone(data);
    const workoutCount = legacy.workouts.length;
    delete legacy.hybridPrograms;
    delete legacy.hybridBuilderDraft;
    delete legacy.hybridReadinessHistory;
    delete legacy.runHistory;
    const merged = mergeWithDefaults(legacy);
    return { workoutCount, mergedWorkoutCount: merged.workouts.length, hybridPrograms: merged.hybridPrograms, runHistory: merged.runHistory };
  });
  assert.equal(migration.mergedWorkoutCount, migration.workoutCount, "legacy workout data remains intact during migration");
  assert.ok(Array.isArray(migration.hybridPrograms.drafts) && Array.isArray(migration.runHistory), "older backups receive safe Hybrid defaults");

  await page.locator('[data-profile-id="running-priority"]').click();
  await page.locator("#hybridBuilderNext").click();
  await page.locator('input[name="scheduleType"][value="rolling"]').check();
  await page.locator('input[name="rollingCycleLength"]').fill("8");
  await page.locator('input[name="rollingNormalCycles"]').fill("2");
  await page.locator("#hybridBuilderNext").click();
  for (let step = 3; step < 9; step++) {
    assert.ok(await page.locator(`#hybridBuilderBody >> text=STEP ${step} OF 9`).count(), `rolling builder step ${step} rendered`);
    await page.locator("#hybridBuilderNext").click();
  }
  assert.match(await page.locator("#hybridBuilderBody .builder-review-card").innerText(), /8 rolling days × 2 cycles/i);
  await page.locator("#hybridBuilderNext").click();
  assert.match(await page.locator("#hybridProgramBody").innerText(), /ROLLING CYCLE/i);
  assert.equal(await page.locator("#hybridProgramBody .hybrid-day-card").count(), 8, "rolling review contains eight numbered cycle days");
  assert.match(await page.locator("#hybridProgramBody").innerText(), /Rest Day/i);
  await page.locator("#closeHybridProgramButton").click();
  const rollingRest = await page.evaluate(() => {
    const program = data.hybridPrograms.drafts.find(item => item.scheduleType === "rolling");
    data.hybridPrograms.active = program;
    data.hybridPrograms.drafts = data.hybridPrograms.drafts.filter(item => item.id !== program.id);
    program.status = "active";
    program.startDate = new Date().toISOString().slice(0, 10);
    const restDay = program.schedule.find(day => day.sessions.every(session => session.type === "rest"));
    program.progress.completed = program.schedule.filter(day => day.dayIndex < restDay.dayIndex).flatMap(day => day.sessions.map(session => ({ occurrenceId: `1:${day.dayIndex}:${session.id}`, sessionId: session.id, week: 1, cycle: 1, completion: "completed", date: new Date().toISOString() })));
    program.progress.skipped = [];
    saveData(); renderHome();
    return { programId: program.id, restDayIndex: restDay.dayIndex, restSessionId: restDay.sessions[0].id };
  });
  await page.locator('[data-dock-view="homeView"]').click();
  assert.match(await page.locator("#startWorkoutButton").innerText(), /Complete Rest Day/i);
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#startWorkoutButton").click();
  const restAdvanced = await page.evaluate(({ programId, restDayIndex, restSessionId }) => data.hybridPrograms.active.id === programId && data.hybridPrograms.active.progress.completed.some(item => item.occurrenceId === `1:${restDayIndex}:${restSessionId}`), rollingRest);
  assert.equal(restAdvanced, true, "completing an explicit rest day advances rolling progress");

  for (const width of [...mobileWidths, ...desktopWidths]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await page.locator('[data-dock-view="homeView"]').click();
    const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(overflow.document <= overflow.viewport + 1 && overflow.body <= overflow.viewport + 1, `no page overflow at ${width}px: ${JSON.stringify(overflow)}`);
    await page.locator('[data-dock-view="programsView"]').click();
    await page.locator('[data-build-mode="hybrid"]').click();
    const cards = await page.locator("#hybridProgramCards .program-mode-card").count();
    assert.equal(cards, 4, `Hybrid priority cards stay available at ${width}px`);
  }

  await browser.close();
  assert.deepEqual(pageErrors, [], `browser emitted errors: ${pageErrors.join(" | ")}`);
  console.log(JSON.stringify({ status: "PASS", url, builderSteps: 9, priorities: 4, mobileWidths, desktopWidths, persistence: true, runHistory: true, pageErrors }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
