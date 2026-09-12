(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FleemanBuildModes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const modes = ["strength", "hybrid", "marathon"];
  const profiles = {
    hybrid: [
      {
        id: "strength-priority",
        name: "Strength Priority",
        icon: "◆",
        badge: "LIFT FIRST",
        description: "Keep strength progress at the center while adding purposeful running around your lifting days.",
        bestFor: "Best for lifters who want better conditioning without giving up focused strength work.",
        defaultGoal: "Improve strength"
      },
      {
        id: "balanced-hybrid",
        name: "Balanced Hybrid",
        icon: "↯",
        badge: "EVEN SPLIT",
        description: "Balance lifting and running so both qualities can improve across the same training block.",
        bestFor: "Best for athletes who value strength and endurance equally.",
        defaultGoal: "Balanced strength and running"
      },
      {
        id: "running-priority",
        name: "Running Priority",
        icon: "➜",
        badge: "RUN FIRST",
        description: "Build the week around running development while retaining productive strength sessions.",
        bestFor: "Best for runners who want to keep lifting without compromising their key runs.",
        defaultGoal: "Improve running"
      },
      {
        id: "race-hybrid",
        name: "Race Hybrid",
        icon: "◈",
        badge: "RACE + STRENGTH",
        description: "Prepare for a race while preserving meaningful strength work around the key running sessions.",
        bestFor: "Best for athletes with a specific race date who still want to train strength.",
        defaultGoal: "Train for a race"
      }
    ],
    marathon: [
      {
        id: "first-marathon",
        name: "First Marathon",
        icon: "1",
        badge: "BUILD TO FINISH",
        description: "A conservative starting point focused on consistency, gradual mileage, and reaching race day prepared.",
        bestFor: "Best for athletes preparing for their first 26.2-mile race.",
        defaultGoal: "Finish my first marathon"
      },
      {
        id: "intermediate-marathon",
        name: "Intermediate",
        icon: "2",
        badge: "IMPROVE YOUR RACE",
        description: "Build on an established running base with more deliberate long runs, quality work, and recovery.",
        bestFor: "Best for runners with prior distance-race or marathon experience.",
        defaultGoal: "Improve my marathon performance"
      },
      {
        id: "advanced-marathon",
        name: "Advanced",
        icon: "3",
        badge: "PERFORMANCE FOCUS",
        description: "Start from a higher training base and prepare for a demanding, performance-oriented marathon block.",
        bestFor: "Best for experienced marathoners accustomed to higher mileage and structured workouts.",
        defaultGoal: "Train for a performance goal"
      }
    ]
  };

  function normalizeMode(value) {
    return modes.includes(value) ? value : "strength";
  }

  function profileFor(mode, profileId) {
    return (profiles[mode] || []).find(profile => profile.id === profileId) || null;
  }

  function createDraft(mode, profileId, values = {}, now = new Date().toISOString()) {
    const profile = profileFor(mode, profileId);
    if (!profile) throw new Error("Unknown program setup profile.");
    return {
      id: values.id || `${mode}-${profileId}`,
      programMode: mode,
      profileId,
      profileName: profile.name,
      status: "setup-draft",
      setup: { ...values, id: undefined },
      updatedAt: now
    };
  }

  return { modes, profiles, normalizeMode, profileFor, createDraft };
});

(function () {
  if (typeof document === "undefined" || !globalThis.FleemanBuildModes) return;

  const SESSION_KEY = "fleemanFitnessBuildMode";
  const api = globalThis.FleemanBuildModes;
  let selectedMode = "strength";
  let setupContext = null;

  function safeSessionGet() {
    try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
  }

  function safeSessionSet(value) {
    try { sessionStorage.setItem(SESSION_KEY, value); } catch { /* Session persistence is optional. */ }
  }

  function ensureDraftData() {
    data.programBuilderDrafts ||= {};
    data.programBuilderDrafts.hybrid ||= {};
    data.programBuilderDrafts.marathon ||= {};
    return data.programBuilderDrafts;
  }

  function savedDraft(mode, profileId) {
    if (mode === "hybrid") {
      const priority = ({ "strength-priority": "strength", "balanced-hybrid": "balanced", "running-priority": "running", "race-hybrid": "race" })[profileId];
      if (data.hybridBuilderDraft?.hybridPriority === priority) return data.hybridBuilderDraft;
      return data.hybridPrograms?.drafts?.find(program => program.hybridPriority === priority) || null;
    }
    return ensureDraftData()[mode]?.[profileId] || null;
  }

  function selectBuildMode(requestedMode, options = {}) {
    selectedMode = api.normalizeMode(requestedMode);
    document.querySelectorAll(".build-mode-tab").forEach(button => {
      const active = button.dataset.buildMode === selectedMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll(".build-mode-panel").forEach(panel => {
      const active = panel.dataset.buildPanel === selectedMode;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
    const strengthAction = document.querySelector("#newMesocycleButton");
    if (strengthAction) strengthAction.classList.toggle("hidden", selectedMode !== "strength");
    safeSessionSet(selectedMode);
    if (options.focus) document.querySelector(`[data-build-mode="${selectedMode}"]`)?.focus();
  }

  function modeCardMarkup(mode, profile) {
    const draft = savedDraft(mode, profile.id);
    return `<article class="program-mode-card ${draft ? "has-draft" : ""}">
      <div class="program-mode-card-top"><span class="program-mode-icon" aria-hidden="true">${profile.icon}</span><span class="program-mode-badge">${profile.badge}</span></div>
      <div><h3>${profile.name}</h3><p>${profile.description}</p><p class="program-mode-best">${profile.bestFor}</p></div>
      ${draft ? `<p class="program-draft-status"><span aria-hidden="true">✓</span> Setup saved ${new Date(draft.updatedAt).toLocaleDateString()}</p>` : ""}
      <button class="primary-button program-mode-start" type="button" data-program-mode="${mode}" data-profile-id="${profile.id}">${draft ? "Continue Setup" : "Start Setup"}</button>
    </article>`;
  }

  function renderModeCards() {
    ["hybrid", "marathon"].forEach(mode => {
      const container = document.querySelector(`#${mode}ProgramCards`);
      if (!container) return;
      container.innerHTML = api.profiles[mode].map(profile => modeCardMarkup(mode, profile)).join("");
    });
    document.querySelectorAll(".program-mode-start").forEach(button => {
      button.addEventListener("click", () => {
        if (button.dataset.programMode === "hybrid" && typeof openHybridBuilder === "function") {
          const priority = ({ "strength-priority": "strength", "balanced-hybrid": "balanced", "running-priority": "running", "race-hybrid": "race" })[button.dataset.profileId];
          openHybridBuilder(priority, button);
          return;
        }
        openProgramSetup(button.dataset.programMode, button.dataset.profileId, button);
      });
    });
    if (typeof renderHybridBuildPanel === "function") renderHybridBuildPanel();
  }

  function option(value, label, current) {
    return `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`;
  }

  function hybridForm(profile, draft) {
    const saved = draft?.setup || {};
    const goal = saved.primaryGoal || profile.defaultGoal;
    return `<div class="program-setup-summary"><span class="program-mode-icon" aria-hidden="true">${profile.icon}</span><div><strong>${profile.name}</strong><p>${profile.description}</p></div></div>
      <p class="program-foundation-note"><strong>Foundation setup:</strong> Save these details now so they are ready when the full hybrid scheduling and progression engine is added.</p>
      <div class="program-setup-grid">
        <label>Primary goal<select name="primaryGoal" required>${["Improve strength","Balanced strength and running","Improve running","Prepare for a specific event"].map(value => option(value, value, goal)).join("")}</select></label>
        <label>Current strength level<select name="strengthLevel" required>${["New to strength training","Beginner","Intermediate","Advanced"].map(value => option(value, value, saved.strengthLevel || "Beginner")).join("")}</select></label>
        <label>Current running level<select name="runningLevel" required>${["New to running","Beginner","Recreational","Experienced"].map(value => option(value, value, saved.runningLevel || "Beginner")).join("")}</select></label>
        <label>Running experience<select name="runningExperience" required>${["Less than 6 months","6–12 months","1–3 years","More than 3 years"].map(value => option(value, value, saved.runningExperience || "Less than 6 months")).join("")}</select></label>
        <label>Days available for lifting<input name="liftingDays" type="number" min="1" max="6" inputmode="numeric" required value="${saved.liftingDays ?? 3}"></label>
        <label>Days available for running<input name="runningDays" type="number" min="1" max="7" inputmode="numeric" required value="${saved.runningDays ?? 3}"></label>
        <label>Preferred total training days<input name="weeklyFrequency" type="number" min="3" max="7" inputmode="numeric" required value="${saved.weeklyFrequency ?? 5}"></label>
        <label>Upcoming event (optional)<input name="eventName" value="${escapeHtml(saved.eventName || "")}" placeholder="Example: local half marathon"></label>
        <label>Event date (optional)<input name="eventDate" type="date" value="${saved.eventDate || ""}"></label>
        <label class="wide">Anything the future plan should work around? (optional)<textarea name="notes" placeholder="Schedule limits, exercise preferences, or running constraints">${escapeHtml(saved.notes || "")}</textarea></label>
      </div>`;
  }

  function marathonForm(profile, draft) {
    const saved = draft?.setup || {};
    const goal = saved.goalType || profile.defaultGoal;
    return `<div class="program-setup-summary"><span class="program-mode-icon" aria-hidden="true">${profile.icon}</span><div><strong>${profile.name}</strong><p>${profile.description}</p></div></div>
      <p class="program-foundation-note"><strong>Foundation setup:</strong> This records the inputs a future marathon engine will use. It does not generate unsafe mileage or workouts yet.</p>
      <div class="program-setup-grid">
        <label>Race date<input name="raceDate" type="date" required value="${saved.raceDate || ""}"></label>
        <label>Goal type<select name="goalType" required>${["Finish my first marathon","Finish comfortably","Improve my marathon performance","Train for a performance goal","Target a specific finish time"].map(value => option(value, value, goal)).join("")}</select></label>
        <label>Current weekly mileage<input name="weeklyMileage" type="number" min="0" max="200" step="0.5" inputmode="decimal" required value="${saved.weeklyMileage ?? ""}" placeholder="Miles per week"></label>
        <label>Longest recent run<input name="longestRun" type="number" min="0" max="50" step="0.5" inputmode="decimal" required value="${saved.longestRun ?? ""}" placeholder="Miles"></label>
        <label>Running experience<select name="runningExperience" required>${["New runner","Less than 1 year","1–3 years","More than 3 years","Previous marathon finisher"].map(value => option(value, value, saved.runningExperience || "New runner")).join("")}</select></label>
        <label>Available running days<input name="runningDays" type="number" min="3" max="7" inputmode="numeric" required value="${saved.runningDays ?? 4}"></label>
        <label>Target finish time (optional)<input name="targetFinishTime" type="text" inputmode="numeric" value="${escapeHtml(saved.targetFinishTime || "")}" placeholder="Example: 4:30"></label>
        <label class="check-field"><input name="retainStrength" type="checkbox" ${saved.retainStrength === false ? "" : "checked"}><span>Retain strength training in the future plan</span></label>
        <label class="wide">Injury history or limitations (optional)<textarea name="injuryLimitations" placeholder="Share only what the plan should account for. The app will not diagnose injuries.">${escapeHtml(saved.injuryLimitations || "")}</textarea></label>
      </div>`;
  }

  function clearSetupErrors(form) {
    form.querySelectorAll(".invalid-field").forEach(field => field.classList.remove("invalid-field"));
    form.querySelectorAll(".program-field-error").forEach(error => error.remove());
    const summary = document.querySelector("#programSetupError");
    summary.textContent = "";
    summary.classList.add("hidden");
  }

  function validateSetup(form) {
    clearSetupErrors(form);
    const invalid = [...form.querySelectorAll("input, select, textarea")].filter(field => !field.checkValidity());
    invalid.forEach(field => {
      field.classList.add("invalid-field");
      const error = document.createElement("small");
      error.className = "program-field-error";
      error.textContent = field.validity.valueMissing ? "This information is required." : "Enter a value within the allowed range.";
      field.insertAdjacentElement("afterend", error);
    });
    if (!invalid.length) return true;
    const summary = document.querySelector("#programSetupError");
    summary.textContent = "Review the highlighted information before saving this setup draft.";
    summary.classList.remove("hidden");
    invalid[0].scrollIntoView({ behavior: "smooth", block: "center" });
    invalid[0].focus({ preventScroll: true });
    return false;
  }

  function closeProgramSetup() {
    document.querySelector("#programSetupDialog")?.close();
    setupContext?.trigger?.focus({ preventScroll: true });
    setupContext = null;
  }

  function openProgramSetup(mode, profileId, trigger) {
    const profile = api.profileFor(mode, profileId);
    if (!profile) return;
    setupContext = { mode, profileId, trigger };
    const dialog = document.querySelector("#programSetupDialog");
    document.querySelector("#programSetupEyebrow").textContent = mode === "hybrid" ? "HYBRID PROGRAM SETUP" : "MARATHON PROGRAM SETUP";
    document.querySelector("#programSetupTitle").textContent = profile.name;
    document.querySelector("#programSetupBody").innerHTML = mode === "hybrid" ? hybridForm(profile, savedDraft(mode, profileId)) : marathonForm(profile, savedDraft(mode, profileId));
    clearSetupErrors(document.querySelector("#programSetupForm"));
    dialog.showModal();
    dialog.querySelector("input, select")?.focus();
  }

  function saveProgramSetup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!setupContext || !validateSetup(form)) return;
    const values = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll('input[type="number"]').forEach(field => { values[field.name] = Number(field.value); });
    values.retainStrength = form.elements.retainStrength ? Boolean(form.elements.retainStrength.checked) : undefined;
    const previous = savedDraft(setupContext.mode, setupContext.profileId);
    const draft = api.createDraft(setupContext.mode, setupContext.profileId, { ...values, id: previous?.id });
    ensureDraftData()[setupContext.mode][setupContext.profileId] = draft;
    const returnMode = setupContext.mode;
    closeProgramSetup();
    saveData();
    renderModeCards();
    selectBuildMode(returnMode);
  }

  function initBuildModes() {
    if (!document.querySelector("#buildModeTabs")) return;
    renderModeCards();
    selectedMode = api.normalizeMode(safeSessionGet());
    selectBuildMode(selectedMode);
    document.querySelectorAll(".build-mode-tab").forEach((button, index, buttons) => {
      button.addEventListener("click", () => selectBuildMode(button.dataset.buildMode));
      button.addEventListener("keydown", event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        selectBuildMode(buttons[nextIndex].dataset.buildMode, { focus: true });
      });
    });
    document.querySelector("#programSetupForm").addEventListener("submit", saveProgramSetup);
    document.querySelector("#closeProgramSetupButton").addEventListener("click", closeProgramSetup);
    document.querySelector("#cancelProgramSetupButton").addEventListener("click", closeProgramSetup);
    document.querySelector("#programSetupDialog").addEventListener("cancel", event => { event.preventDefault(); closeProgramSetup(); });
    document.querySelector("#programSetupForm").addEventListener("input", event => {
      const field = event.target;
      if (!field.matches("input, select, textarea") || !field.checkValidity()) return;
      field.classList.remove("invalid-field");
      field.nextElementSibling?.classList.contains("program-field-error") && field.nextElementSibling.remove();
    });
  }

  globalThis.renderProgramModeCards = renderModeCards;
  initBuildModes();
})();
