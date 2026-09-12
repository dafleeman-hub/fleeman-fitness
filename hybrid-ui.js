(function () {
  "use strict";
  if (typeof document === "undefined") return;

  const Config = globalThis.FleemanHybridConfig;
  const Stress = globalThis.FleemanHybridStress;
  const Scheduler = globalThis.FleemanHybridScheduler;
  const Progression = globalThis.FleemanHybridProgression;
  const Recovery = globalThis.FleemanHybridRecovery;
  if (!Config || !Stress || !Scheduler || !Progression || !Recovery) return;

  const PRIORITY_NAMES = { strength: "Strength Priority", balanced: "Balanced Hybrid", running: "Running Priority", race: "Race Hybrid" };
  const PROFILE_IDS = { strength: "strength-priority", balanced: "balanced-hybrid", running: "running-priority", race: "race-hybrid" };
  const DAY_OPTIONS = Config.DAYS.map((day, index) => `<option value="${index}">${day}</option>`).join("");
  let builder = null;
  let builderTrigger = null;
  let reviewProgramId = null;
  let readinessContext = null;
  let runContext = null;
  let missedContext = null;

  function id(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function html(value) { return typeof escapeHtml === "function" ? escapeHtml(value ?? "") : String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function distanceUnit(program = data.hybridPrograms?.active) { return program?.setup?.runningDistanceUnit || (data.profile?.units === "metric" ? "km" : "mi"); }
  function isRolling(program) { return (program?.scheduleType || program?.setup?.scheduleType) === "rolling"; }
  function periodName(program) { return isRolling(program) ? "Cycle" : "Week"; }
  function mondayIndex(date = new Date()) { return (date.getDay() + 6) % 7; }
  function currentWeek(program, date = new Date()) {
    if (isRolling(program)) {
      const totalCycles = Math.max(1, Number(program.totalCycles || program.totalWeeks || 1));
      for (let cycle = 1; cycle <= totalCycles; cycle += 1) if (weekOccurrences(program, cycle).some(item => !isResolved(program, item.occurrenceId))) return cycle;
      return totalCycles;
    }
    const start = new Date(`${program.startDate || today()}T00:00:00`);
    return Math.max(1, Math.min(program.totalWeeks || 4, Math.floor((date - start) / 604800000) + 1));
  }
  function persist(render = false) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (render && typeof saveData === "function") saveData();
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
      program.schemaVersion = Math.max(Number(program.schemaVersion || 1), Number(Config.SCHEMA_VERSION || 1));
      program.progress ||= { completed: [], skipped: [], rescheduled: [], reviewedWeeks: [] };
      program.progress.completed ||= [];
      program.progress.skipped ||= [];
      program.progress.rescheduled ||= [];
      program.progress.reviewedWeeks ||= [];
    });
  }

  function defaultBuilder(priority = "balanced") {
    const profile = data.profile || {};
    return {
      id: id("hybrid-builder"), schemaVersion: Config.SCHEMA_VERSION || 1, programMode: "hybrid", status: "builder-draft", currentStep: 1,
      hybridPriority: priority, scheduleType: "weekly", trainingDays: 5, availableDays: [0, 1, 2, 3, 4], rollingCycleLength: 8, rollingNormalCycles: 4, twoADayPreference: "occasionally", preferredTrainingTimes: ["morning"],
      strengthSessionsTarget: "auto", runningSessionsTarget: "auto",
      strengthProfile: { experience: profile.experience || "Beginner", reuseProfile: true }, runningDistanceUnit: profile.units === "metric" ? "km" : "mi",
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

  function renderBuilderStep() {
    const step = builder.currentStep;
    document.querySelector("#hybridBuilderProgress").innerHTML = Array.from({ length: 9 }, (_, index) => `<span class="${index + 1 < step ? "done" : index + 1 === step ? "active" : ""}" aria-label="Step ${index + 1}${index + 1 === step ? ", current" : ""}">${index + 1}</span>`).join("");
    const p = builder;
    const parts = {
      1: `<div class="hybrid-step"><p class="eyebrow">STEP 1 OF 9</p><h3>What matters most in this block?</h3><p class="small-note">This controls which sessions are protected when running and strength compete for recovery.</p>${radioCards("hybridPriority", [["strength","Strength Priority","Protect lifting progress first."],["balanced","Balanced Hybrid","Develop strength and running evenly."],["running","Running Priority","Protect key running sessions first."],["race","Race Hybrid","Build toward a specific race while retaining strength."]], p.hybridPriority)}</div>`,
      2: `<div class="hybrid-step"><p class="eyebrow">STEP 2 OF 9</p><h3>How should this Hybrid schedule advance?</h3>${radioCards("scheduleType", [["weekly","Weekly Schedule","Tie sessions to specific weekdays and repeat Monday through Sunday."],["rolling","Rolling Cycle","Follow numbered training and rest days in order, regardless of the weekday."]], p.scheduleType || "weekly")}<div class="hybrid-form-grid">${p.scheduleType === "rolling" ? `${field("rollingCycleLength","Days in one rolling cycle",`<input name="rollingCycleLength" type="number" min="3" max="21" value="${p.rollingCycleLength || 8}" inputmode="numeric">`)}${field("rollingNormalCycles","Number of cycles",`<input name="rollingNormalCycles" type="number" min="1" max="20" value="${p.rollingNormalCycles || 4}" inputmode="numeric">`)}<div class="wide profile-reuse-card"><strong>How rolling days work</strong><p>Cycle Day 1 advances to Cycle Day 2 after you complete or skip its session. Explicit Rest Days advance the same way. The sequence never resets on Monday.</p></div>` : `${field("trainingDays","Total training days",`<input name="trainingDays" type="number" min="3" max="7" value="${p.trainingDays}" inputmode="numeric">`)}${field("availableDays","Available days",`<div class="day-check-grid">${selectedOptions(p.availableDays)}</div>`)}`}${field("twoADayPreference","Two-a-days",`<select name="twoADayPreference"><option value="no" ${p.twoADayPreference === "no" ? "selected" : ""}>No</option><option value="occasionally" ${p.twoADayPreference === "occasionally" ? "selected" : ""}>Occasionally</option><option value="yes" ${p.twoADayPreference === "yes" ? "selected" : ""}>Yes</option></select>`)}${field("preferredTrainingTimes","Preferred time",`<select name="preferredTrainingTimes"><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select>`)}</div></div>`,
      3: `<div class="hybrid-step"><p class="eyebrow">STEP 3 OF 9</p><h3>Strength foundation</h3><p>Your existing strength profile and saved workouts are reused. Hybrid scheduling does not rewrite them.</p><div class="profile-reuse-card">${strengthProfileMarkup()}<p>${data.workouts.length} saved workout${data.workouts.length === 1 ? "" : "s"} available for content-based scheduling.</p></div><div class="hybrid-form-grid">${field("strengthSessionsTarget","Strength sessions per week",`<select name="strengthSessionsTarget"><option value="auto" ${p.strengthSessionsTarget === "auto" ? "selected" : ""}>Let Liberty Forge decide</option>${[2,3,4].map(n => `<option value="${n}" ${Number(p.strengthSessionsTarget) === n ? "selected" : ""}>${n}</option>`).join("")}</select>`)}${field("strengthProfile.experience","Strength experience",`<select name="strengthExperience">${["Beginner","Intermediate","Advanced"].map(v => `<option ${p.strengthProfile.experience === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}</div><p class="small-note">Sessions are classified by their actual exercises as upper, lower, or full body—not by their saved names.</p></div>`,
      4: `<div class="hybrid-step"><p class="eyebrow">STEP 4 OF 9</p><h3>Running baseline</h3><p class="small-note">Running experience is kept separate from strength experience. Distance uses your ${data.profile?.units === "metric" ? "kilometer" : "mile"} preference.</p><div class="hybrid-form-grid">${field("runningBaseline.experience","Running experience",`<select name="runningExperience">${["New to running","Beginner","Recreational","Experienced"].map(v => `<option ${p.runningBaseline.experience === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("runningBaseline.consistency","Consistency",`<select name="runningConsistency"><option value="not-running">Not currently running</option><option value="under-3-months" ${p.runningBaseline.consistency === "under-3-months" ? "selected" : ""}>Less than 3 months</option><option value="3-12-months" ${p.runningBaseline.consistency === "3-12-months" ? "selected" : ""}>3–12 months</option><option value="1-3-years" ${p.runningBaseline.consistency === "1-3-years" ? "selected" : ""}>1–3 years</option><option value="3-plus-years" ${p.runningBaseline.consistency === "3-plus-years" ? "selected" : ""}>3+ years</option></select>`)}${field("runningBaseline.runsPerWeek","Current runs per week",`<select name="runsPerWeek">${[0,1,2,3,4,5].map(n => `<option value="${n}" ${Number(p.runningBaseline.runsPerWeek) === n ? "selected" : ""}>${n === 5 ? "5+" : n}</option>`).join("")}</select>`)}${field("runningBaseline.weeklyMileage",`Current weekly ${data.profile?.units === "metric" ? "kilometers" : "mileage"}`,`<input name="weeklyMileage" type="number" min="0" max="300" step="0.1" value="${p.runningBaseline.weeklyMileage}" inputmode="decimal">`)}${field("runningBaseline.longestRun","Longest run in the last 4–6 weeks",`<input name="longestRun" type="number" min="0" max="100" step="0.1" value="${p.runningBaseline.longestRun}" inputmode="decimal">`)}${field("runningSessionsTarget","Run sessions per week",`<select name="runningSessionsTarget"><option value="auto">Let Liberty Forge decide</option>${[1,2,3,4,5].map(n => `<option value="${n}" ${Number(p.runningSessionsTarget) === n ? "selected" : ""}>${n}</option>`).join("")}</select>`)}${field("runningBaseline.recentPerformanceDistance","Optional recent performance",`<select name="recentPerformanceDistance"><option value="">Skip</option>${["1 mile","2 mile","5K","10K","Half Marathon","Marathon","Other"].map(v => `<option ${p.runningBaseline.recentPerformanceDistance === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("runningBaseline.recentPerformanceTime","Recent time (optional)",`<input name="recentPerformanceTime" value="${html(p.runningBaseline.recentPerformanceTime)}" placeholder="HH:MM:SS or MM:SS">`)}</div></div>`,
      5: `<div class="hybrid-step"><p class="eyebrow">STEP 5 OF 9</p><h3>How should run intensity be shown?</h3>${radioCards("runningIntensityDisplay", [["rpe","RPE","Use perceived effort only."],["pace-rpe","Pace + RPE","Default guidance with effort as the fallback."],["heart-rate-rpe","Heart Rate + RPE","Use heart-rate guidance without requiring pace."],["pace-heart-rate-rpe","Pace + Heart Rate + RPE","Show all available guidance without requiring a device."]], p.runningIntensityDisplay)}<p class="small-note">RPE always remains available and should guide the run when weather or terrain makes pace misleading.</p></div>`,
      6: `<div class="hybrid-step"><p class="eyebrow">STEP 6 OF 9</p><h3>Race goal</h3>${p.hybridPriority !== "race" ? `<label class="toggle-row"><input name="raceEnabled" type="checkbox" ${p.raceGoal.enabled ? "checked" : ""}><span>Add an optional race goal</span></label>` : `<p>A race date is required for Race Hybrid.</p>`}<div class="hybrid-form-grid race-fields ${!p.raceGoal.enabled && p.hybridPriority !== "race" ? "muted-fields" : ""}">${field("raceGoal.distance","Distance",`<select name="raceDistance">${["5K","10K","Half Marathon","Marathon","Other"].map(v => `<option ${p.raceGoal.distance === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("raceGoal.date","Race date",`<input name="raceDate" type="date" value="${p.raceGoal.date}">`)}${field("raceGoal.goal","Goal",`<select name="raceGoalText">${["Finish comfortably","Improve previous time","Target finish time"].map(v => `<option ${p.raceGoal.goal === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("raceGoal.targetTime","Target time (optional)",`<input name="targetTime" value="${html(p.raceGoal.targetTime)}" placeholder="Example: 1:55:00">`)}</div></div>`,
      7: `<div class="hybrid-step"><p class="eyebrow">STEP 7 OF 9</p><h3>Recovery and limitations</h3><div data-field-key="recoveryPreferences.limitations"><div class="limitation-grid">${["None","Knee","Shin","Achilles / calf","Foot / plantar","Hip","Lower back","Other"].map(v => `<label><input type="checkbox" name="limitations" value="${v}" ${p.recoveryPreferences.limitations.includes(v) ? "checked" : ""}> ${v}</label>`).join("")}</div><small class="hybrid-field-error"></small></div><div class="hybrid-form-grid">${field("recoveryPreferences.sleep","Typical sleep",`<select name="typicalSleep">${["poor","fair","good","great"].map(v => `<option value="${v}" ${p.recoveryPreferences.sleep === v ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select>`)}${field("recoveryPreferences.fatigue","Typical general fatigue",`<select name="typicalFatigue">${["low","normal","high"].map(v => `<option value="${v}" ${p.recoveryPreferences.fatigue === v ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`).join("")}</select>`)}</div><p class="safety-note">These are training-modification inputs only. Fleeman Fitness does not diagnose injuries.</p></div>`,
      8: `<div class="hybrid-step"><p class="eyebrow">STEP 8 OF 9</p><h3>Schedule preferences</h3><p class="small-note">Preferences improve scoring but never override safety constraints.</p><div class="hybrid-form-grid">${p.scheduleType === "rolling" ? `<div class="wide profile-reuse-card"><strong>Rolling sequence placement</strong><p>Liberty Forge will place training and explicit rest days by stress and priority. Weekday preferences do not apply to a rolling cycle.</p></div>` : `${field("schedulingPreferences.longRunDay","Preferred long-run day",`<select name="longRunDay"><option value="">No preference</option>${DAY_OPTIONS}</select>`)}${field("schedulingPreferences.heavyLowerDay","Preferred heavy lower day",`<select name="heavyLowerDay"><option value="">No preference</option>${DAY_OPTIONS}</select>`)}${field("schedulingPreferences.restDay","Preferred rest day",`<select name="restDay"><option value="">No preference</option>${DAY_OPTIONS}</select>`)}`}${field("schedulingPreferences.runningSurface","Running surface",`<select name="runningSurface">${["Mixed","Road","Track","Trail","Treadmill"].map(v => `<option ${p.schedulingPreferences.runningSurface === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}</div></div>`,
      9: `<div class="hybrid-step"><p class="eyebrow">STEP 9 OF 9</p><h3>Review and advanced options</h3><div class="builder-review-card"><strong>${PRIORITY_NAMES[p.hybridPriority]}</strong><p>${p.availableDays.length} available days • ${p.strengthSessionsTarget === "auto" ? "Engine-selected" : p.strengthSessionsTarget} strength • ${p.runningSessionsTarget === "auto" ? "Engine-selected" : p.runningSessionsTarget} runs</p></div><details class="advanced-options"><summary>Advanced options</summary><h4>Strength</h4><div class="hybrid-form-grid">${field("advanced.preferredSplit","Preferred split",`<select name="preferredSplit"><option value="auto">Let the engine decide</option>${["Upper / Lower","Full Body","Push / Pull / Legs"].map(v => `<option ${p.advanced.preferredSplit === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("advanced.sessionDuration","Session-duration limit",`<input name="sessionDuration" type="number" min="20" max="180" value="${p.advanced.sessionDuration}">`)}${field("advanced.minLiftingDays","Minimum lifting days",`<input name="minLiftingDays" type="number" min="1" max="4" value="${p.advanced.minLiftingDays}">`)}${field("advanced.maxLiftingDays","Maximum lifting days",`<input name="maxLiftingDays" type="number" min="2" max="6" value="${p.advanced.maxLiftingDays}">`)}${field("advanced.exercisesToAvoid","Exercises to avoid",`<textarea name="exercisesToAvoid">${html(p.advanced.exercisesToAvoid)}</textarea>`, true)}</div><h4>Running</h4><div class="hybrid-form-grid">${field("advanced.maximumRunningDays","Maximum running days",`<input name="maximumRunningDays" type="number" min="1" max="7" value="${p.advanced.maximumRunningDays}">`)}${field("advanced.speedworkPreference","Speedwork preference",`<select name="speedworkPreference"><option value="auto">Let the engine decide</option><option value="none" ${p.advanced.speedworkPreference === "none" ? "selected" : ""}>No formal speedwork</option><option value="strides" ${p.advanced.speedworkPreference === "strides" ? "selected" : ""}>Strides first</option><option value="structured" ${p.advanced.speedworkPreference === "structured" ? "selected" : ""}>Structured quality when eligible</option></select>`)}${field("advanced.preferredLongRunDuration","Preferred long-run duration",`<input name="preferredLongRunDuration" type="number" min="20" max="300" value="${html(p.advanced.preferredLongRunDuration)}" placeholder="Minutes">`)}${field("advanced.knownEasyPace","Known easy pace (optional)",`<input name="knownEasyPace" value="${html(p.advanced.knownEasyPace)}" placeholder="Example: 10:30/mi">`)}${field("advanced.heartRateZones","Heart-rate zones (optional)",`<input name="heartRateZones" value="${html(p.advanced.heartRateZones)}" placeholder="Example: Z2 125–145">`)}</div><h4>Recovery and scheduling</h4><div class="hybrid-form-grid">${field("advanced.maxConsecutiveDays","Maximum consecutive training days",`<input name="maxConsecutiveDays" type="number" min="1" max="7" value="${p.advanced.maxConsecutiveDays}">`)}${field("advanced.hoursBetweenMajor","Preferred hours between major sessions",`<input name="hoursBetweenMajor" type="number" min="3" max="72" value="${p.advanced.hoursBetweenMajor}">`)}${field("advanced.stressDistribution","Stress distribution",`<select name="stressDistribution"><option value="spread" ${p.advanced.stressDistribution === "spread" ? "selected" : ""}>Spread stress</option><option value="balanced" ${p.advanced.stressDistribution === "balanced" ? "selected" : ""}>Balanced stress</option></select>`)}</div></details><p class="small-note">The engine will build a session inventory first, test multiple schedules, and explain the selected week.</p></div>`
    };
    document.querySelector("#hybridBuilderBody").innerHTML = parts[step];
    if (p.scheduleType === "rolling" && step === 3) document.querySelector('[data-field-key="strengthSessionsTarget"] > span').textContent = "Strength sessions per cycle";
    if (p.scheduleType === "rolling" && step === 4) document.querySelector('[data-field-key="runningSessionsTarget"] > span').textContent = "Run sessions per cycle";
    if (step === 9) document.querySelector(".builder-review-card p").textContent = `${p.scheduleType === "rolling" ? `${p.rollingCycleLength} rolling days × ${p.rollingNormalCycles} cycles` : `${p.availableDays.length} available weekdays`} • ${p.strengthSessionsTarget === "auto" ? "Engine-selected" : p.strengthSessionsTarget} strength • ${p.runningSessionsTarget === "auto" ? "Engine-selected" : p.runningSessionsTarget} runs`;
    document.querySelector("#hybridBuilderBack").textContent = step === 1 ? "Save & close" : "Back";
    document.querySelector("#hybridBuilderNext").textContent = step === 9 ? "Build my Hybrid program" : "Continue";
    restoreSelectValues();
    document.querySelectorAll(".hybrid-choice input").forEach(input => input.addEventListener("change", () => document.querySelectorAll(`input[name="${input.name}"]`).forEach(item => item.closest(".hybrid-choice")?.classList.toggle("selected", item.checked))));
    document.querySelectorAll('input[name="scheduleType"]').forEach(input => input.addEventListener("change", () => { builder.scheduleType = input.value; renderBuilderStep(); }));
  }

  function restoreSelectValues() {
    const map = { longRunDay: builder.schedulingPreferences.longRunDay, heavyLowerDay: builder.schedulingPreferences.heavyLowerDay, restDay: builder.schedulingPreferences.restDay, preferredTrainingTimes: builder.preferredTrainingTimes[0] };
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
        if (validate && (builder.trainingDays < 3 || builder.trainingDays > 7)) errors.trainingDays = "Choose 3 through 7 training days.";
        if (validate && !builder.availableDays.length) errors.availableDays = "Choose at least one available day.";
        else if (validate && builder.availableDays.length < builder.trainingDays) errors.availableDays = `Choose at least ${builder.trainingDays} available days, or lower the total training days.`;
      }
    }
    if (step === 3) { builder.strengthSessionsTarget = value("strengthSessionsTarget"); builder.strengthProfile.experience = value("strengthExperience"); if (validate && !data.workouts.some(w => w.exercises?.length)) errors.strengthSessionsTarget = "Create or save at least one strength workout before building a Hybrid program."; }
    if (step === 4) { Object.assign(builder.runningBaseline, { experience: value("runningExperience"), consistency: value("runningConsistency"), runsPerWeek: Number(value("runsPerWeek")), weeklyMileage: Number(value("weeklyMileage")), longestRun: Number(value("longestRun")), recentPerformanceDistance: value("recentPerformanceDistance"), recentPerformanceTime: value("recentPerformanceTime"), recentPerformance: [value("recentPerformanceDistance"), value("recentPerformanceTime")].filter(Boolean).join(" in ") }); builder.runningSessionsTarget = value("runningSessionsTarget"); if (validate && (builder.runningBaseline.runsPerWeek < 0 || builder.runningBaseline.runsPerWeek > 5)) errors["runningBaseline.runsPerWeek"] = "Choose current runs per week from 0 through 5+."; if (validate && (builder.runningBaseline.weeklyMileage < 0 || builder.runningBaseline.weeklyMileage > 300)) errors["runningBaseline.weeklyMileage"] = "Enter a weekly distance from 0 through 300."; if (validate && (builder.runningBaseline.longestRun < 0 || builder.runningBaseline.longestRun > 100)) errors["runningBaseline.longestRun"] = "Enter a longest run from 0 through 100."; if (validate && builder.runningBaseline.longestRun > builder.runningBaseline.weeklyMileage && builder.runningBaseline.weeklyMileage > 0) errors["runningBaseline.longestRun"] = "Longest run should not exceed the whole weekly distance."; }
    if (step === 5) { builder.runningIntensityDisplay = value("runningIntensityDisplay"); if (validate && !builder.runningIntensityDisplay) errors.runningIntensityDisplay = "Choose an intensity display."; }
    if (step === 6) { builder.raceGoal.enabled = builder.hybridPriority === "race" || Boolean(form.elements.raceEnabled?.checked); Object.assign(builder.raceGoal, { distance: value("raceDistance"), date: value("raceDate"), goal: value("raceGoalText"), targetTime: value("targetTime") }); if (validate && builder.raceGoal.enabled && !builder.raceGoal.date) errors["raceGoal.date"] = "Choose the race date."; if (validate && builder.raceGoal.date && builder.raceGoal.date <= today()) errors["raceGoal.date"] = "Choose a future race date."; if (validate && builder.raceGoal.enabled && builder.raceGoal.goal === "Target finish time" && !builder.raceGoal.targetTime) errors["raceGoal.targetTime"] = "Enter the target finish time."; }
    if (step === 7) { const limitations = [...form.querySelectorAll('[name="limitations"]:checked')].map(i => i.value); builder.recoveryPreferences.limitations = limitations.includes("None") && limitations.length > 1 ? limitations.filter(v => v !== "None") : limitations; builder.recoveryPreferences.sleep = value("typicalSleep"); builder.recoveryPreferences.fatigue = value("typicalFatigue"); if (validate && !builder.recoveryPreferences.limitations.length) errors["recoveryPreferences.limitations"] = "Choose None or at least one limitation."; }
    if (step === 8) { Object.assign(builder.schedulingPreferences, { longRunDay: value("longRunDay") ?? builder.schedulingPreferences.longRunDay, heavyLowerDay: value("heavyLowerDay") ?? builder.schedulingPreferences.heavyLowerDay, restDay: value("restDay") ?? builder.schedulingPreferences.restDay, runningSurface: value("runningSurface") }); }
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
    builder = clone(existing || generated?.setup || defaultBuilder(priority)); builder.currentStep = Number(builder.currentStep) || 1; builder.scheduleType ||= "weekly"; builder.rollingCycleLength ||= 8; builder.rollingNormalCycles ||= 4;
    renderBuilderStep(); document.querySelector("#hybridBuilderDialog").showModal();
  }

  function finishBuilder() {
    let generated;
    try { generated = Scheduler.generateHybridSchedule({ ...builder, runHistory: data.runHistory }, data.workouts); }
    catch (error) {
      const key = /consecutive/i.test(error.message) ? "advanced.maxConsecutiveDays" : /avoid/i.test(error.message) ? "advanced.exercisesToAvoid" : "strengthSessionsTarget";
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
      setup: clone(builder), schedule: generated.schedule, scheduleScore: generated.score, conflicts: generated.conflicts, loadSummary: generated.loadSummary, why: generated.why, racePhase: generated.racePhase,
      alternativesEvaluated: generated.alternativesEvaluated, progress: existing?.progress || { completed: [], skipped: [], rescheduled: [], reviewedWeeks: [] }, deferredStrengthProgression: [], recoveryWeekState: 0
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
  function programProgress(program) {
    const total = (isRolling(program) ? program.totalCycles || program.totalWeeks || 4 : program.totalWeeks || 4) * program.schedule.reduce((sum, day) => sum + day.sessions.length, 0);
    const done = program.progress.completed.length + program.progress.skipped.length;
    return { total, done, percent: total ? Math.min(100, Math.round(done / total * 100)) : 0 };
  }
  function sessionSummary(session, program = data.hybridPrograms?.active) {
    if (session.type === "rest") return "Planned recovery • advance when complete";
    if (session.type === "run" || session.type === "recovery") return `${session.runType || session.title} • ${session.targetDistance ? `${session.targetDistance} ${distanceUnit(program)}` : `${session.targetDuration || 20} min`} • RPE ${session.rpeTarget}`;
    return `${session.subtype || "Strength"} • ${session.exerciseCount || "saved"} exercises • priority ${session.priority}`;
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
    return `<div class="hybrid-week-grid">${program.schedule.map(day => { const restDay = day.sessions.length === 0 || day.sessions.every(session => session.type === "rest"); return `<article class="hybrid-day-card ${restDay ? "rest" : ""}"><div class="hybrid-day-heading"><strong>${day.day}</strong><span>${restDay ? "Rest" : day.sessionType}</span></div>${day.sessions.length ? day.sessions.map(session => `<div class="hybrid-session ${session.type}"><div><span class="session-priority priority-${session.priority}">${session.priority}</span><strong>${html(session.title)}</strong><small>${html(sessionSummary(session, program))}</small></div>${editable && session.type !== "rest" ? `<label class="move-session-label">Move<select data-move-session="${session.id}">${moveOptions(program, day.dayIndex)}</select></label>` : ""}</div>`).join("") + (day.sessions.length > 1 ? `<p class="separation-guidance">Keep about ${day.separationHours || 6}+ hours between sessions when practical.</p>` : "") : `<p class="small-note">Recovery day</p>`}</article>`; }).join("")}</div>`;
  }

  function renderProgramReview() {
    const program = findProgram(reviewProgramId); if (!program) return document.querySelector("#hybridProgramDialog")?.close();
    const body = document.querySelector("#hybridProgramBody"), load = program.loadSummary || {}, progress = programProgress(program);
    document.querySelector("#hybridProgramTitle").textContent = program.name;
    const pending = program.pendingMove;
    const durationSummary = isRolling(program) ? `${program.cycleLength || program.schedule.length}-day cycle × ${program.totalCycles || program.totalWeeks} cycles` : `${program.totalWeeks} weeks`;
    body.innerHTML = `<section class="hybrid-review-summary"><div><span class="program-mode-badge">${html(PRIORITY_NAMES[program.hybridPriority])} • ${isRolling(program) ? "ROLLING CYCLE" : "WEEKLY SCHEDULE"}</span><h3>${html(program.name)}</h3><p>${durationSummary} • ${load.strengthSessions || 0} strength + ${load.runningSessions || 0} runs • ${load.runningDistance ? `${load.runningDistance} planned ${program.setup?.runningDistanceUnit || (data.profile?.units === "metric" ? "kilometers" : "miles")}` : "time-based starting runs"}${program.racePhase?.name && program.racePhase.name !== "general" ? ` • ${html(program.racePhase.name)} race phase` : ""}</p></div><div class="schedule-score"><strong>${Math.round(program.scheduleScore || 0)}</strong><span>schedule score</span></div></section>
      <div class="load-summary-grid"><div><span>LOWER BODY</span><strong>${html(load.lowerBody || "Low")}</strong></div><div><span>UPPER BODY</span><strong>${html(load.upperBody || "Low")}</strong></div><div><span>CARDIO</span><strong>${html(load.cardio || "Low")}</strong></div><div><span>RECOVERY</span><strong>${html(load.recoveryBalance || "Good")}</strong></div></div>
      <section class="why-schedule"><h3>Why this schedule?</h3>${(program.why || []).map(reason => `<p>◆ ${html(reason)}</p>`).join("")}<p class="small-note">${program.alternativesEvaluated || 0} candidate schedules were scored before selecting this one.</p></section>
      ${conflictMarkup(program.conflicts)}
      ${pending ? `<section class="pending-move ${pending.warning?.rating || "green"}"><h3>Review schedule change</h3><p>${pending.warning ? html(pending.warning.message || pending.warning.reason || "This move increases nearby training conflict.") : "This move does not create a major conflict."}</p><div class="exercise-actions"><button class="primary-button" data-move-decision="keep">Move anyway</button><button class="secondary-button" data-move-decision="recommended">Use recommended schedule</button><button class="secondary-button" data-move-decision="reduce">Modify strength stress</button></div></section>` : ""}
      ${scheduleMarkup(program, program.status !== "completed")}
      ${program.status === "active" ? `<div class="hybrid-progress"><span style="width:${progress.percent}%"></span></div><p class="small-note">${progress.done} of ${progress.total} sessions completed or skipped</p>` : ""}
      <div class="program-review-actions">${program.status === "draft" ? `<button class="primary-button" data-program-action="start">Start this program</button><button class="secondary-button" data-program-action="edit">Edit builder answers</button><button class="secondary-button" data-program-action="keep">Keep as draft</button>` : program.status === "active" ? `<button class="primary-button" data-program-action="weekly">${isRolling(program) ? "Cycle review" : "Weekly review"}</button><button class="secondary-button" data-program-action="end">End program</button>` : `<button class="secondary-button" data-program-action="close">Close</button>`}</div>`;
    body.querySelectorAll("[data-move-session]").forEach(select => select.addEventListener("change", event => stageProgramMove(program, event.target.dataset.moveSession, Number(event.target.value))));
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
  function programAction(program, action) {
    if (action === "close" || action === "keep") return document.querySelector("#hybridProgramDialog").close();
    if (action === "edit") { document.querySelector("#hybridProgramDialog").close(); data.hybridBuilderDraft = clone(program.setup); data.hybridBuilderDraft.currentStep = 1; openHybridBuilder(program.hybridPriority); return; }
    if (action === "start") {
      if (data.hybridPrograms.active && !confirm("Replace the currently active Hybrid program? It will remain saved as a draft.")) return;
      if (data.hybridPrograms.active) { data.hybridPrograms.active.status = "draft"; data.hybridPrograms.drafts.unshift(data.hybridPrograms.active); }
      data.hybridPrograms.drafts = data.hybridPrograms.drafts.filter(item => item.id !== program.id); program.status = "active"; program.startDate = today(); program.activationDayIndex = isRolling(program) ? null : mondayIndex(); data.hybridPrograms.active = program;
      saveData(); renderProgramReview(); renderHybridBuildPanel(); renderHome(); return;
    }
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
    document.querySelector("#hybridProgramBody").innerHTML = `<section class="weekly-review"><p class="eyebrow">${period.toUpperCase()} ${week} REVIEW</p><h3>${decision.decision}</h3><p>${html(decision.running.reason)}</p><div class="load-summary-grid"><div><span>COMPLETION</span><strong>${Math.round(decision.running.summary.completionRate * 100)}%</strong></div><div><span>RUN DISTANCE</span><strong>${decision.running.summary.averageWeeklyDistance.toFixed(1)}</strong></div><div><span>EASY RPE / DRIFT</span><strong>${decision.running.summary.averageEasyRpe.toFixed(1)} / ${decision.running.summary.easyRpeDrift.toFixed(1)}</strong></div><div><span>HARD RUNS / ${period.toUpperCase()}</span><strong>${decision.running.summary.hardSessionsPerWeek.toFixed(1)}</strong></div></div><h3>Next-${period} recommendation</h3><p>Running volume: ${Math.round(decision.runningVolumeMultiplier * 100)}% • Strength volume: ${Math.round(decision.strengthVolumeMultiplier * 100)}%. Only one running progression lever changes at a time.</p>${decision.strengthBudget.length ? `<div class="strength-budget"><h3>Strength progression budget</h3>${decision.strengthBudget.map(item => `<p><strong>${html(item.exerciseName || item.exerciseId)}</strong> — eligible: yes • applied: ${item.applied ? "yes" : "no"}<br><small>${html(item.reason)}</small></p>`).join("")}</div>` : `<p class="small-note">No earned strength progressions are waiting for coordination this ${period}.</p>`}${pain.length ? `<div class="recovery-warning"><strong>Pain remains separate from fatigue.</strong><p>Review ${pain.map(item => `${html(item.painLocation)} ${item.painRating}/5`).join(", ")} before approving the next ${period}.</p></div>` : ""}<p class="small-note">Major substitutions and volume changes require approval. You may edit minor load and RIR changes before approval.</p><div class="program-review-actions"><button id="approveHybridWeek" class="primary-button">Approve next ${period}</button><button id="backHybridWeek" class="secondary-button">Back to schedule</button></div></section>`;
    document.querySelector("#approveHybridWeek").onclick = () => { applyWeeklyDecision(program, decision, week); };
    document.querySelector("#backHybridWeek").onclick = renderProgramReview;
  }
  function applyWeeklyDecision(program, decision, week) {
    const nextWeek = Math.min(program.totalWeeks, Number(week) + 1);
    const nextSchedule = clone(scheduleForWeek(program, nextWeek));
    nextSchedule.forEach(day => day.sessions.forEach(session => {
      if (session.type === "run") { session.targetDistance = Number((Number(session.targetDistance || 0) * decision.runningVolumeMultiplier).toFixed(1)); session.targetDuration = Math.round(Number(session.targetDuration || 0) * decision.runningVolumeMultiplier); }
      if (session.type === "strength") session.volumeMultiplier = Number(((session.volumeMultiplier || 1) * decision.strengthVolumeMultiplier).toFixed(2));
    }));
    program.weeklyOverrides ||= {};
    program.weeklyOverrides[nextWeek] = nextSchedule;
    program.deferredStrengthProgression = decision.strengthBudget.filter(item => item.deferred).map(item => ({ ...item, deferredAtWeek: week }));
    program.progress.appliedStrengthProgression ||= [];
    program.progress.appliedStrengthProgression.push(...decision.strengthBudget.filter(item => item.applied).map(item => ({ ...item, appliedAtWeek: week })));
    program.progress.reviewedWeeks.push({ week, appliedToWeek: nextWeek, date: new Date().toISOString(), decision: decision.decision, runningVolumeMultiplier: decision.runningVolumeMultiplier, strengthVolumeMultiplier: decision.strengthVolumeMultiplier, approved: true }); saveData(); renderProgramReview(); renderHome();
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
      const workoutId = session.workoutId; const workoutContext = { scheduleType: "hybrid", hybridProgramId: context.program.id, week: context.week, cycle: isRolling(context.program) ? context.week : null, hybridScheduleType: context.program.scheduleType, dayIndex: context.dayIndex, hybridSessionId: session.id, occurrenceId: context.occurrenceId, hybridAdjustment: { volumeMultiplier: session.volumeMultiplier || 1, holdProgression: Boolean(session.holdProgression), recoveryDecision: session.recoveryDecision || null } };
      startWorkout(workoutId, workoutContext);
    }
    readinessContext = null;
  }

  function runForm(session, saved = {}) {
    const unit = distanceUnit(runContext?.program), target = session.targetDistance ? `${session.targetDistance} ${unit}` : `${session.targetDuration || 20} minutes`;
    return `<section class="run-prescription"><span class="program-mode-badge">${html(session.runType || "Recovery Run")}</span><h3>Today's target</h3><div class="run-target-grid"><div><span>TARGET</span><strong>${target}</strong></div><div><span>EFFORT</span><strong>RPE ${html(session.rpeTarget || "2-4")}</strong></div><div><span>PRIORITY</span><strong>${html(session.priority || "C")}</strong></div>${session.paceTarget ? `<div><span>PACE GUIDE</span><strong>${html(session.paceTarget)}</strong></div>` : ""}${session.heartRateTarget ? `<div><span>HEART RATE</span><strong>${html(session.heartRateTarget)}</strong></div>` : ""}</div>${session.strides ? `<p><strong>Strides:</strong> ${html(session.strides)}</p>` : ""}${session.recoveryDecision ? `<p class="adjustment-note">Adjusted after readiness check: ${html(session.recoveryDecision.decision)}</p>` : ""}</section><div class="hybrid-form-grid">${field("completedDistance",`Distance completed (${unit})`,`<input name="completedDistance" type="number" min="0" max="300" step="0.01" inputmode="decimal" value="${saved.completedDistance ?? ""}">`)}${field("durationMinutes","Duration (minutes)",`<input name="durationMinutes" type="number" min="0" max="1440" step="1" inputmode="numeric" value="${saved.durationMinutes ?? ""}">`)}${field("averagePace","Average pace (optional)",`<input name="averagePace" value="${html(saved.averagePace || "")}" placeholder="Example: 10:24/${unit}">`)}${field("averageHeartRate","Average heart rate (optional)",`<input name="averageHeartRate" type="number" min="0" max="250" inputmode="numeric" value="${saved.averageHeartRate ?? ""}">`)}${field("rpe","Session RPE",`<input name="rpe" type="number" min="1" max="10" inputmode="numeric" value="${saved.rpe ?? ""}">`)}${field("completion","Completion",`<select name="completion"><option value="completed">Completed</option><option value="partial" ${saved.completion === "partial" ? "selected" : ""}>Partially completed</option><option value="skipped" ${saved.completion === "skipped" ? "selected" : ""}>Skipped</option></select>`)}${field("partialReason","Partial/skip reason",`<select name="partialReason"><option value="">Not applicable</option>${["Fatigue","Pain / discomfort","Time constraint","Weather / environment","Schedule","Other"].map(v => `<option ${saved.partialReason === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("painRating","Pain during run",`<select name="painRating"><option value="0">None</option>${[1,2,3,4,5].map(n => `<option value="${n}" ${Number(saved.painRating) === n ? "selected" : ""}>${n}</option>`).join("")}</select>`)}${field("painLocation","Pain location",`<select name="painLocation"><option>None</option>${["Knee","Shin","Achilles / calf","Ankle","Foot / plantar","Hip","Lower back","Other"].map(v => `<option ${saved.painLocation === v ? "selected" : ""}>${v}</option>`).join("")}</select>`)}${field("notes","Run notes",`<textarea name="notes" placeholder="Terrain, weather, effort, or anything useful next week">${html(saved.notes || "")}</textarea>`, true)}</div><p id="runFormError" class="form-error hidden" role="alert"></p><div class="program-review-actions"><button class="primary-button" type="submit">Save run</button><button id="saveRunForLater" class="secondary-button" type="button">Save & close</button></div>`;
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
    if (values.completion !== "skipped" && (!values.durationMinutes || values.durationMinutes <= 0)) errors.push("Enter the completed duration.");
    if (values.completion !== "skipped" && (values.rpe < 1 || values.rpe > 10)) errors.push("Enter a session RPE from 1 through 10.");
    if (["partial","skipped"].includes(values.completion) && !values.partialReason) errors.push("Choose why the run was partial or skipped.");
    if (Number(values.painRating) >= 3 && values.painLocation === "None") errors.push("Choose the pain location.");
    const error = document.querySelector("#runFormError"); error.textContent = errors.join(" "); error.classList.toggle("hidden", !errors.length); if (errors.length) { error.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const active = data.activeRunSession, program = findProgram(active.context.programId), planned = active.planned;
    const record = { id: id("run"), type: "run", programId: program.id, week: active.context.week, dayIndex: active.context.dayIndex, occurrenceId: active.context.occurrenceId, workoutName: planned.title, runType: planned.runType || planned.title, plannedDistance: Number(planned.targetDistance || 0), plannedDuration: Number(planned.targetDuration || 0), completedDistance: Number(values.completedDistance || 0), completedDuration: values.durationMinutes ? `${values.durationMinutes} min` : "", durationMinutes: Number(values.durationMinutes || 0), averagePace: values.averagePace, averageHeartRate: Number(values.averageHeartRate || 0), rpe: Number(values.rpe || 0), completion: values.completion, partialReason: values.partialReason, painRating: Number(values.painRating || 0), painLocation: values.painLocation, notes: values.notes, date: new Date().toISOString(), distanceUnit: distanceUnit(program) };
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
    const pausedStrength = dashboardSavedSession(), activeRun = data.activeRunSession, next = nextActionable(program), actionDay = currentActionableDay(program);
    const name = document.querySelector("#todayWorkoutName"), summary = document.querySelector("#todayWorkoutSummary"), badge = document.querySelector("#todaySessionBadge"), meta = document.querySelector("#todayMesoMeta"), primary = document.querySelector("#startWorkoutButton"), preview = document.querySelector("#previewTodayWorkoutButton");
    if (pausedStrength) { name.textContent = pausedStrength.workoutName || "Active strength workout"; summary.textContent = "Your logged sets and notes are saved on this device."; badge.textContent = "WORKOUT IN PROGRESS"; meta.textContent = `${program.name} • ${periodName(program).toUpperCase()} ${currentWeek(program)}`; primary.textContent = "Resume workout"; primary.onclick = () => document.querySelector("#sessionDialog")?.showModal(); preview.classList.add("hidden"); }
    else if (activeRun) { name.textContent = activeRun.planned.title; summary.textContent = "Your run log is saved. Resume when you are ready."; badge.textContent = "RUN IN PROGRESS"; meta.textContent = `${program.name} • ${periodName(program).toUpperCase()} ${activeRun.context.week}`; primary.textContent = "Resume run"; primary.onclick = () => launchCurrentHybrid(primary); preview.classList.add("hidden"); }
    else if (next) {
      const missed = !isRolling(program) && next.dayIndex < mondayIndex(), combined = !missed && actionDay?.occurrences.length > 1;
      if (next.session.type === "rest") {
        name.textContent = "Rest Day"; summary.textContent = "Complete this planned recovery day when you are ready to advance the rolling sequence."; badge.textContent = "NEXT ROLLING DAY"; meta.textContent = `${program.name} • CYCLE ${next.week} • CYCLE DAY ${next.dayIndex + 1}`;
        primary.textContent = "Complete Rest Day"; primary.onclick = () => completeRollingRest(next); preview.classList.remove("hidden"); preview.textContent = "Review program"; preview.onclick = () => openHybridProgram(program.id);
      } else if (combined) {
        const [first, second] = actionDay.occurrences;
        name.textContent = "Hybrid Day"; summary.textContent = actionDay.occurrences.map(item => item.session.title).join(" + "); badge.textContent = isRolling(program) ? "NEXT ROLLING HYBRID DAY" : actionDay.dayIndex === mondayIndex() ? "TODAY'S HYBRID DAY" : "NEXT HYBRID DAY"; meta.textContent = `${program.name} • ${periodName(program).toUpperCase()} ${first.week} • ${isRolling(program) ? `CYCLE DAY ${first.dayIndex + 1} • ` : ""}${first.session.title} recommended first`;
        primary.textContent = `Start ${first.session.type === "run" ? "Run" : "Strength"}`; primary.onclick = event => launchHybridOccurrence(first, event.currentTarget);
        preview.classList.remove("hidden"); preview.textContent = `Start ${second.session.type === "run" ? "Run" : "Strength"}`; preview.onclick = event => launchHybridOccurrence(second, event.currentTarget);
      } else {
        name.textContent = next.session.title; summary.textContent = sessionSummary(next.session, program); badge.textContent = missed ? "MISSED SESSION — CHOOSE NEXT STEP" : isRolling(program) ? "NEXT ROLLING SESSION" : next.dayIndex === mondayIndex() ? "TODAY'S HYBRID SESSION" : "NEXT HYBRID SESSION"; meta.textContent = `${program.name} • ${periodName(program).toUpperCase()} ${next.week}${isRolling(program) ? ` • CYCLE DAY ${next.dayIndex + 1}` : ""}`; primary.textContent = missed ? "Review missed session" : "Check readiness & start"; primary.onclick = event => launchCurrentHybrid(event.currentTarget); preview.classList.remove("hidden"); preview.textContent = "Review program"; preview.onclick = () => openHybridProgram(program.id);
      }
    }
    else { const label = periodName(program); name.textContent = `${label} ready for review`; summary.textContent = `All scheduled sessions in this ${label.toLowerCase()} are completed or skipped.`; badge.textContent = `HYBRID ${label.toUpperCase()} COMPLETE`; meta.textContent = `${program.name} • ${label.toUpperCase()} ${currentWeek(program)}`; primary.textContent = `Open ${label.toLowerCase()} review`; primary.onclick = () => { openHybridProgram(program.id); renderWeeklyReview(program); }; preview.classList.add("hidden"); }
    const week = currentWeek(program), dayNow = mondayIndex(), weekly = weekOccurrences(program, week), doneCount = weekly.filter(item => isResolved(program, item.occurrenceId)).length, currentDayIndex = isRolling(program) ? next?.dayIndex : dayNow;
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
    const sourceWorkout = data.workouts.find(workout => workout.id === session.workoutId);
    session.exercises.filter(exercise => exercise.sets?.length && exercise.sets.every(set => set.done) && !["very-hard", "failed-target"].includes(exercise.feedback)).forEach(exercise => {
      const source = sourceWorkout?.exercises.find(item => item.id === exercise.exerciseId) || exercise;
      const region = Stress.exerciseRegion(source).lower >= Stress.exerciseRegion(source).upper ? "lower" : "upper";
      const entry = { exerciseId: exercise.exerciseId, exerciseName: exercise.name, region, week: context.week, earnedAt: new Date().toISOString(), recommendedIncrease: Number(source.increment || data.settings.increment || 0) };
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

  function bindHybridUi() {
    ensureHybridData(); persist();
    document.querySelector("#hybridBuilderNext")?.addEventListener("click", () => { if (!readBuilderStep(true)) return; if (builder.currentStep === 9) finishBuilder(); else { builder.currentStep += 1; data.hybridBuilderDraft = clone(builder); persist(); renderBuilderStep(); } });
    document.querySelector("#hybridBuilderBack")?.addEventListener("click", () => { if (builder.currentStep === 1) closeBuilder(); else { readBuilderStep(false); builder.currentStep -= 1; renderBuilderStep(); } });
    document.querySelector("#closeHybridBuilderButton")?.addEventListener("click", closeBuilder);
    document.querySelector("#hybridBuilderDialog")?.addEventListener("cancel", event => { event.preventDefault(); closeBuilder(); });
    document.querySelector("#hybridBuilderForm")?.addEventListener("input", event => { event.target.closest(".invalid-field")?.classList.remove("invalid-field"); const error = event.target.closest("[data-field-key]")?.querySelector(".hybrid-field-error"); if (error) error.textContent = ""; });
    document.querySelector("#closeHybridProgramButton")?.addEventListener("click", () => document.querySelector("#hybridProgramDialog").close());
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
