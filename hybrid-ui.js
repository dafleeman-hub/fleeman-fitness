(function () {
  "use strict";
  if (typeof document === "undefined") return;

  const Config = globalThis.FleemanHybridConfig;
  const Stress = globalThis.FleemanHybridStress;
  const Scheduler = globalThis.FleemanHybridScheduler;
  const Progression = globalThis.FleemanHybridProgression;
  const Recovery = globalThis.FleemanHybridRecovery;
  const StrengthAdapter = globalThis.FleemanHybridStrengthAdapter;
  const Reasons = globalThis.FleemanProgressionReasons;
  if (!Config || !Stress || !Scheduler || !Progression || !Recovery || !StrengthAdapter || !Reasons) return;

  const PRIORITY_NAMES = { strength: "Strength Priority", balanced: "Balanced Hybrid", running: "Running Priority", race: "Race Hybrid" };
  const PROFILE_IDS = { strength: "strength-priority", balanced: "balanced-hybrid", running: "running-priority", race: "race-hybrid" };
  const DAY_OPTIONS = Config.DAYS.map((day, index) => `<option value="${Config.WEEKDAY_IDS[index]}">${day}</option>`).join("");
  let builder = null;
  let builderTrigger = null;
  let reviewProgramId = null;
  let readinessContext = null;
  let runContext = null;
  let runEditContext = null;
  let missedContext = null;
  let activationInProgress = false;
  let activationUi = { state: "idle", programId: null, message: "" };

  function id(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function html(value) { return typeof escapeHtml === "function" ? escapeHtml(value ?? "") : String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function distanceUnit(program = data.hybridPrograms?.active) { return program?.setup?.runningDistanceUnit || (data.profile?.units === "metric" ? "km" : "mi"); }
  function isRolling(program) { return (program?.scheduleType || program?.setup?.scheduleType) === "rolling"; }
  function periodName(program) { return isRolling(program) ? "Cycle" : "Week"; }
  function mondayIndex(date = new Date()) { return Config.jsDayToHybridIndex(date.getDay()); }
  function currentWeek(program, date = new Date()) {
    if (isRolling(program)) {
      const totalCycles = Math.max(1, Number(program.totalCycles || program.totalWeeks || 1));
      for (let cycle = 1; cycle <= totalCycles; cycle += 1) if (weekOccurrences(program, cycle).some(item => !isResolved(program, item.occurrenceId))) return cycle;
      return totalCycles;
    }
    const start = new Date(`${program.startDate || today()}T00:00:00`);
    const startWeek = new Date(start); startWeek.setHours(0, 0, 0, 0); startWeek.setDate(startWeek.getDate() - mondayIndex(startWeek));
    const referenceWeek = new Date(date); referenceWeek.setHours(0, 0, 0, 0); referenceWeek.setDate(referenceWeek.getDate() - mondayIndex(referenceWeek));
    return Math.max(1, Math.min(program.totalWeeks || 4, Math.floor((referenceWeek - startWeek) / 604800000) + 1));
  }
  function persist(render = false) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (render && typeof saveData === "function") saveData();
  }
  function normalizeSchedulingPreferenceDays(setup) {
    const preferences = setup?.schedulingPreferences;
    if (!preferences) return;
    ["longRunDay", "heavyLowerDay", "restDay"].forEach(key => { preferences[key] = Config.weekdayId(preferences[key]); });
  }
  function ensureHybridData() {
    data.hybridPrograms ||= { drafts: [], active: null, completed: [] };
    data.hybridPrograms.drafts ||= [];
    data.hybridPrograms.completed ||= [];
    data.runHistory ||= [];
    data.hybridReadinessHistory ||= [];
    data.mesocycles ||= { drafts: [], active: null, completed: [] };
    [...(data.mesocycles.drafts || []), data.mesocycles.active, ...(data.mesocycles.completed || [])].filter(Boolean).forEach(program => {
      if (!program.programMode) program.programMode = "strength";
    });
    [data.hybridPrograms.active, ...(data.hybridPrograms.drafts || []), ...(data.hybridPrograms.completed || [])].filter(Boolean).forEach(program => {
      program.programMode = "hybrid";
      program.scheduleType ||= program.setup?.scheduleType || "weekly";
      program.setup ||= {};
      program.setup.scheduleType ||= program.scheduleType;
      program.setup.runPrescriptionStyle ||= "distance";
      normalizeSchedulingPreferenceDays(program.setup);
      program.schemaVersion = Math.max(Number(program.schemaVersion || 1), Number(Config.SCHEMA_VERSION || 1));
      program.progress ||= { completed: [], skipped: [], rescheduled: [], reviewedWeeks: [] };
      program.progress.completed ||= [];
      program.progress.skipped ||= [];
      program.progress.rescheduled ||= [];
      program.progress.reviewedWeeks ||= [];
      program.progressionDecisions ||= [];
    });
    if (data.hybridBuilderDraft) normalizeSchedulingPreferenceDays(data.hybridBuilderDraft);
  }

  function defaultBuilder(priority = "balanced") {
    const profile = data.profile || {};
    return {
      id: id("hybrid-builder"), schemaVersion: Config.SCHEMA_VERSION || 1, programMode: "hybrid", status: "builder-draft", currentStep: 1,
      hybridPriority: priority, scheduleType: "weekly", trainingDays: 5, availableDays: [0, 1, 2, 3, 4], rollingCycleLength: 8, rollingNormalCycles: 4, twoADayPreference: "occasionally", preferredTrainingTimes: ["morning"],
      strengthSourceMode: "", strengthWorkoutSnapshots: [], generatedStrengthWorkouts: [], strengthPicker: "", strengthSessionsTarget: "auto", runningSessionsTarget: "auto",
      strengthProfile: { experience: profile.experience || "Beginner", reuseProfile: true }, runningDistanceUnit: profile.units === "metric" ? "km" : "mi", runPrescriptionStyle: "distance",
      runningBaseline: { experience: "New to running", runsPerWeek: 0, weeklyMileage: 0, longestRun: 0, consistency: "not-running", recentPerformance: "", recentPerformanceDistance: "", recentPerformanceTime: "" },
      runningIntensityDisplay: "pace-rpe",
      raceGoal: { enabled: priority === "race", distance: "5K", date: "", goal: "Finish comfortably", targetTime: "" },
      recoveryPreferences: { limitations: ["None"], sleep: "good", fatigue: "normal" },
      schedulingPreferences: { longRunDay: "", heavyLowerDay: "", restDay: "", runningSurface: "Mixed" },
      advanced: { preferredSplit: "auto", exercisesToAvoid: "", minLiftingDays: 2, maxLiftingDays: 4, sessionDuration: 60, maximumRunningDays: 5, speedworkPreference: "auto", preferredLongRunDuration: "", knownEasyPace: "", heartRateZones: "", maxConsecutiveDays: 3, hoursBetweenMajor: 24, stressDistribution: "spread" },
      updatedAt: new Date().toISOString()
    };
  }

  function field(name, label, content, wide = false) { return `<label class="hybrid-field${wide ? " wide" : ""}" data-field-key="${name}"><span>${label}</span>${content}<small class="hybrid-field-error" aria-live="polite"></small></label>`; }
  function radioCards(name, values, current) {
    return `<div class="hybrid-choice-grid" data-field-key="${name}">${values.map(([value, title, note]) => `<label class="hybrid-choice ${current === value ? "selected" : ""}"><input type="radio" name="${name}" value="${value}" ${current === value ? "checked" : ""}><strong>${title}</strong>${note ? `<small>${note}</small>` : ""}</label>`).join("")}<small class="hybrid-field-error" aria-live="polite"></small></div>`;
  }
  function selectedOptions(current) { return Config.DAYS.map((day, index) => `<label class="day-check"><input type="checkbox" name="availableDays" value="${index}" ${(current || []).includes(index) ? "checked" : ""}><span>${day.slice(0, 3)}</span></label>`).join(""); }
  function strengthProfileMarkup() {
    const quick = data.profile?.quickStrengthProfile || {}, unit = data.profile?.units === "metric" ? "kg" : "lb";
    const anchor = key => { const item = quick[key]; const value = Number(item?.oneRepMax || item?.weight || 0); return value ? `${Math.round(value * 10) / 10} ${unit}` : "Not provided"; };
    return `<div class="strength-profile-grid"><div><span>BENCH STRENGTH</span><strong>${anchor("bench")}</strong></div><div><span>SQUAT STRENGTH</span><strong>${anchor("squat")}</strong></div><div><span>DEADLIFT STRENGTH</span><strong>${anchor("deadlift")}</strong></div><div><span>EXPERIENCE</span><strong>${html(data.profile?.experienceLevel || builder.strengthProfile.experience)}</strong></div></div>`;
  }

  function strengthWorkoutsForBuilder(source = builder) {
    return source?.strengthSourceMode === "mine" ? (source.strengthWorkoutSnapshots || []) : (source?.generatedStrengthWorkouts || []);
  }

  function strengthAnalysis(workout) {
    return StrengthAdapter.analyzeStrengthWorkoutForHybrid(workout, Stress);
  }

  function strengthCardMarkup(workout, index, options = {}) {
    const analysis = strengthAnalysis(workout);
    return `<article class="hybrid-strength-workout-card" data-hybrid-strength-id="${html(workout.id)}">
      <div><span class="program-mode-badge">${html(analysis.classification)}</span><h4>${index + 1}. ${html(workout.name)}</h4><p>${analysis.exerciseCount} exercises • ${analysis.totalSets} sets • Upper ${Stress.stressLabel(analysis.stress.upperBody)} • Lower ${Stress.stressLabel(analysis.stress.lowerBody)}</p></div>
      <div class="hybrid-strength-actions">
        <button class="secondary-button compact" type="button" data-strength-action="preview" data-workout-id="${html(workout.id)}">Preview</button>
        <button class="secondary-button compact" type="button" data-strength-action="edit" data-workout-id="${html(workout.id)}">Edit</button>
        ${options.readonly ? "" : `<button class="secondary-button compact" type="button" data-strength-action="duplicate" data-workout-id="${html(workout.id)}">Duplicate</button><button class="secondary-button compact" type="button" data-strength-action="up" data-workout-id="${html(workout.id)}" ${index === 0 ? "disabled" : ""}>↑</button><button class="secondary-button compact" type="button" data-strength-action="down" data-workout-id="${html(workout.id)}" ${index === strengthWorkoutsForBuilder().length - 1 ? "disabled" : ""}>↓</button><button class="danger-button compact" type="button" data-strength-action="remove" data-workout-id="${html(workout.id)}">Remove</button>`}
      </div>
    </article>`;
  }

  function strengthPickerMarkup() {
    if (builder.strengthPicker === "saved") {
      return `<section class="hybrid-strength-picker"><div class="hybrid-picker-heading"><h4>Saved Workouts</h4><button class="icon-button" type="button" data-close-strength-picker aria-label="Close workout choices">×</button></div>${data.workouts.filter(workout => workout.exercises?.length).map(workout => { const analysis = strengthAnalysis(workout); return `<article><div><strong>${html(workout.name)}</strong><small>${analysis.exerciseCount} exercises • ${html(analysis.classification)}</small></div><button class="primary-button compact" type="button" data-add-saved-workout="${html(workout.id)}">Add</button></article>`; }).join("") || "<p>No saved workouts are available yet.</p>"}</section>`;
    }
    if (builder.strengthPicker === "quick") {
      return `<section class="hybrid-strength-picker"><div class="hybrid-picker-heading"><h4>Quick Start Strength</h4><button class="icon-button" type="button" data-close-strength-picker aria-label="Close Quick Start choices">×</button></div>${PREMADE_PROGRAM_TEMPLATES.map(template => `<article><div><strong>${html(template.name)}</strong><small>${template.daysPerWeek} real workouts • ${html(template.focus)}</small></div><button class="primary-button compact" type="button" data-add-quick-template="${html(template.id)}">Use workouts</button></article>`).join("")}</section>`;
    }
    if (builder.strengthPicker === "program") {
      const programs = [...(data.mesocycles?.drafts || []), data.mesocycles?.active, ...(data.mesocycles?.completed || [])].filter(program => program?.schedule?.some(day => day.workout?.exercises?.length));
      return `<section class="hybrid-strength-picker"><div class="hybrid-picker-heading"><h4>Existing Strength Programs</h4><button class="icon-button" type="button" data-close-strength-picker aria-label="Close strength program choices">×</button></div>${programs.map(program => `<article><div><strong>${html(program.name)}</strong><small>${program.schedule.length} workout days • copied safely into Hybrid</small></div><button class="primary-button compact" type="button" data-add-strength-program="${html(program.id)}">Use program</button></article>`).join("") || "<p>No compatible saved Strength program is available.</p>"}</section>`;
    }
    return "";
  }

  function strengthSetupMarkup() {
    if (builder.strengthSourceMode === "generated") {
      if (!builder.generatedStrengthWorkouts?.length) builder.generatedStrengthWorkouts = StrengthAdapter.buildStrengthForMe(builder.hybridPriority, PREMADE_PROGRAM_TEMPLATES, templateExercisePrescription);
      return `<div class="profile-reuse-card"><strong>Liberty Forge Strength Plan</strong><p>These are complete Strength workouts built from the existing Quick Start exercise and prescription system. You can review or edit them with the normal Strength editor.</p></div><div class="hybrid-strength-list" data-field-key="strengthWorkouts">${builder.generatedStrengthWorkouts.map((workout, index) => strengthCardMarkup(workout, index, { readonly: true })).join("")}<small class="hybrid-field-error" aria-live="polite"></small></div><button class="secondary-button" type="button" data-regenerate-strength>Regenerate for ${html(PRIORITY_NAMES[builder.hybridPriority])}</button>`;
    }
    const selected = builder.strengthWorkoutSnapshots || [];
    return `<div class="profile-reuse-card">${strengthProfileMarkup()}<p>Your Hybrid copies are independent. Editing them here will not change the originals in your Strength Library or mesocycles.</p></div><h4>Your Strength Workouts</h4><div class="hybrid-strength-list" data-field-key="strengthWorkouts">${selected.map((workout, index) => strengthCardMarkup(workout, index)).join("") || '<div class="empty-strength-selection"><strong>No workouts selected yet</strong><p>Add saved workouts, Quick Start workouts, an existing Strength program, or build a custom workout.</p></div>'}<small class="hybrid-field-error" aria-live="polite"></small></div><div class="hybrid-strength-source-actions"><button class="secondary-button" type="button" data-strength-picker="saved">Add Existing Workout</button><button class="secondary-button" type="button" data-strength-picker="quick">Use Quick Start</button><button class="secondary-button" type="button" data-strength-picker="program">Use Existing Strength Program</button><button class="primary-button" type="button" data-build-custom-strength>Build Custom Workout</button></div>${strengthPickerMarkup()}`;
  }

  function persistBuilderAndRender() {
    builder.updatedAt = new Date().toISOString();
    data.hybridBuilderDraft = clone(builder);
    persist();
    renderBuilderStep();
  }

  function openHybridStrengthEditor(workout = null) {
    const editing = Boolean(workout);
    document.querySelector("#hybridBuilderDialog")?.close();
    openWorkoutEditor(workout ? clone(workout) : null, {
      saveToLibrary: false,
      title: editing ? "Edit Hybrid Strength workout" : "Build Hybrid Strength workout",
      onSave: saved => {
        const target = builder.strengthSourceMode === "mine" ? "strengthWorkoutSnapshots" : "generatedStrengthWorkouts";
        if (editing) builder[target] = StrengthAdapter.replaceWorkout(builder[target] || [], saved);
        else builder[target] = [...(builder[target] || []), StrengthAdapter.snapshotWorkout(saved, "hybrid-custom", saved.id)];
        data.hybridBuilderDraft = clone(builder);
        persist();
        renderBuilderStep();
        document.querySelector("#hybridBuilderDialog")?.showModal();
      },
      onCancel: () => {
        renderBuilderStep();
        document.querySelector("#hybridBuilderDialog")?.showModal();
      }
    });
  }

  function bindStrengthSetupActions() {
    document.querySelectorAll("[data-strength-picker]").forEach(button => button.onclick = () => { builder.strengthPicker = button.dataset.strengthPicker; persistBuilderAndRender(); });
    document.querySelector("[data-close-strength-picker]")?.addEventListener("click", () => { builder.strengthPicker = ""; persistBuilderAndRender(); });
    document.querySelector("[data-build-custom-strength]")?.addEventListener("click", () => openHybridStrengthEditor());
    document.querySelector("[data-regenerate-strength]")?.addEventListener("click", () => { builder.generatedStrengthWorkouts = StrengthAdapter.buildStrengthForMe(builder.hybridPriority, PREMADE_PROGRAM_TEMPLATES, templateExercisePrescription); persistBuilderAndRender(); });
    document.querySelectorAll("[data-add-saved-workout]").forEach(button => button.onclick = () => {
      const source = data.workouts.find(workout => workout.id === button.dataset.addSavedWorkout);
      const snapshot = StrengthAdapter.snapshotWorkout(source, "saved-workout", source?.id);
      if (snapshot) builder.strengthWorkoutSnapshots.push(snapshot);
      builder.strengthPicker = "";
      persistBuilderAndRender();
    });
    document.querySelectorAll("[data-add-quick-template]").forEach(button => button.onclick = () => {
      const template = PREMADE_PROGRAM_TEMPLATES.find(item => item.id === button.dataset.addQuickTemplate);
      builder.strengthWorkoutSnapshots.push(...StrengthAdapter.snapshotsFromTemplate(template, templateExercisePrescription));
      builder.strengthPicker = "";
      persistBuilderAndRender();
    });
    document.querySelectorAll("[data-add-strength-program]").forEach(button => button.onclick = () => {
      const programs = [...(data.mesocycles?.drafts || []), data.mesocycles?.active, ...(data.mesocycles?.completed || [])].filter(Boolean);
      const program = programs.find(item => item.id === button.dataset.addStrengthProgram);
      builder.strengthWorkoutSnapshots.push(...StrengthAdapter.snapshotsFromStrengthProgram(program));
      builder.strengthPicker = "";
      persistBuilderAndRender();
    });
    document.querySelectorAll("[data-strength-action]").forEach(button => button.onclick = event => {
      const target = builder.strengthSourceMode === "mine" ? "strengthWorkoutSnapshots" : "generatedStrengthWorkouts";
      const workouts = builder[target] || [];
      const workout = workouts.find(item => item.id === button.dataset.workoutId);
      if (!workout) return;
      const action = button.dataset.strengthAction;
      if (action === "preview") {
        const analysis = strengthAnalysis(workout);
        openWorkoutPreview(workout, { trigger: event.currentTarget, startAction: null, extraSummary: `<p class="hybrid-preview-stress"><strong>Hybrid stress:</strong> ${html(analysis.classification)} • Upper ${Stress.stressLabel(analysis.stress.upperBody)} • Lower ${Stress.stressLabel(analysis.stress.lowerBody)} • Overall ${Stress.stressLabel(analysis.stress.overall)}</p>` });
      } else if (action === "edit") openHybridStrengthEditor(workout);
      else if (action === "remove") { builder[target] = workouts.filter(item => item.id !== workout.id); persistBuilderAndRender(); }
      else if (action === "duplicate") { const copy = StrengthAdapter.snapshotWorkout(workout, "hybrid-duplicate", workout.id); copy.name = `${workout.name} Copy`; builder[target] = [...workouts, copy]; persistBuilderAndRender(); }
      else if (["up", "down"].includes(action)) { builder[target] = StrengthAdapter.moveWorkout(workouts, workout.id, action); persistBuilderAndRender(); }
    });
  }

  function combinedScheduleMarkup(p) {
    const scheduleChoice = radioCards("scheduleType", [
      ["weekly", "Weekly Schedule", "Tie sessions to specific weekdays and repeat Monday through Sunday."],
      ["rolling", "Rolling Cycle", "Follow numbered training and rest days in order, regardless of the weekday."]
    ], p.scheduleType || "weekly");
    let scheduleFields = "";
    if (p.scheduleType === "rolling") {
      scheduleFields = field("rollingCycleLength", "Days in one rolling cycle", `<input name="rollingCycleLength" type="number" min="3" max="21" value="${p.rollingCycleLength || 8}" inputmode="numeric">`)
        + field("rollingNormalCycles", "Number of cycles", `<input name="rollingNormalCycles" type="number" min="1" max="20" value="${p.rollingNormalCycles || 4}" inputmode="numeric">`)
        + '<div class="wide profile-reuse-card"><strong>Rolling sequence placement</strong><p>Liberty Forge will place training and explicit rest days by actual stress. The sequence never resets on Monday.</p></div>';
    } else {
      scheduleFields = field("trainingDays", "Intended training days", `<input name="trainingDays" type="number" min="3" max="7" value="${p.trainingDays}" inputmode="numeric">`)
        + field("availableDays", "Available days", `<div class="day-check-grid">${selectedOptions(p.availableDays)}</div>`)
        + field("schedulingPreferences.longRunDay", "Preferred long-run day", `<select name="longRunDay"><option value="">No preference</option>${DAY_OPTIONS}</select>`)
        + field("schedulingPreferences.heavyLowerDay", "Preferred heavy lower day", `<select name="heavyLowerDay"><option value="">No preference</option>${DAY_OPTIONS}</select>`)
        + field("schedulingPreferences.restDay", "Preferred rest day", `<select name="restDay"><option value="">No preference</option>${DAY_OPTIONS}</select>`);
    }
    return `<div class="hybrid-step"><p class="eyebrow">STEP 8 OF 9 • COMBINED SCHEDULE</p><h3>Coordinate Strength and Running</h3><p class="small-note">The coordinator will inspect the actual exercises and stress in every selected Strength workout before placing sessions.</p>${scheduleChoice}<div class="hybrid-form-grid">${scheduleFields}${field("twoADayPreference", "Two-a-days", `<select name="twoADayPreference"><option value="no" ${p.twoADayPreference === "no" ? "selected" : ""}>No</option><option value="occasionally" ${p.twoADayPreference === "occasionally" ? "selected" : ""}>Occasionally</option><option value="yes" ${p.twoADayPreference === "yes" ? "selected" : ""}>Yes</option></select>`)}${field("preferredTrainingTimes", "Preferred time", '<select name="preferredTrainingTimes"><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select>')}${field("schedulingPreferences.runningSurface", "Running surface", `<select name="runningSurface">${["Mixed", "Road", "Track", "Trail", "Treadmill"].map(value => `<option ${p.schedulingPreferences.runningSurface === value ? "selected" : ""}>${value}</option>`).join("")}</select>`)}</div></div>`;
  }

  function renderBuilderStep() {
    const step = builder.currentStep;
    document.querySelector("#hybridBuilderProgress").innerHTML = Array.from({ length: 9 }, (_, index) => `<span class="${index + 1 < step ? "done" : index + 1 === step ? "active" : ""}" aria-label="Step ${index + 1}${index + 1 === step ? ", current" : ""}">${index + 1}</span>`).join("");
    const p = builder;
    const parts = {
      1: `<div class="hybrid-step"><p class="eyebrow">STEP 1 OF 9</p><h3>What matters most in this block?</h3><p class="small-note">This controls which sessions are protected when running and strength compete for recovery.</p>${radioCards("hybridPriority", [["strength","Strength Priority","Protect lifting progress first."],["balanced","Balanced Hybrid","Develop strength and running evenly."],["running","Running Priority","Protect key running sessions first."],["race","Race Hybrid","Build toward a specific race while retaining strength."]], p.hybridPriority)}</div>`,
      2: `<div class="hybrid-step"><p class="eyebrow">STEP 2 OF 9 • STRENGTH SETUP</p><h3>How would you like to handle Strength?</h3><p class="small-note">Choose the exact lifting workouts you want, or let Liberty Forge build complete workouts around your Hybrid goal.</p>${radioCards("strengthSourceMode", [["mine","Use My Strength Plan","Select, copy, build, edit, and reorder your exact Strength workouts."],["generated","Build Strength For Me","Use the existing Strength exercise and prescription system to create a goal-matched plan."]], p.strengthSourceMode)}</div>`,
      3: `<div class="hybrid-step"><p class="eyebrow">STEP 3 OF 9 • STRENGTH WORKOUTS</p><h3>${p.strengthSourceMode === "generated" ? "Your generated Strength plan" : "Choose how your Strength training works"}</h3><p class="small-note">Strength owns exercises, sets, reps, RIR, rest, starting weights, progression, soreness, pain, and swaps. Hybrid only coordinates these workouts with running.</p>${strengthSetupMarkup()}</div>`,
      4: `<div class="hybrid-step"><p class="eyebrow">STEP 4 OF 9</p><h3>Running baseline</h3><p class="small-note">Running experience is kept separate from strength experience. Distance uses your ${data.profile?.units === "metric" ? "kilometer" : "mile"} preference.</p><div class="hybrid-form-grid">${field("runningBaseline.experience","Running experience",`<select name="runningExperience">${["New to running","Beginner","Recreational","Experienced"].map(v => `<option ${p.runningBaseline.experience === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("runningBaseline.consistency","Consistency",`<select name="runningConsistency"><option value="not-running">Not currently running</option><option value="under-3-months" ${p.runningBaseline.consistency === "under-3-months" ? "selected" : ""}>Less than 3 months</option><option value="3-12-months" ${p.runningBaseline.consistency === "3-12-months" ? "selected" : ""}>3–12 months</option><option value="1-3-years" ${p.runningBaseline.consistency === "1-3-years" ? "selected" : ""}>1–3 years</option><option value="3-plus-years" ${p.runningBaseline.consistency === "3-plus-years" ? "selected" : ""}>3+ years</option></select>`)}${field("runningBaseline.runsPerWeek","Current runs per week",`<select name="runsPerWeek">${[0,1,2,3,4,5].map(n => `<option value="${n}" ${Number(p.runningBaseline.runsPerWeek) === n ? "selected" : ""}>${n === 5 ? "5+" : n}</option>`).join("")}</select>`)}${field("runningBaseline.weeklyMileage",`Current weekly ${data.profile?.units === "metric" ? "kilometers" : "mileage"}`,`<input name="weeklyMileage" type="number" min="0" max="300" step="0.1" value="${p.runningBaseline.weeklyMileage}" inputmode="decimal">`)}${field("runningBaseline.longestRun","Longest run in the last 4–6 weeks",`<input name="longestRun" type="number" min="0" max="100" step="0.1" value="${p.runningBaseline.longestRun}" inputmode="decimal">`)}${field("runningSessionsTarget","Run sessions per week",`<select name="runningSessionsTarget"><option value="auto">Let Liberty Forge decide</option>${[1,2,3,4,5].map(n => `<option value="${n}" ${Number(p.runningSessionsTarget) === n ? "selected" : ""}>${n}</option>`).join("")}</select>`)}${field("runningBaseline.recentPerformanceDistance","Optional recent performance",`<select name="recentPerformanceDistance"><option value="">Skip</option>${["1 mile","2 mile","5K","10K","Half Marathon","Marathon","Other"].map(v => `<option ${p.runningBaseline.recentPerformanceDistance === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("runningBaseline.recentPerformanceTime","Recent time (optional)",`<input name="recentPerformanceTime" value="${html(p.runningBaseline.recentPerformanceTime)}" placeholder="HH:MM:SS or MM:SS">`)}</div></div>`,
      5: `<div class="hybrid-step"><p class="eyebrow">STEP 5 OF 9</p><h3>How should runs be prescribed?</h3>${radioCards("runPrescriptionStyle", [["distance","Distance Based","Make distance the primary target and show estimated duration."],["time","Time Based","Make duration the primary target and show estimated distance."]], p.runPrescriptionStyle || "distance")}<h3>How should run intensity be shown?</h3>${radioCards("runningIntensityDisplay", [["rpe","RPE","Use perceived effort only."],["pace-rpe","Pace + RPE","Default guidance with effort as the fallback."],["heart-rate-rpe","Heart Rate + RPE","Use heart-rate guidance without requiring pace."],["pace-heart-rate-rpe","Pace + Heart Rate + RPE","Show all available guidance without requiring a device."]], p.runningIntensityDisplay)}<p class="small-note">RPE always remains available and should guide the run when weather or terrain makes pace misleading.</p></div>`,
      6: `<div class="hybrid-step"><p class="eyebrow">STEP 6 OF 9</p><h3>Race goal</h3>${p.hybridPriority !== "race" ? `<label class="toggle-row"><input name="raceEnabled" type="checkbox" ${p.raceGoal.enabled ? "checked" : ""}><span>Add an optional race goal</span></label>` : `<p>A race date is required for Race Hybrid.</p>`}<div class="hybrid-form-grid race-fields ${!p.raceGoal.enabled && p.hybridPriority !== "race" ? "muted-fields" : ""}">${field("raceGoal.distance","Distance",`<select name="raceDistance">${["5K","10K","Half Marathon","Marathon","Other"].map(v => `<option ${p.raceGoal.distance === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("raceGoal.date","Race date",`<input name="raceDate" type="date" value="${p.raceGoal.date}">`)}${field("raceGoal.goal","Goal",`<select name="raceGoalText">${["Finish comfortably","Improve previous time","Target finish time"].map(v => `<option ${p.raceGoal.goal === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("raceGoal.targetTime","Target time (optional)",`<input name="targetTime" value="${html(p.raceGoal.targetTime)}" placeholder="Example: 1:55:00">`)}</div></div>`,
      7: `<div class="hybrid-step"><p class="eyebrow">STEP 7 OF 9</p><h3>Recovery and limitations</h3><div data-field-key="recoveryPreferences.limitations"><div class="limitation-grid">${["None","Knee","Shin","Achilles / calf","Foot / plantar","Hip","Lower back","Other"].map(v => `<label><input type="checkbox" name="limitations" value="${v}" ${p.recoveryPreferences.limitations.includes(v) ? "checked" : ""}> ${v}</label>`).join("")}</div><small class="hybrid-field-error"></small></div><div class="hybrid-form-grid">${field("recoveryPreferences.sleep","Typical sleep",`<select name="typicalSleep">${["poor","fair","good","great"].map(v => `<option value="${v}" ${p.recoveryPreferences.sleep === v ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select>`)}${field("recoveryPreferences.fatigue","Typical general fatigue",`<select name="typicalFatigue">${["low","normal","high"].map(v => `<option value="${v}" ${p.recoveryPreferences.fatigue === v ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select>`)}</div><p class="safety-note">These are training-modification inputs only. Fleeman Fitness does not diagnose injuries.</p></div>`,
      8: combinedScheduleMarkup(p),
      9: `<div class="hybrid-step"><p class="eyebrow">STEP 9 OF 9</p><h3>Review and advanced options</h3><div class="builder-review-card"><strong>${PRIORITY_NAMES[p.hybridPriority]}</strong><p>${p.availableDays.length} available days • ${p.strengthSessionsTarget === "auto" ? "Engine-selected" : p.strengthSessionsTarget} strength • ${p.runningSessionsTarget === "auto" ? "Engine-selected" : p.runningSessionsTarget} runs</p></div><details class="advanced-options"><summary>Advanced options</summary><h4>Strength</h4><div class="hybrid-form-grid">${field("advanced.preferredSplit","Preferred split",`<select name="preferredSplit"><option value="auto">Let the engine decide</option>${["Upper / Lower","Full Body","Push / Pull / Legs"].map(v => `<option ${p.advanced.preferredSplit === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("advanced.sessionDuration","Session-duration limit",`<input name="sessionDuration" type="number" min="20" max="180" value="${p.advanced.sessionDuration}">`)}${field("advanced.minLiftingDays","Minimum lifting days",`<input name="minLiftingDays" type="number" min="1" max="4" value="${p.advanced.minLiftingDays}">`)}${field("advanced.maxLiftingDays","Maximum lifting days",`<input name="maxLiftingDays" type="number" min="2" max="6" value="${p.advanced.maxLiftingDays}">`)}${field("advanced.exercisesToAvoid","Exercises to avoid",`<textarea name="exercisesToAvoid">${html(p.advanced.exercisesToAvoid)}</textarea>`, true)}</div><h4>Running</h4><div class="hybrid-form-grid">${field("advanced.maximumRunningDays","Maximum running days",`<input name="maximumRunningDays" type="number" min="1" max="7" value="${p.advanced.maximumRunningDays}">`)}${field("advanced.speedworkPreference","Speedwork preference",`<select name="speedworkPreference"><option value="auto">Let the engine decide</option><option value="none" ${p.advanced.speedworkPreference === "none" ? "selected" : ""}>No formal speedwork</option><option value="strides" ${p.advanced.speedworkPreference === "strides" ? "selected" : ""}>Strides first</option><option value="structured" ${p.advanced.speedworkPreference === "structured" ? "selected" : ""}>Structured quality when eligible</option></select>`)}${field("advanced.preferredLongRunDuration","Preferred long-run duration",`<input name="preferredLongRunDuration" type="number" min="20" max="300" value="${html(p.advanced.preferredLongRunDuration)}" placeholder="Minutes">`)}${field("advanced.knownEasyPace","Known easy pace (optional)",`<input name="knownEasyPace" value="${html(p.advanced.knownEasyPace)}" placeholder="Example: 10:30/mi">`)}${field("advanced.heartRateZones","Heart-rate zones (optional)",`<input name="heartRateZones" value="${html(p.advanced.heartRateZones)}" placeholder="Example: Z2 125–145">`)}</div><h4>Recovery and scheduling</h4><div class="hybrid-form-grid">${field("advanced.maxConsecutiveDays","Maximum consecutive training days",`<input name="maxConsecutiveDays" type="number" min="1" max="7" value="${p.advanced.maxConsecutiveDays}">`)}${field("advanced.hoursBetweenMajor","Preferred hours between major sessions",`<input name="hoursBetweenMajor" type="number" min="3" max="72" value="${p.advanced.hoursBetweenMajor}">`)}${field("advanced.stressDistribution","Stress distribution",`<select name="stressDistribution"><option value="spread" ${p.advanced.stressDistribution === "spread" ? "selected" : ""}>Spread stress</option><option value="balanced" ${p.advanced.stressDistribution === "balanced" ? "selected" : ""}>Balanced stress</option></select>`)}</div></details><p class="small-note">The engine will build a session inventory first, test multiple schedules, and explain the selected week.</p></div>`
    };
    document.querySelector("#hybridBuilderBody").innerHTML = parts[step];
    if (p.scheduleType === "rolling" && step === 4) document.querySelector('[data-field-key="runningSessionsTarget"] > span').textContent = "Run sessions per cycle";
    if (step === 9) document.querySelector(".builder-review-card p").textContent = `${p.scheduleType === "rolling" ? `${p.rollingCycleLength} rolling days × ${p.rollingNormalCycles} cycles` : `${p.trainingDays} target days from ${p.availableDays.length} available weekdays`} • ${strengthWorkoutsForBuilder(p).length} Strength workouts • ${p.runningSessionsTarget === "auto" ? "Engine-selected" : p.runningSessionsTarget} runs • ${p.runPrescriptionStyle === "time" ? "Time-based" : "Distance-based"} runs`;
    document.querySelector("#hybridBuilderBack").textContent = step === 1 ? "Save & close" : "Back";
    document.querySelector("#hybridBuilderNext").textContent = step === 9 ? "Build my Hybrid program" : "Continue";
    restoreSelectValues();
    document.querySelectorAll(".hybrid-choice input").forEach(input => input.addEventListener("change", () => document.querySelectorAll(`input[name="${input.name}"]`).forEach(item => item.closest(".hybrid-choice")?.classList.toggle("selected", item.checked))));
    document.querySelectorAll('input[name="scheduleType"]').forEach(input => input.addEventListener("change", () => { builder.scheduleType = input.value; renderBuilderStep(); }));
    if (step === 3) bindStrengthSetupActions();
  }

  function restoreSelectValues() {
    const map = { longRunDay: Config.weekdayId(builder.schedulingPreferences.longRunDay), heavyLowerDay: Config.weekdayId(builder.schedulingPreferences.heavyLowerDay), restDay: Config.weekdayId(builder.schedulingPreferences.restDay), preferredTrainingTimes: builder.preferredTrainingTimes[0] };
    Object.entries(map).forEach(([name, value]) => { const input = document.querySelector(`#hybridBuilderForm [name="${name}"]`); if (input) input.value = value; });
  }

  function clearBuilderErrors() { document.querySelectorAll("#hybridBuilderForm .invalid-field").forEach(node => node.classList.remove("invalid-field")); document.querySelectorAll("#hybridBuilderForm .hybrid-field-error").forEach(node => node.textContent = ""); }
  function showBuilderErrors(errors) {
    clearBuilderErrors();
    Object.entries(errors).forEach(([key, message]) => {
      const holder = document.querySelector(`#hybridBuilderForm [data-field-key="${CSS.escape(key)}"]`);
      if (!holder) return;
      holder.classList.add("invalid-field"); holder.querySelector(".hybrid-field-error").textContent = message;
    });
    const first = document.querySelector("#hybridBuilderForm .invalid-field");
    first?.scrollIntoView({ behavior: "smooth", block: "center" }); first?.querySelector("input,select,textarea,button")?.focus({ preventScroll: true });
  }

  function readBuilderStep(validate = false) {
    const form = document.querySelector("#hybridBuilderForm"), step = builder.currentStep, errors = {};
    const value = name => form.elements[name]?.value;
    if (step === 1) { builder.hybridPriority = value("hybridPriority") || ""; if (validate && !builder.hybridPriority) errors.hybridPriority = "Choose the outcome that matters most."; builder.raceGoal.enabled ||= builder.hybridPriority === "race"; }
    if (step === 2) {
      builder.strengthSourceMode = value("strengthSourceMode") || "";
      if (validate && !builder.strengthSourceMode) errors.strengthSourceMode = "Choose whether to use your Strength plan or let Liberty Forge build it.";
      if (builder.strengthSourceMode === "generated" && !builder.generatedStrengthWorkouts?.length) builder.generatedStrengthWorkouts = StrengthAdapter.buildStrengthForMe(builder.hybridPriority, PREMADE_PROGRAM_TEMPLATES, templateExercisePrescription);
    }
    if (step === 3) {
      const workouts = strengthWorkoutsForBuilder();
      builder.strengthSessionsTarget = workouts.length;
      if (validate && !workouts.length) errors.strengthWorkouts = builder.strengthSourceMode === "mine" ? "Add at least one complete Strength workout." : "Generate at least one complete Strength workout.";
      if (validate && workouts.some(workout => !workout.exercises?.length)) errors.strengthWorkouts = "Every selected Strength workout must contain at least one exercise.";
    }
    if (step === 4) { Object.assign(builder.runningBaseline, { experience: value("runningExperience"), consistency: value("runningConsistency"), runsPerWeek: Number(value("runsPerWeek")), weeklyMileage: Number(value("weeklyMileage")), longestRun: Number(value("longestRun")), recentPerformanceDistance: value("recentPerformanceDistance"), recentPerformanceTime: value("recentPerformanceTime"), recentPerformance: [value("recentPerformanceDistance"), value("recentPerformanceTime")].filter(Boolean).join(" in ") }); builder.runningSessionsTarget = value("runningSessionsTarget"); if (validate && (builder.runningBaseline.runsPerWeek < 0 || builder.runningBaseline.runsPerWeek > 5)) errors["runningBaseline.runsPerWeek"] = "Choose current runs per week from 0 through 5+."; if (validate && (builder.runningBaseline.weeklyMileage < 0 || builder.runningBaseline.weeklyMileage > 300)) errors["runningBaseline.weeklyMileage"] = "Enter a weekly distance from 0 through 300."; if (validate && (builder.runningBaseline.longestRun < 0 || builder.runningBaseline.longestRun > 100)) errors["runningBaseline.longestRun"] = "Enter a longest run from 0 through 100."; if (validate && builder.runningBaseline.longestRun > builder.runningBaseline.weeklyMileage && builder.runningBaseline.weeklyMileage > 0) errors["runningBaseline.longestRun"] = "Longest run should not exceed the whole weekly distance."; }
    if (step === 5) { builder.runPrescriptionStyle = value("runPrescriptionStyle") || "distance"; builder.runningIntensityDisplay = value("runningIntensityDisplay"); if (validate && !builder.runPrescriptionStyle) errors.runPrescriptionStyle = "Choose distance-based or time-based run targets."; if (validate && !builder.runningIntensityDisplay) errors.runningIntensityDisplay = "Choose an intensity display."; }
    if (step === 6) { builder.raceGoal.enabled = builder.hybridPriority === "race" || Boolean(form.elements.raceEnabled?.checked); Object.assign(builder.raceGoal, { distance: value("raceDistance"), date: value("raceDate"), goal: value("raceGoalText"), targetTime: value("targetTime") }); if (validate && builder.raceGoal.enabled && !builder.raceGoal.date) errors["raceGoal.date"] = "Choose the race date."; if (validate && builder.raceGoal.date && builder.raceGoal.date <= today()) errors["raceGoal.date"] = "Choose a future race date."; if (validate && builder.raceGoal.enabled && builder.raceGoal.goal === "Target finish time" && !builder.raceGoal.targetTime) errors["raceGoal.targetTime"] = "Enter the target finish time."; }
    if (step === 7) { const limitations = [...form.querySelectorAll('[name="limitations"]:checked')].map(i => i.value); builder.recoveryPreferences.limitations = limitations.includes("None") && limitations.length > 1 ? limitations.filter(v => v !== "None") : limitations; builder.recoveryPreferences.sleep = value("typicalSleep"); builder.recoveryPreferences.fatigue = value("typicalFatigue"); if (validate && !builder.recoveryPreferences.limitations.length) errors["recoveryPreferences.limitations"] = "Choose None or at least one limitation."; }
    if (step === 8) {
      builder.scheduleType = value("scheduleType") || builder.scheduleType || "weekly";
      builder.twoADayPreference = value("twoADayPreference");
      builder.preferredTrainingTimes = [value("preferredTrainingTimes")];
      if (builder.scheduleType === "rolling") {
        builder.rollingCycleLength = Number(value("rollingCycleLength"));
        builder.rollingNormalCycles = Number(value("rollingNormalCycles"));
        if (validate && (builder.rollingCycleLength < 3 || builder.rollingCycleLength > 21)) errors.rollingCycleLength = "Choose a rolling cycle from 3 through 21 days.";
        if (validate && (builder.rollingNormalCycles < 1 || builder.rollingNormalCycles > 20)) errors.rollingNormalCycles = "Choose 1 through 20 cycles.";
      } else {
        builder.trainingDays = Number(value("trainingDays"));
        builder.availableDays = [...form.querySelectorAll('[name="availableDays"]:checked')].map(i => Number(i.value));
        if (validate && (builder.trainingDays < 3 || builder.trainingDays > 7)) errors.trainingDays = "Choose 3 through 7 intended training days.";
        if (validate && !builder.availableDays.length) errors.availableDays = "Choose at least one available day.";
        else if (validate && builder.availableDays.length < builder.trainingDays) errors.availableDays = `Choose at least ${builder.trainingDays} available days, or lower the intended training days.`;
      }
      Object.assign(builder.schedulingPreferences, { longRunDay: value("longRunDay") ?? builder.schedulingPreferences.longRunDay, heavyLowerDay: value("heavyLowerDay") ?? builder.schedulingPreferences.heavyLowerDay, restDay: value("restDay") ?? builder.schedulingPreferences.restDay, runningSurface: value("runningSurface") });
    }
    if (step === 9) { ["sessionDuration","minLiftingDays","maxLiftingDays","maximumRunningDays","preferredLongRunDuration","maxConsecutiveDays","hoursBetweenMajor"].forEach(key => { if (form.elements[key]) builder.advanced[key] = value(key) === "" ? "" : Number(value(key)); }); ["preferredSplit","speedworkPreference","stressDistribution","knownEasyPace","heartRateZones","exercisesToAvoid"].forEach(key => { if (form.elements[key]) builder.advanced[key] = value(key); }); if (validate && (builder.advanced.sessionDuration < 20 || builder.advanced.sessionDuration > 180)) errors["advanced.sessionDuration"] = "Choose a session limit from 20 through 180 minutes."; if (validate && builder.advanced.minLiftingDays > builder.advanced.maxLiftingDays) errors["advanced.maxLiftingDays"] = "Maximum lifting days must be at least the minimum."; if (validate && (builder.advanced.maximumRunningDays < 1 || builder.advanced.maximumRunningDays > 7)) errors["advanced.maximumRunningDays"] = "Choose 1 through 7 maximum running days."; if (validate && (builder.advanced.maxConsecutiveDays < 1 || builder.advanced.maxConsecutiveDays > 7)) errors["advanced.maxConsecutiveDays"] = "Choose 1 through 7 consecutive training days."; if (validate && (builder.advanced.hoursBetweenMajor < 3 || builder.advanced.hoursBetweenMajor > 72)) errors["advanced.hoursBetweenMajor"] = "Choose 3 through 72 preferred hours."; }
    builder.updatedAt = new Date().toISOString(); data.hybridBuilderDraft = clone(builder); persist();
    document.querySelector("#hybridBuilderSaveStatus").textContent = `Draft saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    if (validate && Object.keys(errors).length) { showBuilderErrors(errors); return false; }
    clearBuilderErrors(); return true;
  }

  function closeBuilder() { if (builder) readBuilderStep(false); document.querySelector("#hybridBuilderDialog")?.close(); builderTrigger?.focus({ preventScroll: true }); builder = null; builderTrigger = null; renderProgramModeCards?.(); }
  function openHybridBuilder(priority = "balanced", trigger = null) {
    ensureHybridData(); builderTrigger = trigger;
    const existing = data.hybridBuilderDraft?.hybridPriority === priority ? data.hybridBuilderDraft : null;
    const generated = data.hybridPrograms.drafts.find(program => program.hybridPriority === priority);
    builder = clone(existing || generated?.setup || defaultBuilder(priority)); builder.currentStep = Number(builder.currentStep) || 1; builder.scheduleType ||= "weekly"; builder.rollingCycleLength ||= 8; builder.rollingNormalCycles ||= 4; builder.runPrescriptionStyle ||= "distance"; builder.strengthWorkoutSnapshots ||= []; builder.generatedStrengthWorkouts ||= []; if (!builder.strengthSourceMode && (existing || generated)) builder.strengthSourceMode = "generated"; normalizeSchedulingPreferenceDays(builder);
    renderBuilderStep(); document.querySelector("#hybridBuilderDialog").showModal();
  }

  function finishBuilder() {
    let generated;
    const strengthWorkouts = strengthWorkoutsForBuilder();
    const schedulerSetup = { ...builder, selectedStrengthWorkoutCount: strengthWorkouts.length, strengthSessionsTarget: strengthWorkouts.length, runHistory: data.runHistory };
    try { generated = Scheduler.generateHybridSchedule(schedulerSetup, strengthWorkouts); }
    catch (error) {
      const key = /consecutive/i.test(error.message) ? "advanced.maxConsecutiveDays" : /avoid/i.test(error.message) ? "advanced.exercisesToAvoid" : "strengthWorkouts";
      document.querySelector("#hybridBuilderForm details.advanced-options")?.setAttribute("open", "");
      showBuilderErrors({ [key]: error.message });
      return;
    }
    const existing = data.hybridPrograms.drafts.find(program => program.builderId === builder.id);
    const rolling = builder.scheduleType === "rolling";
    const totalWeeks = rolling ? Number(builder.rollingNormalCycles || 4) : builder.raceGoal.enabled && builder.raceGoal.date ? Math.max(4, Math.min(20, Math.ceil((new Date(builder.raceGoal.date) - new Date()) / 604800000))) : 4;
    const program = {
      id: existing?.id || id("hybrid"), builderId: builder.id, schemaVersion: Config.SCHEMA_VERSION || 1, programMode: "hybrid", hybridPriority: builder.hybridPriority,
      name: `${PRIORITY_NAMES[builder.hybridPriority]} Block`, status: "draft", createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), startDate: today(), scheduleType: builder.scheduleType || "weekly", totalWeeks, totalCycles: rolling ? totalWeeks : null, cycleLength: rolling ? Number(builder.rollingCycleLength || generated.cycleLength || 8) : null,
      setup: clone(schedulerSetup), strengthWorkouts: clone(strengthWorkouts), schedule: generated.schedule, scheduleScore: generated.score, conflicts: generated.conflicts, loadSummary: generated.loadSummary, why: generated.why, racePhase: generated.racePhase, preferenceDecision: generated.preferenceDecision || null,
      alternativesEvaluated: generated.alternativesEvaluated, progress: existing?.progress || { completed: [], skipped: [], rescheduled: [], reviewedWeeks: [] }, progressionDecisions: existing?.progressionDecisions || [], deferredStrengthProgression: [], recoveryWeekState: 0
    };
    data.hybridPrograms.drafts = data.hybridPrograms.drafts.filter(item => item.id !== program.id); data.hybridPrograms.drafts.unshift(program); data.hybridBuilderDraft = null;
    builder = null; document.querySelector("#hybridBuilderDialog").close(); saveData(); renderHybridBuildPanel(); renderProgramModeCards?.(); openHybridProgram(program.id);
  }

  function allHybridPrograms() { return [data.hybridPrograms.active, ...data.hybridPrograms.drafts, ...data.hybridPrograms.completed].filter(Boolean); }
  function findProgram(programId) { return allHybridPrograms().find(program => program.id === programId) || null; }
  function occurrence(program, week, dayIndex, session) { return { program, week, cycle: isRolling(program) ? week : null, dayIndex, session, occurrenceId: `${week}:${dayIndex}:${session.id}` }; }
  function isResolved(program, occurrenceId) { return program.progress.completed.some(item => item.occurrenceId === occurrenceId) || program.progress.skipped.some(item => item.occurrenceId === occurrenceId); }
  function scheduleForWeek(program, week) { return program.weeklyOverrides?.[week] || program.schedule; }
  function weekOccurrences(program, week = currentWeek(program)) { return scheduleForWeek(program, week).flatMap(day => day.sessions.map(session => occurrence(program, week, day.dayIndex, session))); }
  function currentActionableDay(program = data.hybridPrograms.active) {
    if (!program) return null;
    const week = currentWeek(program), dayNow = mondayIndex();
    if (isRolling(program)) {
      const open = weekOccurrences(program, week).filter(item => !isResolved(program, item.occurrenceId));
      if (!open.length) return null;
      const first = open[0];
      return { ...scheduleForWeek(program, week)[first.dayIndex], occurrences: open.filter(item => item.dayIndex === first.dayIndex) };
    }
    const activationFloor = week === 1 && Number.isInteger(program.activationDayIndex) ? program.activationDayIndex : 0;
    const days = scheduleForWeek(program, week).map(day => ({ ...day, occurrences: day.sessions.map(session => occurrence(program, week, day.dayIndex, session)).filter(item => !isResolved(program, item.occurrenceId)) })).filter(day => day.dayIndex >= activationFloor && day.occurrences.length);
    return days.find(day => day.dayIndex < dayNow) || days.find(day => day.dayIndex === dayNow) || days.find(day => day.dayIndex > dayNow) || null;
  }
  function nextActionable(program = data.hybridPrograms.active) {
    if (!program) return null;
    const week = currentWeek(program), dayNow = mondayIndex();
    if (isRolling(program)) return weekOccurrences(program, week).find(item => !isResolved(program, item.occurrenceId)) || null;
    const activationFloor = week === 1 && Number.isInteger(program.activationDayIndex) ? program.activationDayIndex : 0;
    const open = weekOccurrences(program, week).filter(item => item.dayIndex >= activationFloor && !isResolved(program, item.occurrenceId));
    return open.find(item => item.dayIndex < dayNow) || open.find(item => item.dayIndex === dayNow) || open.find(item => item.dayIndex > dayNow) || null;
  }
  function nextFuturePeriodActionable(program = data.hybridPrograms.active) {
    if (!program || isRolling(program)) return null;
    const firstFutureWeek = currentWeek(program) + 1;
    for (let week = firstFutureWeek; week <= Number(program.totalWeeks || 4); week += 1) {
      const next = weekOccurrences(program, week).find(item => !isResolved(program, item.occurrenceId));
      if (next) return next;
    }
    return null;
  }
  function programProgress(program) {
    const total = (isRolling(program) ? program.totalCycles || program.totalWeeks || 4 : program.totalWeeks || 4) * program.schedule.reduce((sum, day) => sum + day.sessions.length, 0);
    const done = program.progress.completed.length + program.progress.skipped.length;
    return { total, done, percent: total ? Math.min(100, Math.round(done / total * 100)) : 0 };
  }
  function runDistanceText(session, program) { return `${Number(session.targetDistance || 0).toFixed(1)} ${distanceUnit(program)}`; }
  function runDurationText(session) { return session.estimatedDurationLabel || (session.targetDuration ? `~${session.targetDuration} min` : "Estimated time unavailable"); }
  function sessionSummary(session, program = data.hybridPrograms?.active) {
    if (session.type === "rest") return "Planned recovery • advance when complete";
    if (session.type === "run" || session.type === "recovery") {
      const distance = session.targetDistance ? runDistanceText(session, program) : "Distance estimate unavailable";
      const primary = session.prescriptionStyle === "time" ? `${session.targetDuration || 20} min` : distance;
      const secondary = session.prescriptionStyle === "time" ? `estimated ${session.estimatedDistanceLabel || distance}` : `estimated ${runDurationText(session)}`;
      return `${session.runType || session.title} • ${primary} • ${secondary} • RPE ${session.rpeTarget}`;
    }
    return `${session.subtype || "Strength"} • ${session.exerciseCount || "saved"} exercises • priority ${session.priority}`;
  }
  function whyMarkup(explanation, options = {}) { return typeof progressionWhyMarkup === "function" ? progressionWhyMarkup(explanation, options) : ""; }
  function progressionChangeMarkup(session, program) {
    const change = session?.progressionDecision;
    if (!change?.reason) return "";
    let value = "";
    if ((session.type === "run" || session.type === "recovery") && Number.isFinite(Number(change.previous?.targetDistance)) && Number.isFinite(Number(change.current?.targetDistance))) value = `${Number(change.previous.targetDistance).toFixed(1)} → ${Number(change.current.targetDistance).toFixed(1)} ${distanceUnit(program)}`;
    if (session.type === "strength" && Number.isFinite(Number(change.previous?.volumeMultiplier)) && Number.isFinite(Number(change.current?.volumeMultiplier))) value = `${Math.round(Number(change.previous.volumeMultiplier) * 100)}% → ${Math.round(Number(change.current.volumeMultiplier) * 100)}% volume`;
    return `<div class="progression-change"><strong>${html(change.action || "Updated")}</strong>${value ? `<span>${html(value)}</span>` : ""}</div>${whyMarkup(change.reason)}`;
  }
  function conflictMarkup(conflicts = []) {
    if (!conflicts.length) return `<div class="conflict-banner green"><strong>Green schedule</strong><span>No meaningful strength–run conflicts were detected.</span></div>`;
    return conflicts.map(item => `<div class="conflict-banner ${item.rating}"><strong>${html(item.rating.toUpperCase())} conflict</strong><span>${html(item.message || item.reason || "Closely spaced sessions may compete for recovery.")}</span></div>`).join("");
  }
  function moveOptions(program, currentIndex) {
    const names = isRolling(program) ? program.schedule.map((_, index) => `Cycle Day ${index + 1}`) : Config.DAYS;
    return names.map((name, index) => `<option value="${index}" ${index === currentIndex ? "selected" : ""}>${name}</option>`).join("");
  }
  function scheduleMarkup(program, editable = false) {
    return `<div class="hybrid-week-grid">${program.schedule.map(day => { const restDay = day.sessions.length === 0 || day.sessions.every(session => session.type === "rest"); return `<article class="hybrid-day-card ${restDay ? "rest" : ""}"><div class="hybrid-day-heading"><strong>${day.day}</strong><span>${restDay ? "Rest" : day.sessionType}</span></div>${day.sessions.length ? day.sessions.map(session => `<div class="hybrid-session ${session.type}"><div><span class="session-priority priority-${session.priority}">${session.priority}</span><strong>${html(session.title)}</strong><small>${html(sessionSummary(session, program))}</small>${progressionChangeMarkup(session, program)}${session.type === "strength" ? `<div class="hybrid-session-actions"><button class="secondary-button compact" type="button" data-preview-hybrid-strength="${html(session.workoutId)}">Preview Workout</button>${editable ? `<button class="secondary-button compact" type="button" data-edit-hybrid-strength="${html(session.workoutId)}">Edit Strength</button>` : ""}</div>` : ""}</div>${editable && session.type !== "rest" ? `<label class="move-session-label">Move<select data-move-session="${session.id}">${moveOptions(program, day.dayIndex)}</select></label>` : ""}</div>`).join("") + (day.sessions.length > 1 ? `<p class="separation-guidance">Keep about ${day.separationHours || 6}+ hours between sessions when practical.</p>` : "") : `<p class="small-note">Recovery day</p>`}</article>`; }).join("")}</div>`;
  }

  function hybridProgramWorkout(program, workoutId) {
    return program.strengthWorkouts?.find(workout => workout.id === workoutId) || data.workouts.find(workout => workout.id === workoutId) || null;
  }

  function refreshProgramScheduleMetrics(program) {
    const scored = Scheduler.scoreHybridSchedule(program.schedule, program.setup || program);
    const sessions = program.schedule.flatMap(day => day.sessions).filter(session => session.type !== "rest");
    const runSessions = sessions.filter(session => session.type === "run" || session.type === "recovery");
    const strengthSessions = sessions.filter(session => session.type === "strength");
    program.scheduleScore = scored.score;
    program.conflicts = scored.conflicts;
    program.loadSummary = {
      ...(program.loadSummary || {}), ...scored.countValidation,
      strengthSessions: strengthSessions.length,
      runningSessions: runSessions.length,
      runningDistance: Number(runSessions.reduce((sum, session) => sum + Number(session.targetDistance || 0), 0).toFixed(1)),
      hardSessions: sessions.filter(session => Number(session.stress?.overall || 0) >= 4 || session.subtype === "Heavy Lower").length,
      lowerBody: Stress.stressLabel(Math.max(0, ...scored.dayStress.map(item => item.lowerBody))),
      upperBody: Stress.stressLabel(Math.max(0, ...scored.dayStress.map(item => item.upperBody))),
      cardio: Stress.stressLabel(Math.max(0, ...scored.dayStress.map(item => item.cardio))),
      recoveryBalance: scored.conflicts.some(item => item.rating === "red") ? "Needs Review" : scored.conflicts.some(item => item.rating === "orange") ? "Manageable" : "Good"
    };
    program.scheduleNeedsReview = scored.conflicts.some(item => ["orange", "red"].includes(item.rating));
    program.updatedAt = new Date().toISOString();
    persist();
  }

  function recalculateProgramStrength(program, updatedWorkout) {
    program.strengthWorkouts = StrengthAdapter.replaceWorkout(program.strengthWorkouts || [], updatedWorkout);
    program.schedule.forEach(day => day.sessions.forEach(session => {
      if (session.type !== "strength" || session.workoutId !== updatedWorkout.id) return;
      const analysis = strengthAnalysis(updatedWorkout);
      session.title = updatedWorkout.name;
      session.subtype = analysis.classification;
      session.exerciseCount = analysis.exerciseCount;
      session.stress = analysis.stress;
    }));
    const analysis = strengthAnalysis(updatedWorkout);
    program.why = [`${updatedWorkout.name} was re-analyzed after editing: ${analysis.classification}, ${Stress.stressLabel(analysis.stress.lowerBody)} lower-body stress.`, ...(program.why || []).filter(reason => !reason.startsWith(`${updatedWorkout.name} was re-analyzed`))];
    refreshProgramScheduleMetrics(program);
  }

  function previewProgramStrength(program, workoutId, trigger) {
    const workout = hybridProgramWorkout(program, workoutId);
    if (!workout) return;
    const analysis = strengthAnalysis(workout);
    openWorkoutPreview(workout, { trigger, startAction: null, extraSummary: `<p class="hybrid-preview-stress"><strong>Hybrid stress:</strong> ${html(analysis.classification)} • Upper ${Stress.stressLabel(analysis.stress.upperBody)} • Lower ${Stress.stressLabel(analysis.stress.lowerBody)} • Overall ${Stress.stressLabel(analysis.stress.overall)}</p>` });
  }

  function editProgramStrength(program, workoutId) {
    const workout = hybridProgramWorkout(program, workoutId);
    if (!workout) return;
    document.querySelector("#hybridProgramDialog")?.close();
    openWorkoutEditor(clone(workout), {
      saveToLibrary: false,
      title: "Edit Hybrid Strength workout",
      onSave: saved => { recalculateProgramStrength(program, saved); renderProgramReview(); document.querySelector("#hybridProgramDialog")?.showModal(); },
      onCancel: () => { renderProgramReview(); document.querySelector("#hybridProgramDialog")?.showModal(); }
    });
  }

  function closeProgramRunEditor(reopen = true) {
    document.querySelector("#hybridRunEditDialog")?.close();
    runEditContext = null;
    if (reopen) { renderProgramReview(); document.querySelector("#hybridProgramDialog")?.showModal(); }
  }

  function openProgramRunEditor(program, sessionId) {
    const session = program.schedule.flatMap(day => day.sessions).find(item => item.id === sessionId && (item.type === "run" || item.type === "recovery"));
    if (!session) return;
    runEditContext = { program, session };
    document.querySelector("#hybridProgramDialog")?.close();
    const form = document.querySelector("#hybridRunEditForm");
    form.elements.runType.value = session.runType || session.title || "Easy Run";
    form.elements.targetDistance.value = Number(session.targetDistance || 0).toFixed(1);
    form.elements.targetDuration.value = Number(session.targetDuration || session.estimatedDurationRange?.min || 30);
    form.elements.rpeTarget.value = session.rpeTarget || "3-4";
    document.querySelector("#hybridRunEditError").classList.add("hidden");
    document.querySelector("#hybridRunEditDialog")?.showModal();
  }

  function saveProgramRunEdit(event) {
    event.preventDefault();
    if (!runEditContext) return;
    const form = event.currentTarget;
    const runType = form.elements.runType.value;
    const targetDistance = Number(form.elements.targetDistance.value);
    const targetDuration = Number(form.elements.targetDuration.value);
    const rpeTarget = form.elements.rpeTarget.value.trim();
    const error = document.querySelector("#hybridRunEditError");
    if (!targetDistance || !targetDuration || !rpeTarget) { error.textContent = "Enter a valid distance, duration, and target RPE."; error.classList.remove("hidden"); return; }
    const { program, session } = runEditContext;
    const prescription = Scheduler.calculateRunPrescription(runType, program.setup || {}, program.setup?.runningBaseline || {}, { targetDistance, targetDuration });
    Object.assign(session, prescription, { runType, title: runType, targetDistance, targetDuration, rpeTarget, effortGuidance: Scheduler.runEffort(runType), structure: Scheduler.runStructure(runType, { ...prescription, targetDistance }) });
    session.priority = runType === "Long Easy Run" || /Threshold|Tempo|Marathon Pace|Intervals|Hills|Race/.test(runType) ? "A" : /Recovery/.test(runType) ? "C" : "B";
    session.stress = Stress.calculateRunStress(session, program.setup?.runningBaseline || {}, data.runHistory || []);
    program.why = [`${runType} was re-analyzed after editing: ${Stress.stressLabel(session.stress.overall)} running stress.`, ...(program.why || []).filter(reason => !/was re-analyzed after editing:.*running stress/i.test(reason))];
    refreshProgramScheduleMetrics(program);
    closeProgramRunEditor(true);
  }

  function renderProgramReview() {
    const program = findProgram(reviewProgramId); if (!program) return document.querySelector("#hybridProgramDialog")?.close();
    const body = document.querySelector("#hybridProgramBody"), load = program.loadSummary || {}, progress = programProgress(program);
    const startState = activationUi.programId === program.id ? activationUi.state : "idle";
    const startLabel = startState === "activating" ? "Starting Program..." : startState === "success" ? "Program Started" : startState === "error" ? "Try Again" : "Start this program";
    const startDisabled = ["activating", "success"].includes(startState);
    document.querySelector("#hybridProgramTitle").textContent = program.name;
    const pending = program.pendingMove;
    const durationSummary = isRolling(program) ? `${program.cycleLength || program.schedule.length}-day cycle × ${program.totalCycles || program.totalWeeks} cycles` : `${program.totalWeeks} weeks`;
    const calculatedTrainingDays = program.schedule.filter(day => day.sessions?.some(session => session.type !== "rest")).length;
    const trainingDaysUsed = Number(load.trainingDaysUsed ?? calculatedTrainingDays), targetDays = Number(load.targetTrainingDays || program.setup?.trainingDays || trainingDaysUsed);
    const unusedReason = load.unusedDaysReason || (trainingDaysUsed < targetDays ? "This older plan did not store a reason. Rebuild it to apply the improved day-use rules." : "");
    body.innerHTML = `<section class="hybrid-review-summary"><div><span class="program-mode-badge">${html(PRIORITY_NAMES[program.hybridPriority])} • ${isRolling(program) ? "ROLLING CYCLE" : "WEEKLY SCHEDULE"}</span><h3>${html(program.name)}</h3><p>${durationSummary} • ${load.strengthSessions || 0} strength + ${load.runningSessions || 0} runs • ${load.runningDistance ? `${load.runningDistance} planned ${program.setup?.runningDistanceUnit || (data.profile?.units === "metric" ? "kilometers" : "miles")}` : "run distance will be estimated from the saved prescription"}${program.racePhase?.name && program.racePhase.name !== "general" ? ` • ${html(program.racePhase.name)} race phase` : ""}</p></div><div class="schedule-score"><strong>${Math.round(program.scheduleScore || 0)}</strong><span>schedule score</span></div></section>
      <div class="load-summary-grid"><div><span>LOWER BODY</span><strong>${html(load.lowerBody || "Low")}</strong></div><div><span>UPPER BODY</span><strong>${html(load.upperBody || "Low")}</strong></div><div><span>CARDIO</span><strong>${html(load.cardio || "Low")}</strong></div><div><span>RECOVERY</span><strong>${html(load.recoveryBalance || "Good")}</strong></div></div>
      <section class="training-days-used"><span>TRAINING DAYS USED</span><strong>${trainingDaysUsed} of ${targetDays}</strong>${unusedReason ? `<p><b>Why?</b> ${html(unusedReason)}</p>` : `<p>The schedule uses the intended number of training days.</p>`}<small>${Number(load.totalSessions || program.schedule.flatMap(day => day.sessions || []).filter(session => session.type !== "rest").length)} sessions • ${Number(load.combinedDays || 0)} combined days • ${Number(load.restDays ?? Math.max(0, program.schedule.length - trainingDaysUsed))} rest days</small></section>
      <section class="why-schedule"><h3>Why this schedule?</h3>${(program.why || []).map(reason => `<p>◆ ${html(reason)}</p>`).join("")}<p class="small-note">${program.alternativesEvaluated || 0} candidate schedules were scored before selecting this one.</p></section>
      ${conflictMarkup(program.conflicts)}
      ${program.scheduleNeedsReview ? `<div class="conflict-banner orange"><strong>SCHEDULE NEEDS REVIEW</strong><span>A Strength workout changed enough to create an elevated conflict. Move the workout or review its lower-body workload.</span></div>` : ""}
      ${pending ? `<section class="pending-move ${pending.warning?.rating || "green"}"><h3>Review schedule change</h3><p>${pending.warning ? html(pending.warning.message || pending.warning.reason || "This move increases nearby training conflict.") : "This move does not create a major conflict."}</p><div class="exercise-actions"><button class="primary-button" data-move-decision="keep">Move anyway</button><button class="secondary-button" data-move-decision="recommended">Use recommended schedule</button><button class="secondary-button" data-move-decision="reduce">Modify strength stress</button></div></section>` : ""}
      ${scheduleMarkup(program, program.status !== "completed")}
      ${program.status === "active" ? `<div class="hybrid-progress"><span style="width:${progress.percent}%"></span></div><p class="small-note">${progress.done} of ${progress.total} sessions completed or skipped</p>` : ""}
      ${startState === "error" ? `<div class="program-activation-error" role="alert"><strong>COULDN'T START PROGRAM</strong><span>${html(activationUi.message || "Your program was not activated. Please try again.")}</span></div>` : ""}
      <div class="program-review-actions">${startState === "success" ? `<button class="primary-button" disabled>Program Started</button>` : program.status === "draft" ? `<button class="primary-button" data-program-action="start" ${startDisabled ? "disabled aria-busy=\"true\"" : ""}>${startLabel}</button><button class="secondary-button" data-program-action="edit" ${startDisabled ? "disabled" : ""}>Edit builder answers</button><button class="secondary-button" data-program-action="keep" ${startDisabled ? "disabled" : ""}>Keep as draft</button>` : program.status === "active" ? `<button class="primary-button" data-program-action="weekly">${isRolling(program) ? "Cycle review" : "Weekly review"}</button><button class="secondary-button" data-program-action="end">End program</button>` : `<button class="secondary-button" data-program-action="close">Close</button>`}</div>`;
    if (program.status !== "completed") {
      const runSessions = program.schedule.flatMap(day => day.sessions).filter(session => session.type === "run" || session.type === "recovery");
      body.querySelectorAll(".hybrid-session.run,.hybrid-session.recovery").forEach((node, index) => {
        const session = runSessions[index];
        if (!session) return;
        const actions = document.createElement("div");
        actions.className = "hybrid-session-actions";
        actions.innerHTML = `<button class="secondary-button compact" type="button" data-edit-hybrid-run="${html(session.id)}">Edit Run</button>`;
        node.querySelector("div")?.appendChild(actions);
      });
    }
    body.querySelectorAll("[data-move-session]").forEach(select => select.addEventListener("change", event => stageProgramMove(program, event.target.dataset.moveSession, Number(event.target.value))));
    body.querySelectorAll("[data-preview-hybrid-strength]").forEach(button => button.onclick = event => previewProgramStrength(program, button.dataset.previewHybridStrength, event.currentTarget));
    body.querySelectorAll("[data-edit-hybrid-strength]").forEach(button => button.onclick = () => editProgramStrength(program, button.dataset.editHybridStrength));
    body.querySelectorAll("[data-edit-hybrid-run]").forEach(button => button.onclick = () => openProgramRunEditor(program, button.dataset.editHybridRun));
    body.querySelectorAll("[data-move-decision]").forEach(button => button.onclick = () => resolveProgramMove(program, button.dataset.moveDecision));
    body.querySelectorAll("[data-program-action]").forEach(button => button.onclick = () => programAction(program, button.dataset.programAction));
  }

  function stageProgramMove(program, sessionId, dayIndex) {
    const result = Scheduler.rescheduleRemainingWeek(program, sessionId, dayIndex);
    program.pendingMove = { original: clone(program.schedule), proposed: result.program.schedule, warning: result.warning, sessionId, dayIndex };
    program.schedule = result.program.schedule; program.conflicts = result.program.conflicts; program.scheduleScore = result.program.scheduleScore; renderProgramReview();
  }
  function resolveProgramMove(program, decision) {
    if (!program.pendingMove) return;
    if (decision === "recommended") program.schedule = program.pendingMove.original;
    if (decision === "reduce") program.schedule.forEach(day => day.sessions.forEach(session => { if (session.id === program.pendingMove.sessionId && session.type === "strength") { session.volumeMultiplier = Math.min(Number(session.volumeMultiplier || 1), .75); session.holdProgression = true; } }));
    if (decision !== "recommended") program.progress.rescheduled.push({ date: new Date().toISOString(), sessionId: program.pendingMove.sessionId, targetDayIndex: program.pendingMove.dayIndex, decision });
    delete program.pendingMove; program.updatedAt = new Date().toISOString(); saveData(); renderProgramReview(); renderHybridBuildPanel(); renderHome();
  }
  function openHybridProgram(programId) { reviewProgramId = programId; renderProgramReview(); document.querySelector("#hybridProgramDialog").showModal(); }

  function validateProgramForActivation(program) {
    const errors = [];
    if (!program?.id) errors.push("The program identifier is missing.");
    if (!Object.keys(PRIORITY_NAMES).includes(program?.hybridPriority)) errors.push("Choose a valid Hybrid priority.");
    if (!Array.isArray(program?.schedule) || !program.schedule.length) errors.push("The combined schedule is missing.");
    const sessions = (program?.schedule || []).flatMap(day => day.sessions || []).filter(session => session.type !== "rest");
    const ids = sessions.map(session => session.id).filter(Boolean);
    if (!sessions.length) errors.push("Add scheduled Strength and running sessions.");
    if (ids.length !== sessions.length) errors.push("Every scheduled session needs an identifier.");
    if (new Set(ids).size !== ids.length) errors.push("Scheduled session identifiers must be unique.");
    const strengthSessions = sessions.filter(session => session.type === "strength");
    const runSessions = sessions.filter(session => session.type === "run" || session.type === "recovery");
    if (!strengthSessions.length) errors.push("At least one Strength session is required.");
    if (!runSessions.length) errors.push("At least one running session is required.");
    strengthSessions.forEach(session => {
      const workout = hybridProgramWorkout(program, session.workoutId);
      if (!workout?.exercises?.length) errors.push(`${session.title || "A Strength session"} is missing its workout exercises.`);
    });
    runSessions.forEach(session => {
      if (!(Number(session.targetDistance) > 0) || !(Number(session.targetDuration) > 0) || !session.rpeTarget) errors.push(`${session.title || "A running session"} needs distance, duration, and RPE.`);
    });
    if ((program?.schedule || []).some(day => !Number.isInteger(Number(day.dayIndex)))) errors.push("Every schedule day needs a valid position.");
    return { isValid: errors.length === 0, errors };
  }

  function showActivationStatus(state, title, message) {
    const notice = document.querySelector("#programActivationStatus");
    if (!notice) return;
    notice.classList.remove("hidden", "error");
    notice.classList.toggle("error", state === "error");
    document.querySelector("#programActivationStatusTitle").textContent = title;
    document.querySelector("#programActivationStatusMessage").textContent = message;
  }

  function hideActivationStatus() {
    document.querySelector("#programActivationStatus")?.classList.add("hidden");
  }

  function activationError(program, message) {
    activationUi = { state: "error", programId: program?.id || null, message };
    showActivationStatus("error", "COULDN'T START PROGRAM", message);
    renderProgramReview();
  }

  async function activateHybridProgram(program) {
    if (activationInProgress || data.hybridPrograms.active?.id === program?.id) return;
    const validation = validateProgramForActivation(program);
    if (!validation.isValid) {
      activationError(program, validation.errors.join(" "));
      return;
    }
    activationInProgress = true;
    activationUi = { state: "activating", programId: program.id, message: "" };
    hideActivationStatus();
    renderProgramReview();
    await new Promise(resolve => requestAnimationFrame(() => resolve()));
    if (data.hybridPrograms.active && data.hybridPrograms.active.id !== program.id && !confirm("Replace the currently active Hybrid program? It will remain saved as a draft.")) {
      activationInProgress = false;
      activationUi = { state: "idle", programId: null, message: "" };
      renderProgramReview();
      return;
    }
    const previousPrograms = clone(data.hybridPrograms);
    const previousBuilderDraft = clone(data.hybridBuilderDraft);
    try {
      const previousActive = data.hybridPrograms.active;
      if (previousActive && previousActive.id !== program.id) {
        previousActive.status = "draft";
        data.hybridPrograms.drafts = data.hybridPrograms.drafts.filter(item => item.id !== previousActive.id);
        data.hybridPrograms.drafts.unshift(previousActive);
      }
      data.hybridPrograms.drafts = data.hybridPrograms.drafts.filter(item => item.id !== program.id);
      program.status = "active";
      program.activatedAt = new Date().toISOString();
      program.startDate = today();
      program.activationDayIndex = isRolling(program) ? null : mondayIndex();
      program.reviewState = "started";
      data.hybridPrograms.active = program;
      data.hybridBuilderDraft = null;
      saveData();
      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (persisted?.hybridPrograms?.active?.id !== program.id) throw new Error("The active Hybrid program did not persist.");
      activationUi = { state: "success", programId: program.id, message: "" };
      renderProgramReview();
      showActivationStatus("success", "PROGRAM STARTED", `Your ${PRIORITY_NAMES[program.hybridPriority]} program is now active.`);
      await new Promise(resolve => setTimeout(resolve, 650));
      document.querySelector("#hybridProgramDialog")?.close();
      reviewProgramId = null;
      if (typeof history !== "undefined" && typeof history.replaceState === "function") history.replaceState({ ...(history.state || {}), view: "homeView", activatedHybridProgramId: program.id }, "", `${location.pathname}${location.search}`);
      activateAppView("homeView", { focus: true, scroll: false });
      renderHybridBuildPanel();
      renderHome();
      setTimeout(() => {
        hideActivationStatus();
        if (activationUi.programId === program.id && activationUi.state === "success") activationUi = { state: "idle", programId: null, message: "" };
      }, 1200);
    } catch (error) {
      data.hybridPrograms = previousPrograms;
      data.hybridBuilderDraft = previousBuilderDraft;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      console.warn("Hybrid activation failed:", error?.message || error);
      activationError(program, "Your program was not activated. Please try again.");
    } finally {
      activationInProgress = false;
    }
  }

  function programAction(program, action) {
    if (action === "close" || action === "keep") return document.querySelector("#hybridProgramDialog").close();
    if (action === "edit") { document.querySelector("#hybridProgramDialog").close(); data.hybridBuilderDraft = clone(program.setup); data.hybridBuilderDraft.currentStep = 1; openHybridBuilder(program.hybridPriority); return; }
    if (action === "start") return activateHybridProgram(program);
    if (action === "weekly") return renderWeeklyReview(program);
    if (action === "end") {
      if (!confirm("End this Hybrid program? Its completed training and history will be preserved.")) return;
      program.status = "completed"; program.endedAt = new Date().toISOString(); data.hybridPrograms.completed.unshift(program); data.hybridPrograms.active = null; saveData(); document.querySelector("#hybridProgramDialog").close(); renderHybridBuildPanel(); renderHome();
    }
  }

  function renderWeeklyReview(program) {
    const week = currentWeek(program), strengthEligibility = (program.strengthProgressionEligibility || []).filter(item => Number(item.week) === week), decision = Progression.weeklyDecision({ runHistory: data.runHistory.filter(run => run.programId === program.id), baseline: { ...program.setup.runningBaseline, classification: Scheduler.runningClassification(program.setup.runningBaseline) }, recoveryWeeks: program.recoveryWeekState || 0, priority: program.hybridPriority, strengthEligibility, deferredStrengthProgression: program.deferredStrengthProgression || [] });
    const runs = data.runHistory.filter(run => run.programId === program.id && Number(run.week) === week);
    const pain = runs.filter(run => Number(run.painRating) >= 3);
    const period = isRolling(program) ? "cycle" : "week";
    document.querySelector("#hybridProgramBody").innerHTML = `<section class="weekly-review"><p class="eyebrow">${period.toUpperCase()} ${week} REVIEW</p><h3>${decision.decision}</h3>${whyMarkup(decision.explanation)}<div class="load-summary-grid"><div><span>COMPLETION</span><strong>${Math.round(decision.running.summary.completionRate * 100)}%</strong></div><div><span>RUN DISTANCE</span><strong>${decision.running.summary.averageWeeklyDistance.toFixed(1)}</strong></div><div><span>EASY RPE / DRIFT</span><strong>${decision.running.summary.averageEasyRpe.toFixed(1)} / ${decision.running.summary.easyRpeDrift.toFixed(1)}</strong></div><div><span>HARD RUNS / ${period.toUpperCase()}</span><strong>${decision.running.summary.hardSessionsPerWeek.toFixed(1)}</strong></div></div><h3>Next-${period} recommendation</h3><p>Running volume: ${Math.round(decision.runningVolumeMultiplier * 100)}% • Strength volume: ${Math.round(decision.strengthVolumeMultiplier * 100)}%. Only one running progression lever changes at a time.</p>${decision.strengthBudget.length ? `<div class="strength-budget"><h3>Strength progression budget</h3>${decision.strengthBudget.map(item => `<article class="strength-progression-decision"><p><strong>${html(item.exerciseName || item.exerciseId)}</strong> — ${item.deferred ? "progression held" : item.applied ? "progression applied" : "eligible"}${Number.isFinite(Number(item.previousWeight)) && Number.isFinite(Number(item.newWeight)) ? `<br><span>${Number(item.previousWeight)} → ${Number(item.newWeight)} ${weightUnit(data.profile?.units)}</span>` : ""}</p>${whyMarkup(item.explanation)}</article>`).join("")}</div>` : `<p class="small-note">No earned strength progressions are waiting for coordination this ${period}.</p>`}${pain.length ? `<div class="recovery-warning"><strong>Pain remains separate from fatigue.</strong><p>Review ${pain.map(item => `${html(item.painLocation)} ${item.painRating}/5`).join(", ")} before approving the next ${period}.</p></div>` : ""}<p class="small-note">Major substitutions and volume changes require approval. You may edit minor load and RIR changes before approval.</p><div class="program-review-actions"><button id="approveHybridWeek" class="primary-button">Approve next ${period}</button><button id="backHybridWeek" class="secondary-button">Back to schedule</button></div></section>`;
    document.querySelector("#approveHybridWeek").onclick = () => { applyWeeklyDecision(program, decision, week); };
    document.querySelector("#backHybridWeek").onclick = renderProgramReview;
  }
  function applyWeeklyDecision(program, decision, week) {
    const nextWeek = Math.min(program.totalWeeks, Number(week) + 1);
    const nextSchedule = clone(scheduleForWeek(program, nextWeek));
    const sessionDecisions = [];
    nextSchedule.forEach(day => day.sessions.forEach(session => {
      if (session.type === "run") {
        const previous = { targetDistance: Number(session.targetDistance || 0), targetDuration: Number(session.targetDuration || 0) };
        session.targetDistance = Number((previous.targetDistance * decision.runningVolumeMultiplier).toFixed(1));
        session.targetDuration = Math.round(previous.targetDuration * decision.runningVolumeMultiplier);
        if (decision.runningVolumeMultiplier !== 1) {
          const progressing = decision.runningVolumeMultiplier > 1;
          const reason = progressing
            ? Reasons.create(/Long/.test(session.runType || "") ? Reasons.CODES.LONG_RUN_COMPLETED_WELL : /Easy|Recovery/.test(session.runType || "") ? Reasons.CODES.GOOD_MILEAGE_TOLERANCE : Reasons.CODES.GOOD_COMPLETION, decision.running.explanation.details)
            : decision.explanation;
          session.progressionDecision = { action: progressing ? "progress" : decision.decision === "RECOVERY WEEK" ? "recover" : "cut-back", reason: clone(reason), previous, current: { targetDistance: session.targetDistance, targetDuration: session.targetDuration }, decidedWeek: week, appliedWeek: nextWeek };
          sessionDecisions.push({ sessionId: session.id, sessionType: "run", ...clone(session.progressionDecision) });
        }
      }
      if (session.type === "strength") {
        const previous = { volumeMultiplier: Number(session.volumeMultiplier || 1) };
        session.volumeMultiplier = Number((previous.volumeMultiplier * decision.strengthVolumeMultiplier).toFixed(2));
        if (decision.strengthVolumeMultiplier !== 1) {
          session.progressionDecision = { action: decision.decision === "RECOVERY WEEK" ? "recover" : "cut-back", reason: clone(decision.explanation), previous, current: { volumeMultiplier: session.volumeMultiplier }, decidedWeek: week, appliedWeek: nextWeek };
          sessionDecisions.push({ sessionId: session.id, sessionType: "strength", ...clone(session.progressionDecision) });
        }
      }
    }));
    program.weeklyOverrides ||= {};
    program.weeklyOverrides[nextWeek] = nextSchedule;
    program.deferredStrengthProgression = decision.strengthBudget.filter(item => item.deferred).map(item => ({ ...item, deferredAtWeek: week }));
    program.progress.appliedStrengthProgression ||= [];
    program.progress.appliedStrengthProgression.push(...decision.strengthBudget.filter(item => item.applied).map(item => ({ ...item, appliedAtWeek: week })));
    const storedDecision = { week, appliedToWeek: nextWeek, date: new Date().toISOString(), decision: decision.decision, explanation: clone(decision.explanation), running: { decision: decision.running.decision, volumeMultiplier: decision.runningVolumeMultiplier, explanation: clone(decision.running.explanation), summary: clone(decision.running.summary) }, strengthBudget: clone(decision.strengthBudget), strengthVolumeMultiplier: decision.strengthVolumeMultiplier, sessionDecisions, approved: true };
    program.progress.reviewedWeeks = program.progress.reviewedWeeks.filter(item => Number(item.week) !== Number(week));
    program.progress.reviewedWeeks.push(storedDecision);
    program.progressionDecisions ||= [];
    program.progressionDecisions = program.progressionDecisions.filter(item => Number(item.week) !== Number(week));
    program.progressionDecisions.push(clone(storedDecision));
    saveData(); renderProgramReview(); renderHome();
  }

  function renderHybridBuildPanel() {
    ensureHybridData(); const active = data.hybridPrograms.active, activeHolder = document.querySelector("#activeHybridProgram"), drafts = document.querySelector("#hybridDraftPrograms"); if (!activeHolder || !drafts) return;
    if (active) {
      const next = nextActionable(active), progress = programProgress(active), period = currentWeek(active), totalPeriods = isRolling(active) ? active.totalCycles || active.totalWeeks : active.totalWeeks;
      const nextDay = next ? (isRolling(active) ? `Cycle Day ${next.dayIndex + 1}` : Config.DAYS[next.dayIndex]) : "";
      activeHolder.innerHTML = `<article class="panel active-hybrid-card"><p class="eyebrow">ACTIVE HYBRID PROGRAM • ${isRolling(active) ? "ROLLING CYCLE" : "WEEKLY SCHEDULE"}</p><h3>${html(active.name)}</h3><p>${periodName(active)} ${period} of ${totalPeriods} • ${progress.percent}% resolved</p>${next ? `<strong>Next: ${html(next.session.title)} — ${html(nextDay)}</strong>` : `<strong>This program is ready for ${isRolling(active) ? "cycle" : "weekly"} review.</strong>`}<div class="hybrid-progress"><span style="width:${progress.percent}%"></span></div><div class="exercise-actions"><button class="primary-button" data-hybrid-action="next">${data.activeRunSession || dashboardSavedSession() ? "Resume active session" : next?.session.type === "rest" ? "Complete rest day" : "Start next session"}</button><button class="secondary-button" data-hybrid-action="review">Review program</button></div></article>`;
      activeHolder.querySelector('[data-hybrid-action="review"]').onclick = () => openHybridProgram(active.id);
      activeHolder.querySelector('[data-hybrid-action="next"]').onclick = event => launchCurrentHybrid(event.currentTarget);
    }
    else activeHolder.innerHTML = `<div class="panel"><p>No active Hybrid program.</p></div>`;
    drafts.innerHTML = data.hybridPrograms.drafts.length ? data.hybridPrograms.drafts.map(program => `<article class="panel"><span class="program-mode-badge">${html(PRIORITY_NAMES[program.hybridPriority])}</span><h3>${html(program.name)}</h3><p>${program.loadSummary.strengthSessions} strength + ${program.loadSummary.runningSessions} runs • ${isRolling(program) ? `${program.totalCycles || program.totalWeeks} rolling cycles` : `${program.totalWeeks} weeks`}</p><button class="secondary-button" data-open-hybrid="${program.id}">Review draft</button></article>`).join("") : `<div class="panel"><p>No Hybrid drafts yet.</p></div>`;
    drafts.querySelectorAll("[data-open-hybrid]").forEach(button => button.onclick = () => openHybridProgram(button.dataset.openHybrid));
  }

  function launchCurrentHybrid(trigger = null) {
    if (data.activeRunSession) return openRunSession(data.activeRunSession.context, data.activeRunSession.planned, true);
    const paused = dashboardSavedSession();
    if (paused) { document.querySelector("#sessionDialog")?.showModal(); return; }
    const next = nextActionable(); if (!next) return openHybridProgram(data.hybridPrograms.active.id);
    if (!isRolling(next.program) && next.dayIndex < mondayIndex()) return openMissedSession(next, trigger);
    if (next.session.type === "rest") return completeRollingRest(next);
    openReadiness(next, trigger);
  }
  function launchHybridOccurrence(context, trigger = null) {
    if (!isRolling(context.program) && context.dayIndex < mondayIndex()) return openMissedSession(context, trigger);
    if (context.session.type === "rest") return completeRollingRest(context);
    openReadiness(context, trigger);
  }

  function completeRollingRest(context) {
    if (!confirm(`Complete ${context.session.title || "Rest Day"} and advance the rolling cycle?`)) return;
    context.program.progress.completed.push({ occurrenceId: context.occurrenceId, date: new Date().toISOString(), completion: "rest", sessionId: context.session.id, week: context.week, cycle: context.week });
    saveData(); renderHome(); renderHybridBuildPanel();
  }

  function readinessFormMarkup(context) {
    return `<p><strong>${html(context.session.title)}</strong> • ${isRolling(context.program) ? `Cycle Day ${context.dayIndex + 1}` : Config.DAYS[context.dayIndex]} • ${periodName(context.program)} ${context.week}</p><div class="readiness-grid">${field("legs","Leg freshness",`<select name="legs"><option value="fresh">Fresh</option><option value="normal" selected>Normal</option><option value="heavy">Heavy</option><option value="very-sore">Very Sore</option></select>`)}${field("fatigue","General fatigue",`<select name="fatigue"><option value="low">Low</option><option value="normal" selected>Normal</option><option value="high">High</option><option value="extreme">Extreme</option></select>`)}${field("sleep","Last night's sleep",`<select name="sleep"><option value="great">Great</option><option value="good" selected>Good</option><option value="fair">Fair</option><option value="poor">Poor</option></select>`)}${field("painRating","Pain today",`<select name="painRating"><option value="0">None</option><option value="1">1 — Mild</option><option value="2">2 — Minor</option><option value="3">3 — Noticeable</option><option value="4">4 — Significant</option><option value="5">5 — Severe</option></select>`)}${field("painLocation","Pain location",`<select name="painLocation"><option>None</option>${["Knee","Shin","Achilles / calf","Ankle","Foot / plantar","Hip","Lower back","Shoulder","Elbow","Wrist","Hand","Upper back","Neck","Other"].map(v => `<option>${v}</option>`).join("")}</select>`)}</div><label class="acute-warning-check"><input name="acuteWarning" type="checkbox"><span>I have acute chest pain or pressure, fainting or near-fainting, severe unexplained shortness of breath, confusion, or another significant new symptom.</span></label><button class="primary-button full-width" type="submit">Review today's readiness</button><p class="small-note">Muscle fatigue and pain are considered separately. This check does not diagnose an injury.</p>`;
  }
  function openReadiness(context, trigger = null) { readinessContext = { ...context, trigger }; const body = document.querySelector("#hybridReadinessBody"); body.innerHTML = readinessFormMarkup(context); document.querySelector("#hybridReadinessDialog").showModal(); }
  function submitReadiness(event) {
    event.preventDefault(); const form = event.currentTarget, inputs = Object.fromEntries(new FormData(form).entries()); inputs.painRating = Number(inputs.painRating); inputs.acuteWarning = Boolean(form.elements.acuteWarning.checked);
    const result = Recovery.calculateRecoveryState(inputs, readinessContext.session); const adjusted = Recovery.adjustSessionForRecovery(readinessContext.session, result);
    data.hybridReadinessHistory.unshift({ id: id("readiness"), date: new Date().toISOString(), programId: readinessContext.program.id, week: readinessContext.week, cycle: isRolling(readinessContext.program) ? readinessContext.week : null, sessionId: readinessContext.session.id, inputs, result }); persist();
    renderReadinessDecision(result, adjusted);
  }
  function renderReadinessDecision(result, adjusted) {
    const body = document.querySelector("#hybridReadinessBody");
    body.innerHTML = `<section class="readiness-result level-${result.level}"><span class="readiness-level">READINESS LEVEL ${result.level}</span><h3>${result.decision}</h3><p>${html(result.reason)}</p><ul>${(result.actions || [result.action]).filter(Boolean).map(action => `<li>${html(action)}</li>`).join("")}</ul></section>${result.level >= 2 && result.level <= 4 ? `<button id="readinessWarmup" class="primary-button full-width" type="button">Start Readiness Warm-Up</button>` : result.level === 5 ? `<button id="startAdjustedHybrid" class="primary-button full-width" type="button">Start active recovery</button>` : result.level < 2 ? `<button id="startAdjustedHybrid" class="primary-button full-width" type="button">Start planned session</button>` : `<div class="recovery-warning"><strong>Do not continue this session.</strong><p>Seek appropriate medical evaluation when symptoms warrant it. Fleeman Fitness does not diagnose injuries.</p></div>`}<button id="cancelReadinessDecision" class="secondary-button full-width" type="button">Cancel</button>`;
    document.querySelector("#startAdjustedHybrid")?.addEventListener("click", () => startHybridSession(adjusted));
    document.querySelector("#readinessWarmup")?.addEventListener("click", () => renderWarmupDecision(result, adjusted));
    document.querySelector("#cancelReadinessDecision").onclick = closeReadiness;
  }
  function renderWarmupDecision(result, adjusted) {
    const isRun = readinessContext.session.type === "run";
    const choices = isRun ? [["normal","Normal"],["heavy","Heavier than usual"],["worse","Very difficult"],["painful","Painful"]] : [["better","Better"],["normal","Normal"],["heavy","Still Heavy"],["worse","Worse"]];
    document.querySelector("#hybridReadinessBody").innerHTML = `<section class="warmup-check"><p class="eyebrow">READINESS WARM-UP</p><h3>How did the warm-up feel?</h3><p>${isRun ? "Walk or jog easily for 10 minutes." : "Complete your normal ramp-up sets without creating fatigue."}</p><div class="warmup-options">${choices.map(([value,label]) => `<button data-warmup="${value}">${label}</button>`).join("")}</div></section><button id="cancelWarmup" class="secondary-button full-width" type="button">Cancel</button>`;
    document.querySelectorAll("[data-warmup]").forEach(button => button.onclick = () => {
      const answer = button.dataset.warmup;
      if (answer === "painful") return renderReadinessDecision({ level: 6, decision: "STOP", reason: "Pain during the warm-up is a safety override. Stop the aggravating activity.", actions: ["Do not start the planned session"], safetyOverride: true }, { ...adjusted, blocked: true });
      const level = ["better","normal"].includes(answer) ? 1 : answer === "heavy" ? 3 : 4;
      const revised = Recovery.adjustSessionForRecovery(readinessContext.session, { ...result, level }); startHybridSession(revised);
    });
    document.querySelector("#cancelWarmup").onclick = closeReadiness;
  }
  function closeReadiness() { document.querySelector("#hybridReadinessDialog")?.close(); readinessContext?.trigger?.focus?.({ preventScroll: true }); readinessContext = null; }
  function startHybridSession(session) {
    if (session.blocked) return;
    const context = readinessContext; document.querySelector("#hybridReadinessDialog").close();
    if (session.type === "run" || session.type === "recovery") openRunSession(context, session);
    else {
      const workoutId = session.workoutId; const workoutContext = { scheduleType: "hybrid", hybridProgramId: context.program.id, week: context.week, cycle: isRolling(context.program) ? context.week : null, hybridScheduleType: context.program.scheduleType, dayIndex: context.dayIndex, hybridSessionId: session.id, occurrenceId: context.occurrenceId, hybridAdjustment: { volumeMultiplier: session.volumeMultiplier || 1, holdProgression: Boolean(session.holdProgression), recoveryDecision: session.recoveryDecision || null, progressionDecision: session.progressionDecision || null } };
      startWorkout(workoutId, workoutContext);
    }
    readinessContext = null;
  }

  function runForm(session, saved = {}) {
    const unit = distanceUnit(runContext?.program), distance = session.targetDistance ? `${Number(session.targetDistance).toFixed(1)} ${unit}` : "Distance unavailable", time = session.estimatedDurationLabel || `${session.targetDuration || 20} min`;
    const timeBased = session.prescriptionStyle === "time", primary = timeBased ? `${session.targetDuration || 20} min` : distance, secondary = timeBased ? (session.estimatedDistanceLabel || distance) : time;
    const structure = session.structure ? `<div class="run-structure"><p><strong>Warm-Up:</strong> ${html(session.structure.warmup)}</p><p><strong>Main Set:</strong> ${html(session.structure.mainSet)}</p><p><strong>Recovery:</strong> ${html(session.structure.recovery)}</p><p><strong>Cool-Down:</strong> ${html(session.structure.coolDown)}</p></div>` : "";
    const paceGuide = session.suggestedPaceRange || (session.paceTarget && !/Use RPE/i.test(session.paceTarget) ? session.paceTarget : "");
    return `<section class="run-prescription"><span class="program-mode-badge">${html(session.runType || "Recovery Run")}</span><h3>Today's target</h3><div class="run-target-grid"><div class="run-primary-target"><span>${timeBased ? "DURATION" : "DISTANCE"}</span><strong>${primary}</strong></div><div><span>${timeBased ? "ESTIMATED DISTANCE" : "ESTIMATED TIME"}</span><strong>${html(secondary)}</strong></div><div><span>EFFORT</span><strong>RPE ${html(session.rpeTarget || "2-4")}</strong><small>${html(session.effortGuidance || "Follow the prescribed effort")}</small></div><div><span>PRIORITY</span><strong>${html(session.priority || "C")}</strong></div>${paceGuide ? `<div><span>SUGGESTED PACE</span><strong>${html(paceGuide)}</strong></div>` : ""}${session.heartRateTarget ? `<div><span>HEART RATE</span><strong>${html(session.heartRateTarget)}</strong></div>` : ""}</div>${structure}${session.strides ? `<p><strong>Strides:</strong> ${html(session.strides)}</p>` : ""}${session.recoveryDecision ? `<p class="adjustment-note">Adjusted after readiness check: ${html(session.recoveryDecision.decision)}</p>` : ""}${progressionChangeMarkup(session, runContext?.program)}</section><div class="hybrid-form-grid">${field("completedDistance",`Distance completed (${unit})`,`<input name="completedDistance" type="number" min="0" max="300" step="0.01" inputmode="decimal" value="${saved.completedDistance ?? ""}">`)}${field("durationMinutes","Duration (minutes)",`<input name="durationMinutes" type="number" min="0" max="1440" step="1" inputmode="numeric" value="${saved.durationMinutes ?? ""}">`)}${field("averagePace","Average pace (optional)",`<input name="averagePace" value="${html(saved.averagePace || "")}" placeholder="Example: 10:24/${unit}">`)}${field("averageHeartRate","Average heart rate (optional)",`<input name="averageHeartRate" type="number" min="0" max="250" inputmode="numeric" value="${saved.averageHeartRate ?? ""}">`)}${field("rpe","Session RPE",`<input name="rpe" type="number" min="1" max="10" inputmode="numeric" value="${saved.rpe ?? ""}">`)}${field("completion","Completion",`<select name="completion"><option value="completed">Completed</option><option value="partial" ${saved.completion === "partial" ? "selected" : ""}>Partially completed</option><option value="skipped" ${saved.completion === "skipped" ? "selected" : ""}>Skipped</option></select>`)}${field("partialReason","Partial/skip reason",`<select name="partialReason"><option value="">Not applicable</option>${["Fatigue","Pain / discomfort","Time constraint","Weather / environment","Schedule","Other"].map(v => `<option ${saved.partialReason === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("painRating","Pain during run",`<select name="painRating"><option value="0">None</option>${[1,2,3,4,5].map(n => `<option value="${n}" ${Number(saved.painRating) === n ? "selected" : ""}>${n}</option>`).join("")}</select>`)}${field("painLocation","Pain location",`<select name="painLocation"><option>None</option>${["Knee","Shin","Achilles / calf","Ankle","Foot / plantar","Hip","Lower back","Other"].map(v => `<option ${saved.painLocation === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("notes","Run notes",`<textarea name="notes" placeholder="Terrain, weather, effort, or anything useful next week">${html(saved.notes || "")}</textarea>`, true)}</div><p id="runFormError" class="form-error hidden" role="alert"></p><div class="program-review-actions"><button class="primary-button" type="submit">Save run</button><button id="saveRunForLater" class="secondary-button" type="button">Save & close</button></div>`;
  }
  function openRunSession(context, session, resume = false) {
    runContext = context;
    if (!resume) data.activeRunSession = { id: id("run-session"), context: { programId: context.program.id, week: context.week, dayIndex: context.dayIndex, occurrenceId: context.occurrenceId }, planned: clone(session), startedAt: new Date().toISOString(), form: {} };
    else { const saved = data.activeRunSession; context = { ...saved.context, program: findProgram(saved.context.programId), session: saved.planned }; runContext = context; session = saved.planned; }
    document.querySelector("#runSessionTitle").textContent = session.title || session.runType || "Run Session"; document.querySelector("#runSessionBody").innerHTML = runForm(session, data.activeRunSession.form || {}); document.querySelector("#runSessionDialog").showModal();
    document.querySelector("#saveRunForLater").onclick = saveRunForLater; persist();
  }
  function captureRunForm() { const form = document.querySelector("#runSessionForm"), values = Object.fromEntries(new FormData(form).entries()); ["completedDistance","durationMinutes","averageHeartRate","rpe","painRating"].forEach(key => values[key] = values[key] === "" ? "" : Number(values[key])); return values; }
  function saveRunForLater() { if (!data.activeRunSession) return document.querySelector("#runSessionDialog").close(); data.activeRunSession.form = captureRunForm(); data.activeRunSession.savedAt = new Date().toISOString(); persist(); document.querySelector("#runSessionDialog").close(); renderHome(); renderHybridBuildPanel(); }
  function completeRun(event) {
    event.preventDefault(); const values = captureRunForm(), errors = [];
    if (values.completion !== "skipped" && (!values.completedDistance || values.completedDistance <= 0)) errors.push("Enter the completed distance.");
    if (values.completion !== "skipped" && (!values.durationMinutes || values.durationMinutes <= 0)) errors.push("Enter the completed duration.");
    if (values.completion !== "skipped" && (values.rpe < 1 || values.rpe > 10)) errors.push("Enter a session RPE from 1 through 10.");
    if (["partial","skipped"].includes(values.completion) && !values.partialReason) errors.push("Choose why the run was partial or skipped.");
    if (Number(values.painRating) >= 3 && values.painLocation === "None") errors.push("Choose the pain location.");
    const error = document.querySelector("#runFormError"); error.textContent = errors.join(" "); error.classList.toggle("hidden", !errors.length); if (errors.length) { error.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const active = data.activeRunSession, program = findProgram(active.context.programId), planned = active.planned;
    const computedPace = values.completedDistance && values.durationMinutes ? `${Math.floor(values.durationMinutes / values.completedDistance)}:${String(Math.round(((values.durationMinutes / values.completedDistance) % 1) * 60)).padStart(2, "0")}/${distanceUnit(program)}` : "";
    const record = { id: id("run"), type: "run", programId: program.id, week: active.context.week, dayIndex: active.context.dayIndex, occurrenceId: active.context.occurrenceId, workoutName: planned.title, runType: planned.runType || planned.title, prescriptionStyle: planned.prescriptionStyle || "distance", plannedDistance: Number(planned.targetDistance || 0), plannedDuration: Number(planned.targetDuration || 0), plannedDurationRange: clone(planned.estimatedDurationRange || null), completedDistance: Number(values.completedDistance || 0), completedDuration: values.durationMinutes ? `${values.durationMinutes} min` : "", durationMinutes: Number(values.durationMinutes || 0), averagePace: values.averagePace || computedPace, averageHeartRate: Number(values.averageHeartRate || 0), rpe: Number(values.rpe || 0), completion: values.completion, partialReason: values.partialReason, painRating: Number(values.painRating || 0), painLocation: values.painLocation, notes: values.notes, date: new Date().toISOString(), distanceUnit: distanceUnit(program) };
    if (isRolling(program)) record.cycle = active.context.week;
    data.runHistory.unshift(record); data.history.unshift({ ...record, run: clone(record), exercises: [], mesocycle: { scheduleType: "hybrid", hybridProgramId: program.id, week: record.week } });
    if (values.completion === "skipped") program.progress.skipped.push({ occurrenceId: record.occurrenceId, date: record.date, reason: values.partialReason, sessionId: planned.id, week: record.week });
    else program.progress.completed.push({ occurrenceId: record.occurrenceId, date: record.date, completion: values.completion, sessionId: planned.id, week: record.week });
    data.activeRunSession = null; document.querySelector("#runSessionDialog").close(); saveData(); renderHistory(); renderHybridBuildPanel(); renderHome();
  }

  function openMissedSession(context, trigger = null) {
    missedContext = { ...context, trigger };
    const todayIndex = mondayIndex();
    const weeklySchedule = scheduleForWeek(context.program, context.week);
    const todaySessions = weeklySchedule[todayIndex]?.sessions || [];
    const tomorrowSessions = weeklySchedule[todayIndex + 1]?.sessions || [];
    const sameDayConflict = Stress.calculateConflict(context.session.stress, Scheduler.dayStress(todaySessions), { separationHours: 6 });
    const nextDayConflict = tomorrowSessions.length ? Stress.calculateConflict(context.session.stress, Scheduler.dayStress(tomorrowSessions), { separationHours: 18 }) : null;
    const severity = { green: 0, yellow: 1, orange: 2, red: 3 };
    const combined = nextDayConflict && severity[nextDayConflict.rating] > severity[sameDayConflict.rating] ? nextDayConflict : sameDayConflict;
    const demandingTomorrowRun = tomorrowSessions.find(session => session.type === "run" && /Threshold|Tempo|Intervals|Hills|Marathon Pace/.test(session.runType || ""));
    document.querySelector("#hybridMissedTitle").textContent = context.session.title;
    document.querySelector("#hybridMissedBody").innerHTML = `<p>This ${Config.DAYS[context.dayIndex]} session is still unresolved. Missed workload is never transferred automatically.</p>${todaySessions.length || tomorrowSessions.length ? `<div class="conflict-banner ${combined.rating}"><strong>${combined.rating.toUpperCase()} if done today</strong><span>${html(nextDayConflict === combined ? `This places the missed session about 18 hours before ${tomorrowSessions.map(item => item.title).join(" + ")}. ${combined.message}` : combined.message)}</span></div>` : ""}<div class="missed-actions"><button class="primary-button" data-missed="today">Do today — keep schedule</button>${demandingTomorrowRun && ["orange","red"].includes(combined.rating) ? `<button class="secondary-button" data-missed="today-easy">Do today + convert tomorrow to Easy</button>` : ""}<button class="secondary-button" data-missed="skip">Skip this session</button><label>Reschedule intelligently<select id="missedTargetDay"><option value="">Choose a remaining available day</option>${Config.DAYS.map((day, index) => index >= todayIndex && context.program.setup?.availableDays?.includes(index) ? `<option value="${index}">${day}</option>` : "").join("")}</select></label><button class="secondary-button" data-missed="reschedule">Review reschedule</button></div>`;
    document.querySelector("#hybridMissedBody [data-missed='today']").onclick = () => { document.querySelector("#hybridMissedDialog").close(); openReadiness({ ...context, dayIndex: mondayIndex() }, trigger); };
    document.querySelector("#hybridMissedBody [data-missed='today-easy']")?.addEventListener("click", () => {
      const adjustedWeek = clone(weeklySchedule);
      const run = adjustedWeek[todayIndex + 1]?.sessions.find(session => session.id === demandingTomorrowRun.id);
      if (run) {
        run.originalRunType = run.runType;
        run.runType = "Easy Run";
        run.title = "Easy Run";
        run.rpeTarget = "3-4";
        run.targetDistance = Number((Number(run.targetDistance || 0) * .8).toFixed(1));
        run.targetDuration = Math.round(Number(run.targetDuration || 0) * .8);
        run.holdProgression = true;
        run.stress = Stress.calculateRunStress(run, context.program.setup?.runningBaseline || {}, data.runHistory || []);
      }
      context.program.weeklyOverrides ||= {};
      context.program.weeklyOverrides[context.week] = adjustedWeek;
      context.program.progress.rescheduled.push({ occurrenceId: context.occurrenceId, sessionId: context.session.id, week: context.week, date: new Date().toISOString(), decision: "do-today-convert-next-run-easy", adjustedSessionId: demandingTomorrowRun.id });
      saveData();
      document.querySelector("#hybridMissedDialog").close();
      openReadiness({ ...context, dayIndex: todayIndex }, trigger);
    });
    document.querySelector("#hybridMissedBody [data-missed='skip']").onclick = () => { context.program.progress.skipped.push({ occurrenceId: context.occurrenceId, sessionId: context.session.id, week: context.week, date: new Date().toISOString(), reason: "Missed session" }); document.querySelector("#hybridMissedDialog").close(); saveData(); renderHome(); renderHybridBuildPanel(); };
    document.querySelector("#hybridMissedBody [data-missed='reschedule']").onclick = () => { const target = document.querySelector("#missedTargetDay").value; if (target === "") return; const weeklyProgram = { ...context.program, schedule: clone(scheduleForWeek(context.program, context.week)) }; const result = Scheduler.rescheduleRemainingWeek(weeklyProgram, context.session.id, Number(target)); context.program.weeklyOverrides ||= {}; context.program.weeklyOverrides[context.week] = result.program.schedule; context.program.progress.rescheduled.push({ occurrenceId: context.occurrenceId, sessionId: context.session.id, week: context.week, targetDayIndex: Number(target), warning: result.warning, date: new Date().toISOString() }); document.querySelector("#hybridMissedDialog").close(); saveData(); openHybridProgram(context.program.id); renderHome(); };
    document.querySelector("#hybridMissedDialog").showModal();
  }

  function renderHybridHome() {
    const program = data.hybridPrograms.active; if (!program) return;
    const pausedStrength = dashboardSavedSession(), activeRun = data.activeRunSession, next = nextActionable(program), futureNext = next ? null : nextFuturePeriodActionable(program), actionDay = currentActionableDay(program);
    const week = currentWeek(program), dayNow = mondayIndex(), todayPlan = isRolling(program) ? null : scheduleForWeek(program, week).find(day => day.dayIndex === dayNow);
    const todayIsRest = Boolean(todayPlan && !(todayPlan.sessions || []).some(session => session.type !== "rest") && (!next || next.dayIndex >= dayNow));
    const name = document.querySelector("#todayWorkoutName"), summary = document.querySelector("#todayWorkoutSummary"), badge = document.querySelector("#todaySessionBadge"), meta = document.querySelector("#todayMesoMeta"), primary = document.querySelector("#startWorkoutButton"), preview = document.querySelector("#previewTodayWorkoutButton");
    if (pausedStrength) { name.textContent = pausedStrength.workoutName || "Active strength workout"; summary.textContent = "Your logged sets and notes are saved on this device."; badge.textContent = "WORKOUT IN PROGRESS"; meta.textContent = `${program.name} • ${periodName(program).toUpperCase()} ${currentWeek(program)}`; primary.textContent = "Resume workout"; primary.onclick = () => document.querySelector("#sessionDialog")?.showModal(); preview.classList.add("hidden"); }
    else if (activeRun) { name.textContent = activeRun.planned.title; summary.textContent = "Your run log is saved. Resume when you are ready."; badge.textContent = "RUN IN PROGRESS"; meta.textContent = `${program.name} • ${periodName(program).toUpperCase()} ${activeRun.context.week}`; primary.textContent = "Resume run"; primary.onclick = () => launchCurrentHybrid(primary); preview.classList.add("hidden"); }
    else if (todayIsRest) {
      name.textContent = "Rest Day";
      const upcoming = next || futureNext;
      summary.textContent = upcoming ? `No Hybrid session is scheduled today. Next: ${upcoming.session.title} — ${Config.DAYS[upcoming.dayIndex]}. ${sessionSummary(upcoming.session, program)}` : "No Hybrid session is scheduled today. This program is ready for review.";
      badge.textContent = `${PRIORITY_NAMES[program.hybridPriority].toUpperCase()} • TODAY`;
      meta.textContent = `${program.name} • WEEK ${week}`;
      primary.textContent = "Review program";
      primary.onclick = () => openHybridProgram(program.id);
      preview.classList.add("hidden");
    }
    else if (next) {
      const missed = !isRolling(program) && next.dayIndex < mondayIndex(), combined = !missed && actionDay?.occurrences.length > 1;
      if (next.session.type === "rest") {
        name.textContent = "Rest Day"; summary.textContent = "Complete this planned recovery day when you are ready to advance the rolling sequence."; badge.textContent = "NEXT ROLLING DAY"; meta.textContent = `${program.name} • CYCLE ${next.week} • CYCLE DAY ${next.dayIndex + 1}`;
        primary.textContent = "Complete Rest Day"; primary.onclick = () => completeRollingRest(next); preview.classList.remove("hidden"); preview.textContent = "Review program"; preview.onclick = () => openHybridProgram(program.id);
      } else if (combined) {
        const [first, second] = actionDay.occurrences;
        name.textContent = "Hybrid Day"; summary.textContent = actionDay.occurrences.map(item => sessionSummary(item.session, program)).join(" + "); badge.textContent = isRolling(program) ? "NEXT ROLLING HYBRID DAY" : actionDay.dayIndex === mondayIndex() ? "TODAY'S HYBRID DAY" : "NEXT HYBRID DAY"; meta.textContent = `${program.name} • ${periodName(program).toUpperCase()} ${first.week} • ${isRolling(program) ? `CYCLE DAY ${first.dayIndex + 1} • ` : ""}${first.session.title} recommended first`;
        primary.textContent = `Start ${first.session.type === "run" ? "Run" : "Strength"}`; primary.onclick = event => launchHybridOccurrence(first, event.currentTarget);
        preview.classList.remove("hidden"); preview.textContent = `Start ${second.session.type === "run" ? "Run" : "Strength"}`; preview.onclick = event => launchHybridOccurrence(second, event.currentTarget);
      } else {
        name.textContent = next.session.title; summary.textContent = sessionSummary(next.session, program); badge.textContent = missed ? "MISSED SESSION — CHOOSE NEXT STEP" : isRolling(program) ? "NEXT ROLLING SESSION" : next.dayIndex === mondayIndex() ? "TODAY'S HYBRID SESSION" : "NEXT HYBRID SESSION"; meta.textContent = `${program.name} • ${periodName(program).toUpperCase()} ${next.week}${isRolling(program) ? ` • CYCLE DAY ${next.dayIndex + 1}` : ""}`; primary.textContent = missed ? "Review missed session" : "Check readiness & start"; primary.onclick = event => launchCurrentHybrid(event.currentTarget); preview.classList.remove("hidden"); preview.textContent = "Review program"; preview.onclick = () => openHybridProgram(program.id);
      }
    }
    else { const label = periodName(program); name.textContent = `${label} ready for review`; summary.textContent = `All scheduled sessions in this ${label.toLowerCase()} are completed or skipped.`; badge.textContent = `HYBRID ${label.toUpperCase()} COMPLETE`; meta.textContent = `${program.name} • ${label.toUpperCase()} ${currentWeek(program)}`; primary.textContent = `Open ${label.toLowerCase()} review`; primary.onclick = () => { openHybridProgram(program.id); renderWeeklyReview(program); }; preview.classList.add("hidden"); }
    const progressionHost = document.querySelector("#todayProgressionWhy");
    if (progressionHost) {
      const displayedSessions = activeRun?.planned ? [activeRun.planned] : pausedStrength || todayIsRest ? [] : actionDay?.occurrences?.length ? actionDay.occurrences.map(item => item.session) : next?.session ? [next.session] : [];
      const changedSession = displayedSessions.find(session => session.progressionDecision?.reason);
      progressionHost.innerHTML = changedSession ? progressionChangeMarkup(changedSession, program) : "";
      progressionHost.classList.toggle("hidden", !changedSession);
    }
    const weekly = weekOccurrences(program, week), doneCount = weekly.filter(item => isResolved(program, item.occurrenceId)).length, currentDayIndex = isRolling(program) ? next?.dayIndex : dayNow;
    const totalPeriods = isRolling(program) ? program.totalCycles || program.totalWeeks : program.totalWeeks;
    document.querySelector("#weekDashboardSummary").textContent = `${doneCount} of ${weekly.length} sessions resolved • ${periodName(program)} ${week} of ${totalPeriods}`;
    document.querySelector("#todayWeekStrip").innerHTML = scheduleForWeek(program, week).map(day => { const occurrences = day.sessions.map(session => occurrence(program, week, day.dayIndex, session)); const done = occurrences.length && occurrences.every(item => isResolved(program, item.occurrenceId)); const current = day.dayIndex === currentDayIndex; const plannedRest = day.sessions.length > 0 && day.sessions.every(session => session.type === "rest"); const title = day.sessions.length ? day.sessions.map(item => item.title).join(" + ") : "Rest"; const shortLabel = isRolling(program) ? `D${day.dayIndex + 1}` : day.day.slice(0,3).toUpperCase(); return `<button class="week-day ${done ? "completed" : current ? "current" : day.sessions.length ? "planned" : "empty"}" type="button" data-hybrid-day="${day.dayIndex}" aria-label="${day.day}: ${html(title)}"><span>${shortLabel}</span><strong>${plannedRest ? "R" : day.sessions.length || "•"}</strong><i>${done ? "✓" : current ? "NOW" : plannedRest ? "REST" : day.sessions.length ? "NEXT" : "REST"}</i></button>`; }).join("");
    document.querySelectorAll("[data-hybrid-day]").forEach(button => button.onclick = () => openHybridProgram(program.id));
    const total = weekly.length, resolved = doneCount; document.querySelector("#todayProgressValue").textContent = `${resolved} / ${total} SESSIONS`; document.querySelector("#todayProgressSegments").innerHTML = Array.from({ length: Math.max(1, total) }, (_, index) => `<span class="${index < resolved ? "complete" : ""}"></span>`).join("");
  }

  function onHybridStrengthWorkoutFinished(session) {
    const context = session.mesocycle; if (context?.scheduleType !== "hybrid") return;
    const program = findProgram(context.hybridProgramId); if (!program) return;
    if (!program.progress.completed.some(item => item.occurrenceId === context.occurrenceId)) program.progress.completed.push({ occurrenceId: context.occurrenceId, sessionId: context.hybridSessionId, week: context.week, date: new Date().toISOString(), completion: "completed" });
    program.strengthProgressionEligibility ||= [];
    const sourceWorkout = hybridProgramWorkout(program, session.workoutId);
    session.exercises.filter(exercise => exercise.sets?.length && exercise.sets.every(set => set.done) && !["very-hard", "failed-target"].includes(exercise.feedback)).forEach(exercise => {
      const source = sourceWorkout?.exercises.find(item => item.id === exercise.exerciseId) || exercise;
      const region = Stress.exerciseRegion(source).lower >= Stress.exerciseRegion(source).upper ? "lower" : "upper";
      const previousWeight = Number(exercise.weight || 0), recommendedIncrease = Number(source.increment || data.settings.increment || 0);
      const entry = { exerciseId: exercise.exerciseId, exerciseName: exercise.name, region, week: context.week, earnedAt: new Date().toISOString(), previousWeight, newWeight: previousWeight + recommendedIncrease, recommendedIncrease, explanation: Reasons.create(Reasons.CODES.GOOD_STRENGTH_PERFORMANCE, { exerciseId: exercise.exerciseId, previousWeight, newWeight: previousWeight + recommendedIncrease }) };
      const existing = program.strengthProgressionEligibility.findIndex(item => item.exerciseId === entry.exerciseId && Number(item.week) === Number(entry.week));
      if (existing >= 0) program.strengthProgressionEligibility[existing] = entry; else program.strengthProgressionEligibility.push(entry);
    });
    persist();
  }

  const originalRenderHome = globalThis.renderHome;
  globalThis.renderHome = function () { originalRenderHome(); renderHybridHome(); };
  const originalSaveData = globalThis.saveData;
  globalThis.saveData = function () { originalSaveData(); renderHybridBuildPanel(); };
  globalThis.openHybridBuilder = openHybridBuilder;
  globalThis.renderHybridBuildPanel = renderHybridBuildPanel;
  globalThis.onHybridStrengthWorkoutFinished = onHybridStrengthWorkoutFinished;
  globalThis.FleemanHybridLifecycle = { validateProgramForActivation, activateHybridProgram };

  function bindHybridUi() {
    ensureHybridData(); persist();
    document.querySelector("#hybridBuilderNext")?.addEventListener("click", () => { if (!readBuilderStep(true)) return; if (builder.currentStep === 9) finishBuilder(); else { builder.currentStep += 1; data.hybridBuilderDraft = clone(builder); persist(); renderBuilderStep(); } });
    document.querySelector("#hybridBuilderBack")?.addEventListener("click", () => { if (builder.currentStep === 1) closeBuilder(); else { readBuilderStep(false); builder.currentStep -= 1; renderBuilderStep(); } });
    document.querySelector("#closeHybridBuilderButton")?.addEventListener("click", closeBuilder);
    document.querySelector("#hybridBuilderDialog")?.addEventListener("cancel", event => { event.preventDefault(); closeBuilder(); });
    document.querySelector("#hybridBuilderForm")?.addEventListener("input", event => { event.target.closest(".invalid-field")?.classList.remove("invalid-field"); const error = event.target.closest("[data-field-key]")?.querySelector(".hybrid-field-error"); if (error) error.textContent = ""; });
    document.querySelector("#closeHybridProgramButton")?.addEventListener("click", () => document.querySelector("#hybridProgramDialog").close());
    document.querySelector("#hybridRunEditForm")?.addEventListener("submit", saveProgramRunEdit);
    document.querySelector("#closeHybridRunEditButton")?.addEventListener("click", () => closeProgramRunEditor(true));
    document.querySelector("#cancelHybridRunEditButton")?.addEventListener("click", () => closeProgramRunEditor(true));
    document.querySelector("#hybridRunEditDialog")?.addEventListener("cancel", event => { event.preventDefault(); closeProgramRunEditor(true); });
    document.querySelector("#closeHybridReadinessButton")?.addEventListener("click", closeReadiness);
    document.querySelector("#hybridReadinessForm")?.addEventListener("submit", submitReadiness);
    document.querySelector("#runSessionForm")?.addEventListener("submit", completeRun);
    document.querySelector("#closeRunSessionButton")?.addEventListener("click", saveRunForLater);
    document.querySelector("#runSessionDialog")?.addEventListener("cancel", event => { event.preventDefault(); saveRunForLater(); });
    document.querySelector("#closeHybridMissedButton")?.addEventListener("click", () => document.querySelector("#hybridMissedDialog").close());
    renderHybridBuildPanel(); renderProgramModeCards?.(); renderHome();
  }
  bindHybridUi();
})();
