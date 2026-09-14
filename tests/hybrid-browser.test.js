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

  const strengthProgressionReason = await page.evaluate(() => {
    const exercise = data.workouts[0].exercises[0];
    const prior = { exerciseId: exercise.id, name: exercise.name, weight: 100, feedback: "about-right", jointPain: { rating: 1, joints: [] }, sets: Array.from({ length: exercise.sets }, () => ({ reps: exercise.maxReps, done: true })) };
    data.history.unshift({ id: "why-strength", date: new Date().toISOString(), exercises: [prior] });
    const recommendation = recommendationFor(exercise);
    data.history.shift();
    return recommendation.progressionDecision;
  });
  assert.equal(strengthProgressionReason.action, "progress", "normal Strength progression retains its existing top-of-range rule");
  assert.equal(strengthProgressionReason.reason.code, "GOOD_STRENGTH_PERFORMANCE", "normal Strength progression includes a concise deterministic reason");

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
  await page.locator('input[name="strengthSourceMode"][value="mine"]').check();
  await page.locator("#hybridBuilderNext").click();
  assert.ok(await page.locator("#hybridBuilderBody >> text=STEP 3 OF 9").count(), "custom Strength selection step rendered");
  for (const workoutId of ["push-a", "pull-a", "legs-a"]) {
    await page.locator('[data-strength-picker="saved"]').click();
    await page.locator(`[data-add-saved-workout="${workoutId}"]`).click();
  }
  assert.equal(await page.locator(".hybrid-strength-workout-card").count(), 3, "three saved Strength workouts can be selected without recreation");
  const originalWorkoutNames = await page.evaluate(() => data.workouts.map(workout => workout.name));
  await page.locator("[data-build-custom-strength]").click();
  await page.locator("#workoutNameInput").fill("Hybrid Custom Test");
  await page.locator(".exercise-name").fill("Goblet Squat");
  await page.locator("#workoutForm button[type='submit']").click();
  await page.locator("#hybridBuilderDialog").waitFor({ state: "visible" });
  assert.equal(await page.locator(".hybrid-strength-workout-card").count(), 4, "custom workout uses the shared Strength editor and returns to Hybrid");
  await page.locator('.hybrid-strength-workout-card').last().locator('[data-strength-action="remove"]').click();
  assert.deepEqual(await page.evaluate(() => data.workouts.map(workout => workout.name)), originalWorkoutNames, "Hybrid custom editing does not mutate the Strength Library");
  await page.locator("#hybridBuilderNext").click();
  for (let step = 4; step < 9; step++) {
    assert.ok(await page.locator(`#hybridBuilderBody >> text=STEP ${step} OF 9`).count(), `step ${step} rendered`);
    if (step === 8) {
      await page.locator('input[name="trainingDays"]').fill("6");
      await page.locator('input[name="availableDays"][value="5"]').evaluate(input => { input.checked = true; input.dispatchEvent(new Event("change", { bubbles: true })); });
      await page.locator('input[name="availableDays"][value="6"]').evaluate(input => { input.checked = true; input.dispatchEvent(new Event("change", { bubbles: true })); });
      await page.locator('input[name="availableDays"][value="3"]').evaluate(input => { input.checked = false; input.dispatchEvent(new Event("change", { bubbles: true })); });
      await page.locator('select[name="longRunDay"]').selectOption("sunday");
      assert.equal(await page.locator('select[name="longRunDay"]').inputValue(), "sunday", "UI stores Sunday as a semantic weekday ID");
    }
    await page.locator("#hybridBuilderNext").click();
  }
  const storedPreferredDay = await page.evaluate(() => ({ draft: data.hybridBuilderDraft.schedulingPreferences.longRunDay, persisted: JSON.parse(localStorage.getItem(STORAGE_KEY)).hybridBuilderDraft.schedulingPreferences.longRunDay }));
  assert.deepEqual(storedPreferredDay, { draft: "sunday", persisted: "sunday" }, "Sunday survives builder state and autosave unchanged");
  assert.ok(await page.locator("#hybridBuilderBody details.advanced-options:not([open])").count(), "advanced options start collapsed");
  await page.locator("#hybridBuilderNext").click();
  await page.locator("#hybridProgramDialog").waitFor({ state: "visible" });
  assert.equal(await page.locator("#hybridProgramBody .hybrid-day-card").count(), 7, "generated plan contains seven calendar days");
  assert.match(await page.locator("#hybridProgramBody").innerText(), /Why this schedule/i);
  assert.match(await page.locator("#hybridProgramBody").innerText(), /candidate schedules were scored/i);
  assert.match(await page.locator("#hybridProgramBody").innerText(), /TRAINING DAYS USED\s+6 of 6/i, "program review shows intended day use");
  assert.match(await page.locator("#hybridProgramBody").innerText(), /\d+\.\d mi.*Estimated.*min.*RPE 3-4/is, "program review shows run distance, estimated duration, and RPE");
  const sundayTrace = await page.evaluate(() => {
    const program = data.hybridPrograms.drafts[0];
    const longRunDay = program.schedule.find(day => day.sessions.some(session => session.runType === "Long Easy Run"));
    return { stored: program.setup.schedulingPreferences.longRunDay, normalized: FleemanHybridConfig.dayIndex(program.setup.schedulingPreferences.longRunDay), finalDayIndex: longRunDay.dayIndex, finalDay: longRunDay.day, honored: program.preferenceDecision.honored };
  });
  assert.deepEqual(sundayTrace, { stored: "sunday", normalized: 6, finalDayIndex: 6, finalDay: "Sunday", honored: true }, "Sunday survives scheduler input, normalization, selection, and rendered model");
  assert.match(await page.locator("#hybridProgramBody .hybrid-day-card").nth(6).innerText(), /Sunday[\s\S]*Long Easy Run/i, "Program Review renders the long run on Sunday");
  const editTarget = await page.evaluate(() => {
    const program = data.hybridPrograms.drafts[0];
    const workout = program.strengthWorkouts.find(item => /Chest|Upper/i.test(item.name)) || program.strengthWorkouts[0];
    return { id: workout.id, lowerBefore: FleemanHybridStress.calculateStrengthStress(workout).lowerBody, originalName: workout.name };
  });
  await page.locator(`[data-edit-hybrid-strength="${editTarget.id}"]`).first().click();
  const lowerNames = ["Back Squat", "Romanian Deadlift", "Leg Press", "Split Squat"];
  const editorCards = page.locator("#exerciseEditor .exercise-editor-card");
  for (let index = 0; index < await editorCards.count(); index++) {
    await editorCards.nth(index).locator(".exercise-name").fill(lowerNames[index % lowerNames.length]);
    await editorCards.nth(index).locator(".exercise-sets").fill("10");
  }
  await page.locator("#workoutForm button[type='submit']").click();
  await page.locator("#hybridProgramDialog").waitFor({ state: "visible" });
  const editedStress = await page.evaluate(workoutId => {
    const program = data.hybridPrograms.drafts[0];
    const workout = program.strengthWorkouts.find(item => item.id === workoutId);
    const session = program.schedule.flatMap(day => day.sessions).find(item => item.workoutId === workoutId);
    return { workoutLower: FleemanHybridStress.calculateStrengthStress(workout).lowerBody, sessionLower: session.stress.lowerBody, score: program.scheduleScore, conflicts: program.conflicts.length };
  }, editTarget.id);
  assert.ok(editedStress.workoutLower > editTarget.lowerBefore, "editing after generation increases content-derived lower-body stress");
  assert.equal(editedStress.sessionLower, editedStress.workoutLower, "scheduled session stress recalculates immediately after Strength editing");
  assert.match(await page.locator("#hybridProgramBody").innerText(), /re-analyzed after editing/i, "review explains the post-edit stress recalculation");
  const editedRunId = await page.locator("[data-edit-hybrid-run]").first().getAttribute("data-edit-hybrid-run");
  await page.locator(`[data-edit-hybrid-run="${editedRunId}"]`).click();
  await page.locator('#hybridRunEditForm [name="runType"]').selectOption({ label: "Intervals" });
  await page.locator('#hybridRunEditForm [name="targetDistance"]').fill("5");
  await page.locator('#hybridRunEditForm [name="targetDuration"]').fill("50");
  await page.locator('#hybridRunEditForm [name="rpeTarget"]').fill("8-9");
  await page.locator("#hybridRunEditForm button[type='submit']").click();
  const editedRun = await page.evaluate(sessionId => {
    const program = data.hybridPrograms.drafts[0];
    const session = program.schedule.flatMap(day => day.sessions).find(item => item.id === sessionId);
    return { runType: session.runType, distance: session.targetDistance, duration: session.targetDuration, rpe: session.rpeTarget, stress: session.stress.overall };
  }, editedRunId);
  assert.deepEqual({ runType: editedRun.runType, distance: editedRun.distance, duration: editedRun.duration, rpe: editedRun.rpe }, { runType: "Intervals", distance: 5, duration: 50, rpe: "8-9" }, "run edits preserve distance, duration, and RPE");
  assert.ok(editedRun.stress >= 4, "changing an Easy Run to Intervals recalculates hard running stress");
  const activationIdentity = await page.evaluate(() => ({ programId: data.hybridPrograms.drafts[0].id, builderId: data.hybridPrograms.drafts[0].builderId }));
  const invalidActivation = await page.evaluate(() => {
    const draft = structuredClone(data.hybridPrograms.drafts[0]);
    draft.schedule = [];
    return FleemanHybridLifecycle.validateProgramForActivation(draft);
  });
  assert.equal(invalidActivation.isValid, false, "activation validation rejects an incomplete schedule");
  assert.match(invalidActivation.errors.join(" "), /schedule|session/i, "activation validation explains the missing program data");

  await page.evaluate(() => {
    history.pushState({ view: "hybridReview" }, "", "#hybrid-review");
    window.__hybridOriginalSaveData = window.saveData;
    window.saveData = () => { throw new Error("Simulated activation persistence failure"); };
  });
  await page.locator('[data-program-action="start"]').click();
  await page.locator(".program-activation-error").waitFor({ state: "visible" });
  assert.match(await page.locator(".program-activation-error").innerText(), /COULDN'T START PROGRAM[\s\S]*not activated/i, "failed activation gives a clear retryable error");
  const failedActivation = await page.evaluate(programId => ({ activeId: data.hybridPrograms.active?.id || null, draftExists: data.hybridPrograms.drafts.some(item => item.id === programId), persistedActiveId: JSON.parse(localStorage.getItem(STORAGE_KEY)).hybridPrograms.active?.id || null }), activationIdentity.programId);
  assert.deepEqual(failedActivation, { activeId: null, draftExists: true, persistedActiveId: null }, "failed activation rolls back and preserves the draft");
  await page.evaluate(() => {
    window.saveData = window.__hybridOriginalSaveData;
    delete window.__hybridOriginalSaveData;
    window.__activationButtonStates = [];
    window.__activationButtonObserver = new MutationObserver(() => {
      const button = document.querySelector('[data-program-action="start"]');
      if (button) window.__activationButtonStates.push({ text: button.textContent.trim(), disabled: button.disabled, busy: button.getAttribute("aria-busy") });
    });
    window.__activationButtonObserver.observe(document.querySelector("#hybridProgramBody"), { childList: true, subtree: true });
  });
  await page.locator('[data-program-action="start"]').evaluate(button => { button.click(); button.click(); });
  await page.locator("#programActivationStatus:not(.hidden)").waitFor({ state: "visible" });
  assert.match(await page.locator("#programActivationStatus").innerText(), /PROGRAM STARTED[\s\S]*Balanced Hybrid program is now active/i, "successful activation gives immediate feedback");
  await page.locator("#homeView.active").waitFor({ state: "visible", timeout: 4000 });
  const activationResult = await page.evaluate(({ programId, builderId }) => {
    window.__activationButtonObserver?.disconnect();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      activeId: data.hybridPrograms.active?.id,
      activeStatus: data.hybridPrograms.active?.status,
      persistedActiveId: stored.hybridPrograms.active?.id,
      draftCopies: data.hybridPrograms.drafts.filter(item => item.id === programId || item.builderId === builderId).length,
      builderDraft: data.hybridBuilderDraft,
      activeView: data.ui.activeView,
      historyView: history.state?.view,
      hash: location.hash,
      buttonStates: window.__activationButtonStates
    };
  }, activationIdentity);
  assert.equal(activationResult.activeId, activationIdentity.programId, "the reviewed draft becomes the active Hybrid program");
  assert.equal(activationResult.activeStatus, "active", "the activated Hybrid program has active status");
  assert.equal(activationResult.persistedActiveId, activationIdentity.programId, "active status is persisted before navigation");
  assert.equal(activationResult.draftCopies, 0, "the activated builder draft is not left as a startable duplicate");
  assert.equal(activationResult.builderDraft, null, "temporary builder state is cleared after activation");
  assert.equal(activationResult.activeView, "homeView", "activation navigates to the real Home view");
  assert.equal(activationResult.historyView, "homeView", "Review history state is replaced by Home");
  assert.equal(activationResult.hash, "", "the stale Review URL marker is removed");
  assert.ok(activationResult.buttonStates.some(state => /Starting Program/i.test(state.text) && state.disabled && state.busy === "true"), "the Start button enters a disabled loading state");
  assert.match(await page.locator("#todayMesoMeta").innerText(), /Balanced Hybrid/i, "Home immediately identifies the active Hybrid mode");
  assert.equal(await page.locator("#hybridProgramDialog").evaluate(dialog => dialog.open), false, "Program Review closes after successful activation");
  await page.evaluate(() => history.back());
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#hybridProgramDialog").evaluate(dialog => dialog.open), false, "browser Back does not reopen stale Program Review");
  assert.equal(await page.locator('[data-program-action="start"]').count(), 0, "browser Back cannot expose a second activation button");
  assert.doesNotMatch(await page.locator("#todaySessionBadge").innerText(), /MISSED/, "midweek activation does not make earlier days missed");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator("#dismissOnboardingButton").click().catch(() => {});
  const reloadedActivation = await page.evaluate(programId => ({ activeId: data.hybridPrograms.active?.id, status: data.hybridPrograms.active?.status, activeView: data.ui.activeView, duplicateDrafts: data.hybridPrograms.drafts.filter(item => item.id === programId).length }), activationIdentity.programId);
  assert.deepEqual(reloadedActivation, { activeId: activationIdentity.programId, status: "active", activeView: "homeView", duplicateDrafts: 0 }, "active program and Home state survive reload without recreating the draft");

  await page.evaluate(() => {
    const program = data.hybridPrograms.active;
    const now = Date.now();
    program.setup.runningBaseline = { ...program.setup.runningBaseline, runsPerWeek: 3, weeklyMileage: 15, longestRun: 7, consistency: "3-12-months" };
    data.runHistory.unshift(
      { id: "why-run-1", programId: program.id, week: 1, date: new Date(now - 86400000).toISOString(), completion: "completed", completedDistance: 4, durationMinutes: 40, runType: "Easy Run", rpe: 4, painRating: 0 },
      { id: "why-run-2", programId: program.id, week: 1, date: new Date(now - 3 * 86400000).toISOString(), completion: "completed", completedDistance: 4, durationMinutes: 41, runType: "Easy Run", rpe: 4, painRating: 0 },
      { id: "why-run-3", programId: program.id, week: 1, date: new Date(now - 5 * 86400000).toISOString(), completion: "completed", completedDistance: 7, durationMinutes: 70, runType: "Long Easy Run", rpe: 4, painRating: 0 }
    );
    program.strengthProgressionEligibility = [{ exerciseId: "why-squat", exerciseName: "Back Squat", region: "lower", week: 1, previousWeight: 275, newWeight: 280, recommendedIncrease: 5 }];
    saveData();
  });
  await page.locator('[data-dock-view="programsView"]').click();
  await page.locator('[data-build-mode="hybrid"]').click();
  await page.locator('[data-hybrid-action="review"]').click();
  await page.locator('[data-program-action="weekly"]').click();
  assert.match(await page.locator("#hybridProgramBody").innerText(), /PROGRESS[\s\S]*WHY\?[\s\S]*recent mileage/i, "weekly review shows a concise reason for running progression");
  assert.match(await page.locator(".strength-progression-decision").innerText(), /BACK SQUAT[\s\S]*PROGRESSION HELD[\s\S]*WHY\?[\s\S]*Long-run volume increased/i, "weekly review explains deferred lower-body Strength progression");
  const visibleWhyWordCounts = await page.locator(".progression-why summary strong").allTextContents();
  assert.ok(visibleWhyWordCounts.every(text => text.trim().split(/\s+/).length >= 5 && text.trim().split(/\s+/).length <= 12), "visible short reasons stay within the 5-12 word target");
  await page.locator(".progression-why summary").first().click();
  assert.equal(await page.locator(".progression-why").first().getAttribute("open") !== null, true, "WHY can expand without opening a modal");
  await page.locator("#approveHybridWeek").click();
  const storedWhy = await page.evaluate(() => {
    const program = data.hybridPrograms.active;
    const reviewed = program.progress.reviewedWeeks.find(item => item.week === 1);
    const historical = program.progressionDecisions.find(item => item.week === 1);
    const progressedRun = program.weeklyOverrides?.[2]?.flatMap(day => day.sessions).find(session => session.type === "run" && session.progressionDecision);
    return { reviewed, historical, progressedRun };
  });
  assert.equal(storedWhy.reviewed.explanation.code, storedWhy.historical.explanation.code, "the same structured reason is stored in review and progression history");
  assert.ok(storedWhy.progressedRun.progressionDecision.reason.code, "the changed upcoming Run stores its reason instead of regenerating UI text");
  await page.locator("#closeHybridProgramButton").click();
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
  await page.locator("#dismissOnboardingButton").click().catch(() => {});
  const persistedWhy = await page.evaluate(() => {
    const program = data.hybridPrograms.active;
    const memory = program.progressionDecisions.find(item => item.week === 1)?.explanation;
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)).hybridPrograms.active.progressionDecisions.find(item => item.week === 1)?.explanation;
    return { memory, stored };
  });
  assert.deepEqual(persistedWhy.memory, persistedWhy.stored, "the exact progression reason survives reload");
  await page.locator('[data-dock-view="homeView"]').click();

  const homeFixtures = await page.evaluate(() => {
    const program = data.hybridPrograms.active;
    const sessions = program.schedule.flatMap(day => day.sessions);
    const strength = structuredClone(sessions.find(session => session.type === "strength"));
    const progressedRun = program.weeklyOverrides?.[2]?.flatMap(day => day.sessions).find(session => session.type === "run" && session.progressionDecision);
    const run = structuredClone(progressedRun || sessions.find(session => session.type === "run"));
    const todayIndex = (new Date().getDay() + 6) % 7;
    const futureIndex = (todayIndex + 1) % 7;
    window.__hybridHomeFixtures = { strength, run, todayIndex };
    program.schedule.forEach(day => { day.sessions = []; day.sessionType = "rest"; });
    program.schedule[futureIndex].sessions = [structuredClone(run)];
    program.schedule[futureIndex].sessionType = "run";
    program.progress.completed = [];
    program.progress.skipped = [];
    saveData(); renderHome();
    return { strengthTitle: strength.title, runTitle: run.title, runDistance: Number(run.targetDistance).toFixed(1), futureDay: FleemanHybridConfig.DAYS[futureIndex] };
  });
  assert.equal(await page.locator("#todayWorkoutName").innerText(), "REST DAY", "a newly active program shows an intentional rest day instead of starting tomorrow's session");
  assert.match(await page.locator("#todayWorkoutSummary").innerText(), new RegExp(`Next: .+${homeFixtures.futureDay}`, "i"), "rest-day Home identifies the next scheduled session");
  assert.equal(await page.locator("#startWorkoutButton").innerText(), "REVIEW PROGRAM", "rest day does not offer to start a future workout today");

  await page.evaluate(() => {
    const program = data.hybridPrograms.active, { strength, todayIndex } = window.__hybridHomeFixtures;
    program.schedule.forEach(day => { day.sessions = []; day.sessionType = "rest"; });
    program.schedule[todayIndex].sessions = [structuredClone(strength)];
    program.schedule[todayIndex].sessionType = "strength";
    saveData(); renderHome();
  });
  assert.equal(await page.locator("#todayWorkoutName").innerText(), homeFixtures.strengthTitle.toUpperCase(), "Home displays the first actionable Strength session");
  assert.match(await page.locator("#startWorkoutButton").innerText(), /CHECK READINESS/i);

  await page.evaluate(() => {
    const program = data.hybridPrograms.active, { run, todayIndex } = window.__hybridHomeFixtures;
    program.schedule.forEach(day => { day.sessions = []; day.sessionType = "rest"; });
    program.schedule[todayIndex].sessions = [structuredClone(run)];
    program.schedule[todayIndex].sessionType = "run";
    saveData(); renderHome();
  });
  assert.equal(await page.locator("#todayWorkoutName").innerText(), homeFixtures.runTitle.toUpperCase(), "Home displays the first actionable Run session");
  assert.match(await page.locator("#todayWorkoutSummary").innerText(), new RegExp(`${homeFixtures.runDistance} mi.*(estimated|~).*RPE`, "i"), "Run Home card retains distance, estimated time, and RPE");
  assert.match(await page.locator("#todayProgressionWhy").innerText(), /PROGRESS[\s\S]*WHY\?/i, "Home shows WHY only for the changed upcoming prescription");
  for (const width of [...mobileWidths, ...desktopWidths]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    const reasonOverflow = await page.locator("#todayProgressionWhy").evaluate(node => ({ client: node.clientWidth, scroll: node.scrollWidth }));
    assert.ok(reasonOverflow.scroll <= reasonOverflow.client + 1, `WHY text wraps without horizontal overflow at ${width}px: ${JSON.stringify(reasonOverflow)}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  await page.evaluate(() => {
    const program = data.hybridPrograms.active;
    const { strength, run, todayIndex } = window.__hybridHomeFixtures;
    program.schedule.forEach(day => { day.sessions = []; day.sessionType = "rest"; });
    program.schedule[todayIndex].sessions = FleemanHybridScheduler.orderSameDay([structuredClone(strength), structuredClone(run)], program.hybridPriority);
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
  assert.match(await page.locator("#todayWorkoutSummary").innerText(), /\d+\.\d mi.*(Estimated|~).*RPE/i, "Home shows the run distance without opening session details");

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
  assert.match(await page.locator("#historyList").innerText(), /12:00\/mi/, "run history preserves a calculated average pace");

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
  await page.locator('input[name="strengthSourceMode"][value="generated"]').check();
  await page.locator("#hybridBuilderNext").click();
  assert.ok(await page.locator(".hybrid-strength-workout-card").count() >= 2, "Build Strength For Me creates complete workouts");
  await page.locator("#hybridBuilderNext").click();
  for (let step = 4; step < 8; step++) {
    assert.ok(await page.locator(`#hybridBuilderBody >> text=STEP ${step} OF 9`).count(), `rolling builder step ${step} rendered`);
    await page.locator("#hybridBuilderNext").click();
  }
  await page.locator('input[name="scheduleType"][value="rolling"]').check();
  await page.locator('input[name="rollingCycleLength"]').fill("8");
  await page.locator('input[name="rollingNormalCycles"]').fill("2");
  await page.locator("#hybridBuilderNext").click();
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
    await page.evaluate(() => { data.hybridBuilderDraft = null; localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); });
    await page.locator('[data-profile-id="balanced-hybrid"]').click();
    await page.locator("#hybridBuilderNext").click();
    await page.locator('input[name="strengthSourceMode"][value="mine"]').check();
    await page.locator("#hybridBuilderNext").click();
    assert.equal(await page.locator(".hybrid-strength-source-actions").isVisible(), true, `Strength Setup controls remain visible at ${width}px`);
    const builderOverflow = await page.locator("#hybridBuilderForm").evaluate(form => ({ client: form.clientWidth, scroll: form.scrollWidth }));
    assert.ok(builderOverflow.scroll <= builderOverflow.client + 1, `Strength Setup has no horizontal overflow at ${width}px: ${JSON.stringify(builderOverflow)}`);
    await page.locator("#closeHybridBuilderButton").click();
    await page.locator('[data-hybrid-action="review"]').click();
    const reviewOverflow = await page.locator("#hybridProgramDialog .dialog-card").evaluate(card => ({ client: card.clientWidth, scroll: card.scrollWidth }));
    assert.ok(reviewOverflow.scroll <= reviewOverflow.client + 1, `schedule review stays inside its dialog at ${width}px: ${JSON.stringify(reviewOverflow)}`);
    await page.locator("#closeHybridProgramButton").click();
  }

  await browser.close();
  assert.deepEqual(pageErrors, [], `browser emitted errors: ${pageErrors.join(" | ")}`);
  console.log(JSON.stringify({ status: "PASS", url, builderSteps: 9, priorities: 4, mobileWidths, desktopWidths, persistence: true, runHistory: true, pageErrors }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
