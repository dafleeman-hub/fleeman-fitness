"use strict";

const rollingLegacy = {
  ensureMesocycleData,
  newMesocycle,
  openMesocycleBuilder,
  renderMesoBasics,
  renderMesoSchedule,
  renderMesoWorkouts,
  renderMesoReview,
  captureMesoStep,
  assignMesoValidationKeys,
  isMesoFieldCorrected,
  validateMesoStep,
  activateMesocycle,
  mesoTotalWorkouts,
  mesoDoneCount,
  mesoSlotResolved,
  nextMesoSlot,
  currentMesoPosition,
  isDeloadWeek,
  activeMesocycleMarkup,
  wireActiveMesoButtons,
  renderMesoCollection,
  workoutForMesoSlot,
  previewNextMesoWorkout,
  startNextMesoWorkout,
  skipNextMeso,
  afterMesoAdvance,
  repeatPreviousMesoWeek,
  onMesocycleWorkoutFinished,
  rescheduleNextMeso,
  moveMesoForward,
  buildMesoSummary,
  duplicateMesocycle,
  renderMesocycleToday,
  renderTodayDashboard
};

function isRollingMeso(mesocycle) {
  return mesocycle?.scheduleType === "rolling";
}

function scheduleTypeLabel(mesocycle) {
  return isRollingMeso(mesocycle) ? "Rolling Cycle" : "Weekly Schedule";
}

function rollingTotalCycles(mesocycle) {
  return Number(mesocycle.normalCycles || 4) + (mesocycle.deloadMode === "final-cycle" ? 1 : 0);
}

function rollingTotalDays(mesocycle) {
  return Number(mesocycle.cycleLength || mesocycle.schedule?.length || 8) * rollingTotalCycles(mesocycle);
}

function rollingApproximateLength(days) {
  const weeks = Math.floor(days / 7);
  const remainder = days % 7;
  if (!weeks) return `${remainder} day${remainder === 1 ? "" : "s"}`;
  return `${weeks} week${weeks === 1 ? "" : "s"}${remainder ? ` and ${remainder} day${remainder === 1 ? "" : "s"}` : ""}`;
}

function rollingProgressDefaults() {
  return {
    cycle: 1,
    day: 0,
    completed: [],
    skipped: [],
    restCompleted: [],
    extraRestDays: [],
    rescheduled: [],
    occurrenceOverrides: [],
    needsCycleReview: false,
    needsWeekReview: false
  };
}

function blankRollingSlot(index) {
  return {
    id: crypto.randomUUID(),
    cycleDay: index + 1,
    order: index,
    dayType: "training",
    restTitle: "Rest Day",
    notes: "",
    workout: {
      id: crypto.randomUUID(),
      name: `Cycle Day ${index + 1} Workout`,
      notes: "",
      exercises: [blankMesoExercise()]
    }
  };
}

function normalizeRollingMesocycle(mesocycle) {
  mesocycle.scheduleType = "rolling";
  mesocycle.cycleLength = Math.min(21, Math.max(2, Number(mesocycle.cycleLength || mesocycle.schedule?.length || 8)));
  mesocycle.normalCycles = Math.min(20, Math.max(1, Number(mesocycle.normalCycles || 4)));
  mesocycle.deloadMode = mesocycle.deloadMode || (mesocycle.includeDeload ? "final-cycle" : "none");
  mesocycle.includeDeload = mesocycle.deloadMode === "final-cycle";
  mesocycle.notes ||= "";
  mesocycle.schedule ||= [];
  while (mesocycle.schedule.length < mesocycle.cycleLength) mesocycle.schedule.push(blankRollingSlot(mesocycle.schedule.length));
  mesocycle.schedule = mesocycle.schedule.slice(0, mesocycle.cycleLength).map((slot, index) => ({
    ...slot,
    id: slot.id || crypto.randomUUID(),
    cycleDay: index + 1,
    order: index,
    dayType: slot.dayType === "rest" ? "rest" : "training",
    restTitle: slot.restTitle || "Rest Day",
    notes: slot.notes || "",
    workout: slot.workout || blankRollingSlot(index).workout
  }));
  mesocycle.totalCycles = rollingTotalCycles(mesocycle);
  mesocycle.totalDays = rollingTotalDays(mesocycle);
  mesocycle.totalWeeks = Math.ceil(mesocycle.totalDays / 7);
  mesocycle.daysPerWeek = mesocycle.schedule.filter(slot => slot.dayType !== "rest").length;
  mesocycle.progress = { ...rollingProgressDefaults(), ...(mesocycle.progress || {}) };
  mesocycle.progress.completed ||= [];
  mesocycle.progress.skipped ||= [];
  mesocycle.progress.restCompleted ||= [];
  mesocycle.progress.extraRestDays ||= [];
  mesocycle.progress.rescheduled ||= [];
  mesocycle.progress.occurrenceOverrides ||= [];
  return mesocycle;
}

function normalizeStoredMesocycle(mesocycle) {
  if (!mesocycle) return mesocycle;
  if (!mesocycle.scheduleType) mesocycle.scheduleType = "weekly";
  if (isRollingMeso(mesocycle)) normalizeRollingMesocycle(mesocycle);
  return mesocycle;
}

ensureMesocycleData = function () {
  rollingLegacy.ensureMesocycleData();
  normalizeStoredMesocycle(data.mesocycles.active);
  data.mesocycles.drafts.forEach(normalizeStoredMesocycle);
  data.mesocycles.completed.forEach(normalizeStoredMesocycle);
};

newMesocycle = function () {
  const mesocycle = rollingLegacy.newMesocycle();
  mesocycle.scheduleType = null;
  mesocycle.cycleLength = 8;
  mesocycle.normalCycles = 4;
  mesocycle.deloadMode = "none";
  mesocycle.notes = "";
  return mesocycle;
};

function initializeSelectedScheduleType(type) {
  if (type === "rolling") {
    mesoBuilder.scheduleType = "rolling";
    mesoBuilder.cycleLength = Number(mesoBuilder.cycleLength || 8);
    mesoBuilder.normalCycles = Number(mesoBuilder.normalCycles || 4);
    mesoBuilder.deloadMode ||= "none";
    mesoBuilder.schedule = Array.from({ length: mesoBuilder.cycleLength }, (_, index) => blankRollingSlot(index));
    mesoBuilder.progress = rollingProgressDefaults();
    normalizeRollingMesocycle(mesoBuilder);
    return;
  }
  mesoBuilder.scheduleType = "weekly";
  mesoBuilder.trainingWeeks ||= 4;
  mesoBuilder.includeDeload = false;
  mesoBuilder.totalWeeks = mesoBuilder.trainingWeeks;
  mesoBuilder.daysPerWeek ||= 3;
  mesoBuilder.schedule = defaultSchedule(mesoBuilder.daysPerWeek);
  mesoBuilder.progress = { week: 1, slot: 0, completed: [], skipped: [], needsWeekReview: false };
}

openMesocycleBuilder = function (mesocycle = null) {
  mesoBuilder = structuredClone(mesocycle || newMesocycle());
  if (mesocycle) normalizeStoredMesocycle(mesoBuilder);
  if (mesocycle && isRollingMeso(mesocycle) && data.mesocycles?.active?.id === mesocycle.id) mesoBuilder._rollingEditSource = structuredClone(mesocycle.schedule);
  mesoStep = mesocycle ? 2 : 1;
  document.querySelector("#mesocycleDialogTitle").textContent = mesocycle?.sourceTemplateId ? "Build mesocycle" : mesocycle ? "Edit mesocycle" : "Create mesocycle";
  FormValidation.clearAll(document.querySelector("#mesocycleDialog"));
  FormValidation.bindLiveClear(document.querySelector("#mesocycleDialog"), { isCorrected: isMesoFieldCorrected });
  renderMesoBuilder();
  const dialog = document.querySelector("#mesocycleDialog");
  if (!dialog.open) dialog.showModal();
};

function renderScheduleTypeSelection(body) {
  body.innerHTML = `<h3>Choose Schedule Type</h3>
    <p class="small-note">Choose how this custom mesocycle should advance.</p>
    <div id="scheduleTypeChoices" class="schedule-type-grid" role="radiogroup" aria-label="Schedule type">
      <button type="button" class="schedule-type-card ${mesoBuilder.scheduleType === "weekly" ? "selected" : ""}" data-schedule-type="weekly" role="radio" aria-checked="${mesoBuilder.scheduleType === "weekly"}">
        <strong>Weekly Schedule</strong>
        <span>Assign workouts to specific weekdays and repeat the same Monday-through-Sunday structure.</span>
        <small>Workouts are tied to specific weekdays.</small>
      </button>
      <button type="button" class="schedule-type-card ${mesoBuilder.scheduleType === "rolling" ? "selected" : ""}" data-schedule-type="rolling" role="radio" aria-checked="${mesoBuilder.scheduleType === "rolling"}">
        <strong>Rolling Cycle</strong>
        <span>Build a numbered sequence of workout and rest days that continues in order regardless of the weekday.</span>
        <small>Workouts follow numbered days and continue in order regardless of the weekday.</small>
      </button>
    </div>`;
  body.querySelectorAll(".schedule-type-card").forEach(button => button.onclick = () => {
    initializeSelectedScheduleType(button.dataset.scheduleType);
    renderScheduleTypeSelection(body);
    assignMesoValidationKeys(1);
  });
}

function renderRollingBasics(body) {
  normalizeRollingMesocycle(mesoBuilder);
  body.innerHTML = `<h3>Rolling Cycle setup</h3>
    <div class="panel">
      <label>Mesocycle name<input id="mesoName" value="${escapeHtml(mesoBuilder.name || "")}" placeholder="9-Day Hypertrophy Cycle"></label>
      <div class="exercise-actions"><button type="button" class="secondary-button meso-date-choice" data-date-choice="today">Start today</button><button type="button" class="secondary-button meso-date-choice" data-date-choice="tomorrow">Start tomorrow</button></div>
      <label>Start date<input id="mesoStartDate" type="date" value="${mesoBuilder.startDate}"></label>
      <div class="form-grid">
        <label>Days in one cycle<input id="rollingCycleLength" type="number" min="2" max="21" step="1" value="${mesoBuilder.cycleLength}"></label>
        <label>How many normal cycles?<input id="rollingNormalCycles" type="number" min="1" max="20" step="1" value="${mesoBuilder.normalCycles}"></label>
      </div>
      <label>Deload option<select id="rollingDeloadMode"><option value="none" ${mesoBuilder.deloadMode === "none" ? "selected" : ""}>No deload</option><option value="final-cycle" ${mesoBuilder.deloadMode === "final-cycle" ? "selected" : ""}>Final cycle as deload</option></select></label>
      <label>Mesocycle notes<textarea id="rollingMesoNotes" placeholder="Optional notes for this training block">${escapeHtml(mesoBuilder.notes || "")}</textarea></label>
      <div id="rollingLengthPreview" class="summary-stat"></div>
      <p class="small-note">Custom deload blocks are postponed in this version to keep scheduling and saved data stable.</p>
    </div>`;
  const updatePreview = () => {
    const length = Number(document.querySelector("#rollingCycleLength").value || 0);
    const cycles = Number(document.querySelector("#rollingNormalCycles").value || 0);
    const deload = document.querySelector("#rollingDeloadMode").value === "final-cycle";
    const normalDays = length * cycles;
    const totalDays = normalDays + (deload ? length : 0);
    document.querySelector("#rollingLengthPreview").innerHTML = `<strong>Cycle length: ${length} days</strong><span>Normal training block: ${normalDays} days • ${rollingApproximateLength(normalDays)}</span><span>Total mesocycle: ${totalDays} days • ${rollingApproximateLength(totalDays)}</span>`;
  };
  ["#rollingCycleLength", "#rollingNormalCycles", "#rollingDeloadMode"].forEach(selector => document.querySelector(selector).addEventListener("input", updatePreview));
  document.querySelectorAll(".meso-date-choice").forEach(button => button.onclick = () => {
    const date = new Date();
    if (button.dataset.dateChoice === "tomorrow") date.setDate(date.getDate() + 1);
    document.querySelector("#mesoStartDate").value = date.toISOString().slice(0, 10);
  });
  updatePreview();
}

function resizeRollingSchedule(length) {
  mesoBuilder.cycleLength = Math.min(21, Math.max(2, Number(length || 8)));
  while (mesoBuilder.schedule.length < mesoBuilder.cycleLength) mesoBuilder.schedule.push(blankRollingSlot(mesoBuilder.schedule.length));
  mesoBuilder.schedule = mesoBuilder.schedule.slice(0, mesoBuilder.cycleLength);
  mesoBuilder.schedule.forEach((slot, index) => { slot.cycleDay = index + 1; slot.order = index; });
  normalizeRollingMesocycle(mesoBuilder);
}

function setRollingDayType(slot, type) {
  if (type === slot.dayType) return;
  if (type === "rest") {
    slot.trainingWorkout = structuredClone(slot.workout);
    slot.dayType = "rest";
    slot.restTitle ||= "Rest Day";
  } else {
    slot.dayType = "training";
    slot.workout = structuredClone(slot.trainingWorkout || slot.workout || blankRollingSlot(slot.order).workout);
  }
}

function renderRollingDayAssignments(body) {
  resizeRollingSchedule(mesoBuilder.cycleLength);
  body.innerHTML = `<h3>Build numbered cycle days</h3><p class="small-note">Choose whether each numbered day is a training day or a rest day. The sequence repeats without resetting on Monday.</p><div id="rollingDayAssignments" class="cycle-day-list"></div>`;
  const holder = document.querySelector("#rollingDayAssignments");
  mesoBuilder.schedule.forEach((slot, index) => {
    const card = document.createElement("section");
    card.className = "cycle-day-card";
    card.innerHTML = `<div class="workout-card-top"><div><p class="eyebrow">CYCLE DAY</p><h3>Day ${index + 1}</h3></div><span class="schedule-type-badge">${slot.dayType === "rest" ? "Rest" : "Training"}</span></div>
      <label>Day assignment<select class="rolling-day-type"><option value="training" ${slot.dayType === "training" ? "selected" : ""}>Training Day</option><option value="rest" ${slot.dayType === "rest" ? "selected" : ""}>Rest Day</option></select></label>
      ${slot.dayType === "rest" ? `<label>Rest-day title (optional)<input class="rolling-rest-title" value="${escapeHtml(slot.restTitle || "Rest Day")}" placeholder="Rest Day"></label><label>Notes (optional)<textarea class="rolling-rest-notes">${escapeHtml(slot.notes || "")}</textarea></label>` : `<p>${escapeHtml(slot.workout?.name || `Cycle Day ${index + 1} Workout`)}</p><p class="small-note">Choose the workout and exercises in the next step.</p>`}`;
    card.querySelector(".rolling-day-type").onchange = event => { setRollingDayType(slot, event.target.value); renderMesoBuilder(); };
    card.querySelector(".rolling-rest-title")?.addEventListener("input", event => slot.restTitle = event.target.value);
    card.querySelector(".rolling-rest-notes")?.addEventListener("input", event => slot.notes = event.target.value);
    holder.appendChild(card);
  });
}

function rollingCanonicalTargetMuscle(exercise, definition) {
  const name = String(exercise.name || "").toLowerCase();
  let muscle = exercise.targetMuscle || exercise.primaryMuscle || definition?.primaryMuscle || (exercise.muscle && exercise.muscle !== "Other" ? exercise.muscle : "") || inferExerciseMuscle(exercise.name);
  if (muscle === "Arms") muscle = /tricep|pushdown|skull|extension/.test(name) ? "Triceps" : "Biceps";
  if ((!muscle || muscle === "Other") && /shoulder|overhead|dumbbell press|arnold|lateral raise|front raise|rear.?delt/.test(name) && !/bench|chest|incline/.test(name)) muscle = "Shoulders";
  if (muscle === "Other" && /glute|hip thrust|kickback/.test(name)) muscle = "Glutes";
  return Object.hasOwn(EXERCISE_CATALOG, muscle) ? muscle : "";
}

function useSavedWorkoutForRollingSlot(slot, workoutId) {
  const source = data.workouts.find(workout => workout.id === workoutId);
  if (!source) return;
  slot.workout = {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    exercises: source.exercises.map(exercise => {
      const copied = copyExercise(exercise);
      const definition = allExerciseDefinitions().find(item => item.id === exercise.libraryExerciseId);
      const targetMuscle = rollingCanonicalTargetMuscle(copied, definition);
      return { ...copied, targetMuscle, primaryMuscle: targetMuscle, muscle: targetMuscle || copied.muscle || "Other" };
    })
  };
}

function renderRollingWorkouts(body) {
  body.innerHTML = `<h3>Build Rolling Cycle workouts</h3><p class="small-note">Configure each training day. Rest days remain in the numbered sequence and can be changed at any time.</p><div id="mesoWorkoutDays" class="cycle-day-list"></div>`;
  const holder = document.querySelector("#mesoWorkoutDays");
  mesoBuilder.schedule.forEach((slot, dayIndex) => {
    const card = document.createElement("section");
    card.className = "meso-workout-card cycle-day-card";
    if (slot.dayType === "rest") {
      card.innerHTML = `<div class="workout-card-top"><div><p class="eyebrow">DAY ${dayIndex + 1}</p><h3>${escapeHtml(slot.restTitle || "Rest Day")}</h3></div><span class="schedule-type-badge">Rest Day</span></div>
        <label>Rest-day title (optional)<input class="rolling-rest-title" value="${escapeHtml(slot.restTitle || "Rest Day")}" placeholder="Rest Day"></label>
        <label>Notes (optional)<textarea class="rolling-rest-notes">${escapeHtml(slot.notes || "")}</textarea></label>
        <button type="button" class="secondary-button change-to-training">Change to Training Day</button>`;
      card.querySelector(".rolling-rest-title").oninput = event => slot.restTitle = event.target.value;
      card.querySelector(".rolling-rest-notes").oninput = event => slot.notes = event.target.value;
      card.querySelector(".change-to-training").onclick = () => { setRollingDayType(slot, "training"); renderMesoBuilder(); };
      holder.appendChild(card);
      return;
    }
    const savedOptions = data.workouts.map(workout => `<option value="${escapeHtml(workout.id)}">${escapeHtml(workout.name)}</option>`).join("");
    card.innerHTML = `<div class="workout-card-top"><div><p class="eyebrow">DAY ${dayIndex + 1}</p><h3>Training Day</h3></div><span class="schedule-type-badge">Training</span></div>
      <label>Workout name<input class="rolling-workout-name" value="${escapeHtml(slot.workout.name || "")}" placeholder="Chest and Triceps"></label>
      <label>Use existing saved workout or template<select class="rolling-saved-workout"><option value="">Keep current workout</option>${savedOptions}</select></label>
      <label>Workout notes<input class="day-notes" value="${escapeHtml(slot.workout.notes || "")}" placeholder="Optional notes"></label>
      <div class="meso-exercises"></div>
      <div class="exercise-actions"><button class="secondary-button preview-meso-day" type="button">Preview workout</button><button class="secondary-button browse-meso-library" type="button">Browse Exercise Library</button><button class="secondary-button add-meso-exercise" type="button">Create Custom Exercise</button><button class="secondary-button change-to-rest" type="button">Change to Rest Day</button></div>`;
    card.querySelector(".rolling-workout-name").oninput = event => slot.workout.name = event.target.value;
    card.querySelector(".rolling-saved-workout").onchange = event => { if (event.target.value) { useSavedWorkoutForRollingSlot(slot, event.target.value); renderMesoBuilder(); } };
    card.querySelector(".day-notes").oninput = event => slot.workout.notes = event.target.value;
    card.querySelector(".add-meso-exercise").onclick = () => { slot.workout.exercises.push(blankMesoExercise()); renderMesoBuilder(); };
    card.querySelector(".browse-meso-library").onclick = () => openExerciseLibrary({ type: "mesocycle", slot });
    card.querySelector(".preview-meso-day").onclick = event => openWorkoutPreview(slot.workout, { trigger: event.currentTarget, startAction: null });
    card.querySelector(".change-to-rest").onclick = () => { setRollingDayType(slot, "rest"); renderMesoBuilder(); };
    const exerciseHolder = card.querySelector(".meso-exercises");
    slot.workout.exercises.forEach((exercise, exerciseIndex) => exerciseHolder.appendChild(mesoExerciseEditor(exercise, slot, exerciseIndex)));
    holder.appendChild(card);
  });
}

function rollingPreviewDate(mesocycle, zeroBasedDay) {
  const date = new Date(`${mesocycle.startDate}T12:00:00`);
  date.setDate(date.getDate() + zeroBasedDay);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function rollingPlannedDateValue(mesocycle, next) {
  const rescheduled = mesocycle.progress?.rescheduled?.find(item => rollingEntryMatches(item, next.cycle, next.slot));
  if (rescheduled) return rescheduled.date;
  const date = new Date(`${mesocycle.startDate}T12:00:00`);
  date.setDate(date.getDate() + (next.cycle - 1) * mesocycle.cycleLength + next.slot);
  return date.toISOString().slice(0, 10);
}

function rollingDayIsOverdue(mesocycle, next) {
  return rollingPlannedDateValue(mesocycle, next) < new Date().toISOString().slice(0, 10);
}

function renderRollingReview(body) {
  normalizeRollingMesocycle(mesoBuilder);
  const totalDays = rollingTotalDays(mesoBuilder);
  const normalDays = mesoBuilder.cycleLength * mesoBuilder.normalCycles;
  const muscleSets = {};
  mesoBuilder.schedule.filter(slot => slot.dayType === "training").forEach(slot => slot.workout.exercises.forEach(exercise => {
    const muscle = exercise.targetMuscle || exercise.primaryMuscle || exercise.muscle || "Other";
    muscleSets[muscle] = (muscleSets[muscle] || 0) + Number(exercise.sets || 0);
  }));
  body.innerHTML = `<h3>Rolling Cycle preview</h3>
    <div class="review-card"><p class="eyebrow">ROLLING CYCLE</p><h2>${escapeHtml(mesoBuilder.name)}</h2><p>Starts ${new Date(`${mesoBuilder.startDate}T12:00:00`).toLocaleDateString()} • ${mesoBuilder.cycleLength}-day cycle • ${mesoBuilder.normalCycles} normal cycles</p><p>${mesoBuilder.deloadMode === "final-cycle" ? "Final cycle uses deload prescriptions" : "No deload cycle"}</p><p><strong>${normalDays} normal cycle days</strong> • ${rollingApproximateLength(normalDays)}<br><strong>${totalDays} total calendar days</strong> • ${rollingApproximateLength(totalDays)}</p>${mesoBuilder.notes ? `<p>${escapeHtml(mesoBuilder.notes)}</p>` : ""}</div>
    <div class="review-card"><h3>Estimated sets by muscle per cycle</h3><p>${Object.entries(muscleSets).map(([muscle, sets]) => `${escapeHtml(muscle)}: ${sets}`).join(" • ") || "No training exercises configured"}</p></div>
    <div class="rolling-preview-days">${mesoBuilder.schedule.map((slot, index) => {
      if (slot.dayType === "rest") return `<details class="review-card"><summary><strong>Day ${index + 1}: ${escapeHtml(slot.restTitle || "Rest Day")}</strong><span>${rollingPreviewDate(mesoBuilder, index)}</span></summary><p>Rest Day${slot.notes ? ` • ${escapeHtml(slot.notes)}` : ""}</p></details>`;
      const totals = workoutPreviewTotals(slot.workout);
      return `<details class="review-card" ${index === 0 ? "open" : ""}><summary><strong>Day ${index + 1}: ${escapeHtml(slot.workout.name)}</strong><span>${rollingPreviewDate(mesoBuilder, index)}</span></summary><p>${totals.exerciseCount} exercises • ${totals.totalSets} working sets • approximately ${totals.estimatedMinutes} minutes</p>${slot.workout.exercises.map(exercise => `<p><strong>${escapeHtml(exercise.name)}</strong> — ${exercise.sets} sets • ${exercise.minReps}-${exercise.maxReps} ${exerciseRepLabel(exercise)} • target RIR ${exercise.targetRir}</p>`).join("")}</details>`;
    }).join("")}</div>
    <div class="review-card"><h3>Sequence preview</h3><p>Cycle Day 1: ${rollingPreviewDate(mesoBuilder, 0)}<br>Cycle Day ${mesoBuilder.cycleLength}: ${rollingPreviewDate(mesoBuilder, mesoBuilder.cycleLength - 1)}<br>Next Cycle Day 1: ${rollingPreviewDate(mesoBuilder, mesoBuilder.cycleLength)}</p></div>`;
}

function callLegacyBuilderFunction(fn, mappedStep, ...args) {
  const actualStep = mesoStep;
  mesoStep = mappedStep;
  try { return fn(...args); }
  finally { mesoStep = actualStep; }
}

renderMesoBuilder = function () {
  const totalSteps = 5;
  document.querySelector("#mesocycleStepIndicator").innerHTML = Array.from({ length: totalSteps }, (_, index) => `<div class="step-pill ${index + 1 <= mesoStep ? "active" : ""}"></div>`).join("");
  const body = document.querySelector("#mesocycleBuilderBody");
  if (mesoStep === 1) renderScheduleTypeSelection(body);
  if (mesoStep === 2) isRollingMeso(mesoBuilder) ? renderRollingBasics(body) : rollingLegacy.renderMesoBasics(body);
  if (mesoStep === 3) isRollingMeso(mesoBuilder) ? renderRollingDayAssignments(body) : rollingLegacy.renderMesoSchedule(body);
  if (mesoStep === 4) isRollingMeso(mesoBuilder) ? renderRollingWorkouts(body) : rollingLegacy.renderMesoWorkouts(body);
  if (mesoStep === 5) isRollingMeso(mesoBuilder) ? renderRollingReview(body) : rollingLegacy.renderMesoReview(body);
  assignMesoValidationKeys(mesoStep);
  const actions = document.querySelector("#mesocycleBuilderActions");
  actions.innerHTML = `${mesoStep > (mesoBuilder.sourceTemplateId ? 2 : 1) ? '<button class="secondary-button" id="mesoBack">Back</button>' : ""}
    ${mesoStep < 5 ? '<button class="primary-button" id="mesoContinue">Continue</button>' : '<button class="secondary-button" id="mesoEdit">Edit</button><button class="secondary-button" id="mesoDraft">Save draft</button><button class="primary-button" id="mesoStart">Start mesocycle</button>'}`;
  document.querySelector("#mesoBack")?.addEventListener("click", () => { captureMesoStep(); mesoStep--; renderMesoBuilder(); });
  document.querySelector("#mesoContinue")?.addEventListener("click", () => { if (saveMesoStep()) { mesoStep++; renderMesoBuilder(); } });
  document.querySelector("#mesoEdit")?.addEventListener("click", () => { mesoStep = 2; renderMesoBuilder(); });
  document.querySelector("#mesoDraft")?.addEventListener("click", saveMesocycleDraft);
  document.querySelector("#mesoStart")?.addEventListener("click", () => activateMesocycle(mesoBuilder));
};

captureMesoStep = function () {
  if (!isRollingMeso(mesoBuilder)) {
    const mappedStep = Math.max(1, mesoStep - 1);
    return callLegacyBuilderFunction(rollingLegacy.captureMesoStep, mappedStep);
  }
  if (mesoStep !== 2 || !document.querySelector("#mesoName")) return;
  mesoBuilder.name = document.querySelector("#mesoName").value.trim();
  mesoBuilder.startDate = document.querySelector("#mesoStartDate").value;
  mesoBuilder.cycleLength = Number(document.querySelector("#rollingCycleLength").value);
  mesoBuilder.normalCycles = Number(document.querySelector("#rollingNormalCycles").value);
  mesoBuilder.deloadMode = document.querySelector("#rollingDeloadMode").value;
  mesoBuilder.notes = document.querySelector("#rollingMesoNotes").value;
  resizeRollingSchedule(mesoBuilder.cycleLength);
};

assignMesoValidationKeys = function (step) {
  if (step === 1) {
    FormValidation.setKey(document.querySelector("#scheduleTypeChoices"), "scheduleType");
    return;
  }
  if (!isRollingMeso(mesoBuilder)) return callLegacyBuilderFunction(rollingLegacy.assignMesoValidationKeys, step - 1, step - 1);
  if (step === 2) {
    FormValidation.setKey(document.querySelector("#mesoName"), "mesocycle.name");
    FormValidation.setKey(document.querySelector("#mesoStartDate"), "mesocycle.startDate");
    FormValidation.setKey(document.querySelector("#rollingCycleLength"), "mesocycle.cycleLength");
    FormValidation.setKey(document.querySelector("#rollingNormalCycles"), "mesocycle.normalCycles");
    return;
  }
  if (step === 3) {
    document.querySelectorAll(".rolling-day-type").forEach((field, index) => FormValidation.setKey(field, `schedule.${index}.dayType`));
    return;
  }
  if (step !== 4) return;
  document.querySelectorAll("#mesoWorkoutDays .meso-workout-card").forEach((workoutCard, dayIndex) => {
    const slot = mesoBuilder.schedule[dayIndex];
    if (slot.dayType === "rest") return;
    FormValidation.setKey(workoutCard.querySelector(".rolling-workout-name"), `schedule.${dayIndex}.workoutName`);
    FormValidation.setKey(workoutCard.querySelector(".meso-exercises"), `schedule.${dayIndex}.exercises`);
    workoutCard.querySelectorAll(".exercise-meso-card").forEach((exerciseCard, exerciseIndex) => {
      const prefix = `schedule.${dayIndex}.exercises.${exerciseIndex}`;
      FormValidation.setKey(exerciseCard.querySelector(".exercise-target-muscle"), `${prefix}.targetMuscle`);
      FormValidation.setKey(exerciseCard.querySelector(".library-exercise-select"), `${prefix}.name`);
      FormValidation.setKey(exerciseCard.querySelector('[data-field="sets"]'), `${prefix}.sets`);
      FormValidation.setKey(exerciseCard.querySelector('[data-field="minReps"]'), `${prefix}.minReps`, [`${prefix}.maxReps`]);
      FormValidation.setKey(exerciseCard.querySelector('[data-field="maxReps"]'), `${prefix}.maxReps`);
      FormValidation.setKey(exerciseCard.querySelector('[data-field="startWeight"]'), `${prefix}.startWeight`);
      FormValidation.setKey(exerciseCard.querySelector('[data-field="targetRir"]'), `${prefix}.targetRir`);
      FormValidation.setKey(exerciseCard.querySelector('[data-field="rest"]'), `${prefix}.rest`);
      FormValidation.setKey(exerciseCard.querySelector('[data-field="increment"]'), `${prefix}.increment`);
    });
  });
};

isMesoFieldCorrected = function (field) {
  const key = field.dataset.validationKey || "";
  if (key === "scheduleType") return Boolean(mesoBuilder.scheduleType);
  if (key === "mesocycle.cycleLength") return Number(field.value) >= 2 && Number(field.value) <= 21;
  if (key === "mesocycle.normalCycles") return Number(field.value) >= 1 && Number(field.value) <= 20;
  return rollingLegacy.isMesoFieldCorrected(field);
};

function validateRollingWorkouts(mesocycle) {
  const result = FormValidation.createResult();
  const domCards = mesocycle === mesoBuilder && mesoStep === 4 ? [...document.querySelectorAll("#mesoWorkoutDays .meso-workout-card")] : [];
  mesocycle.schedule.forEach((slot, dayIndex) => {
    if (slot.dayType === "rest") return;
    const prefix = `schedule.${dayIndex}`;
    const workoutCard = domCards[dayIndex];
    const workoutName = workoutCard?.querySelector(".rolling-workout-name")?.value ?? slot.workout.name;
    FormValidation.required(result, `${prefix}.workoutName`, workoutName, `Enter a workout name for Day ${dayIndex + 1}.`);
    FormValidation.collection(result, `${prefix}.exercises`, slot.workout.exercises, { message: `Add at least one exercise to Day ${dayIndex + 1}.` });
    slot.workout.exercises.forEach((exercise, exerciseIndex) => {
      const exercisePrefix = `${prefix}.exercises.${exerciseIndex}`;
      const exerciseCard = workoutCard?.querySelectorAll(".exercise-meso-card")[exerciseIndex];
      const domValue = (selector, fallback) => exerciseCard?.querySelector(selector)?.value ?? fallback;
      const targetMuscle = domValue(".exercise-target-muscle", exercise.targetMuscle || exercise.primaryMuscle || "");
      const exerciseChoice = domValue(".library-exercise-select", exercise.name || "");
      const minReps = domValue('[data-field="minReps"]', exercise.minReps);
      const maxReps = domValue('[data-field="maxReps"]', exercise.maxReps);
      FormValidation.required(result, `${exercisePrefix}.targetMuscle`, targetMuscle, "Choose a target muscle group.");
      FormValidation.required(result, `${exercisePrefix}.name`, exerciseChoice, "Choose an exercise from the library or create a custom exercise.");
      FormValidation.number(result, `${exercisePrefix}.sets`, domValue('[data-field="sets"]', exercise.sets), { label: "Starting sets", min: 1, max: 10, integer: true });
      FormValidation.number(result, `${exercisePrefix}.minReps`, minReps, { label: "Minimum reps or seconds", min: 1, max: 600, integer: true });
      FormValidation.number(result, `${exercisePrefix}.maxReps`, maxReps, { label: "Maximum reps or seconds", min: 1, max: 600, integer: true });
      if (minReps !== "" && maxReps !== "") FormValidation.related(result, `${exercisePrefix}.maxReps`, Number(maxReps) >= Number(minReps), "Maximum reps or seconds must be greater than or equal to the minimum.");
      FormValidation.number(result, `${exercisePrefix}.startWeight`, domValue('[data-field="startWeight"]', exercise.startWeight), { label: "Starting weight", min: 0 });
      FormValidation.number(result, `${exercisePrefix}.targetRir`, domValue('[data-field="targetRir"]', exercise.targetRir), { label: "Target RIR", min: 0, max: 10, integer: true });
      FormValidation.number(result, `${exercisePrefix}.rest`, domValue('[data-field="rest"]', exercise.rest), { label: "Rest seconds", min: 0, integer: true });
      FormValidation.number(result, `${exercisePrefix}.increment`, domValue('[data-field="increment"]', exercise.increment), { label: "Weight increase", min: 0 });
    });
  });
  return result;
}

validateMesoStep = function (step, mesocycle = mesoBuilder) {
  if (step === 1) {
    const result = FormValidation.createResult();
    FormValidation.required(result, "scheduleType", mesocycle.scheduleType, "Choose Weekly Schedule or Rolling Cycle.");
    return result;
  }
  if (!isRollingMeso(mesocycle)) return callLegacyBuilderFunction(rollingLegacy.validateMesoStep, step - 1, step - 1, mesocycle);
  if (step === 2) {
    const result = FormValidation.createResult();
    const useDom = mesocycle === mesoBuilder && mesoStep === 2;
    const value = (selector, fallback) => useDom ? document.querySelector(selector)?.value ?? fallback : fallback;
    const name = value("#mesoName", mesocycle.name);
    const startDate = value("#mesoStartDate", mesocycle.startDate);
    FormValidation.required(result, "mesocycle.name", name, "Enter a mesocycle name.");
    FormValidation.required(result, "mesocycle.startDate", startDate, "Choose a start date.");
    if (startDate) FormValidation.related(result, "mesocycle.startDate", !Number.isNaN(new Date(`${startDate}T12:00:00`).getTime()), "Choose a valid start date.");
    FormValidation.number(result, "mesocycle.cycleLength", value("#rollingCycleLength", mesocycle.cycleLength), { label: "Cycle length", min: 2, max: 21, integer: true });
    FormValidation.number(result, "mesocycle.normalCycles", value("#rollingNormalCycles", mesocycle.normalCycles), { label: "Normal cycles", min: 1, max: 20, integer: true });
    return result;
  }
  if (step === 3) {
    const result = FormValidation.createResult();
    FormValidation.collection(result, "schedule", mesocycle.schedule, { min: 2, message: "Add at least two cycle days." });
    mesocycle.schedule.forEach((slot, index) => FormValidation.required(result, `schedule.${index}.dayType`, slot.dayType, `Choose Training Day or Rest Day for Day ${index + 1}.`));
    return result;
  }
  if (step === 4) return validateRollingWorkouts(mesocycle);
  return FormValidation.createResult();
};

saveMesoStep = function () {
  captureMesoStep();
  return showMesoValidation(validateMesoStep(mesoStep));
};

firstInvalidMesoStep = function (mesocycle) {
  for (const step of [1, 2, 3, 4]) {
    const result = validateMesoStep(step, mesocycle);
    if (!result.isValid) return { step, result };
  }
  return null;
};

function applyRollingFutureEditScope(mesocycle) {
  const active = data.mesocycles?.active;
  const original = mesocycle._rollingEditSource;
  if (!active || active.id !== mesocycle.id || !original) return true;
  const changedSlots = mesocycle.schedule.map((slot, index) => JSON.stringify(slot) === JSON.stringify(original[index]) ? null : index).filter(index => index != null);
  delete mesocycle._rollingEditSource;
  if (!changedSlots.length) return true;
  const answer = prompt("Apply these future Rolling Cycle edits to: 1 = This occurrence only, 2 = Remaining normal cycles, 3 = Remaining mesocycle including deload.", "3");
  if (answer == null) return false;
  const choice = String(answer).trim();
  if (!["1", "2", "3"].includes(choice)) {
    alert("Enter 1, 2, or 3 to choose how future edits should apply.");
    return false;
  }
  if (choice === "3") return true;
  const editedSchedule = structuredClone(mesocycle.schedule);
  const current = nextMesoSlot(active) || { cycle: 1 };
  mesocycle.schedule = structuredClone(original);
  mesocycle.progress = structuredClone(active.progress);
  mesocycle.progress.occurrenceOverrides ||= [];
  changedSlots.forEach(slot => mesocycle.progress.occurrenceOverrides.push({
    id: crypto.randomUUID(),
    scope: choice === "1" ? "occurrence" : "remaining-normal",
    cycle: current.cycle,
    fromCycle: current.cycle,
    slot,
    plan: editedSchedule[slot],
    createdAt: new Date().toISOString()
  }));
  return true;
}

activateMesocycle = function (mesocycle) {
  if (isRollingMeso(mesocycle)) {
    normalizeRollingMesocycle(mesocycle);
    if (!applyRollingFutureEditScope(mesocycle)) return;
  } else mesocycle.scheduleType ||= "weekly";
  return rollingLegacy.activateMesocycle(mesocycle);
};

function rollingOccurrenceOverride(mesocycle, cycle, slot) {
  const overrides = mesocycle.progress?.occurrenceOverrides || [];
  return [...overrides].reverse().find(override => {
    if (override.slot !== slot) return false;
    if (override.scope === "occurrence") return override.cycle === cycle;
    if (override.scope === "remaining-normal") return cycle >= override.fromCycle && cycle <= mesocycle.normalCycles;
    if (override.scope === "remaining-all") return cycle >= override.fromCycle;
    return false;
  });
}

function rollingPlanFor(mesocycle, cycle, slot) {
  const base = mesocycle.schedule[slot];
  const override = rollingOccurrenceOverride(mesocycle, cycle, slot);
  return override?.plan ? structuredClone(override.plan) : base;
}

function rollingEntryMatches(entry, cycle, slot) {
  return Number(entry.cycle ?? entry.week) === Number(cycle) && Number(entry.slot) === Number(slot);
}

mesoTotalWorkouts = function (mesocycle) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.mesoTotalWorkouts(mesocycle);
  return mesocycle.schedule.filter(slot => slot.dayType !== "rest").length * rollingTotalCycles(mesocycle);
};

function rollingTotalPlannedDays(mesocycle) {
  return mesocycle.schedule.length * rollingTotalCycles(mesocycle);
}

mesoDoneCount = function (mesocycle) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.mesoDoneCount(mesocycle);
  return mesocycle.progress.completed.length + mesocycle.progress.skipped.length + mesocycle.progress.restCompleted.length;
};

mesoSlotResolved = function (mesocycle, cycle, slot) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.mesoSlotResolved(mesocycle, cycle, slot);
  return mesocycle.progress.completed.some(item => rollingEntryMatches(item, cycle, slot)) ||
    mesocycle.progress.skipped.some(item => rollingEntryMatches(item, cycle, slot)) ||
    mesocycle.progress.restCompleted.some(item => rollingEntryMatches(item, cycle, slot));
};

nextMesoSlot = function (mesocycle) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.nextMesoSlot(mesocycle);
  normalizeRollingMesocycle(mesocycle);
  for (let cycle = 1; cycle <= rollingTotalCycles(mesocycle); cycle++) {
    for (let slot = 0; slot < mesocycle.schedule.length; slot++) {
      if (!mesoSlotResolved(mesocycle, cycle, slot)) {
        const plan = rollingPlanFor(mesocycle, cycle, slot);
        return { cycle, week: cycle, slot, day: slot + 1, plan, phase: cycle > mesocycle.normalCycles ? "deload" : "normal" };
      }
    }
  }
  return null;
};

currentMesoPosition = function (mesocycle) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.currentMesoPosition(mesocycle);
  const next = nextMesoSlot(mesocycle);
  return next ? { cycle: next.cycle, week: next.cycle, day: next.day, slot: next.slot, phase: next.phase } : { cycle: rollingTotalCycles(mesocycle) + 1, week: rollingTotalCycles(mesocycle) + 1, day: 1, slot: 0, phase: "complete" };
};

isDeloadWeek = function (mesocycle, period) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.isDeloadWeek(mesocycle, period);
  return mesocycle.deloadMode === "final-cycle" && Number(period) > Number(mesocycle.normalCycles);
};

function rollingContext(mesocycle, next) {
  return {
    mesocycleId: mesocycle.id,
    scheduleType: "rolling",
    cycle: next.cycle,
    week: next.cycle,
    cycleDay: next.day,
    cycleLength: mesocycle.cycleLength,
    phase: next.phase,
    slot: next.slot,
    plannedWorkoutId: next.plan.workout?.id || null
  };
}

workoutForMesoSlot = function (mesocycle, next, persist = true) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.workoutForMesoSlot(mesocycle, next, persist);
  if (next.plan.dayType === "rest") return null;
  let workout = structuredClone(next.plan.workout);
  if (isDeloadWeek(mesocycle, next.cycle)) {
    workout.id = `${workout.id}-deload-${mesocycle.id}`;
    workout.name = `Deload — ${workout.name}`;
    workout.exercises = workout.exercises.map(exercise => ({
      ...exercise,
      id: `${exercise.id}-deload`,
      sets: Math.max(1, Math.ceil(Number(exercise.sets) / 2)),
      startWeight: Math.max(0, Math.round(Number(exercise.startWeight || 0) * .85 / 2.5) * 2.5),
      targetRir: Math.max(4, Number(exercise.targetRir ?? 3))
    }));
  }
  if (persist) ensureWorkoutTemplate(workout);
  return workout;
};

previewNextMesoWorkout = function (mesocycle, trigger) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.previewNextMesoWorkout(mesocycle, trigger);
  const next = nextMesoSlot(mesocycle);
  if (!next || next.plan.dayType === "rest") return;
  const workout = workoutForMesoSlot(mesocycle, next, false);
  const deload = isDeloadWeek(mesocycle, next.cycle);
  openWorkoutPreview(workout, {
    trigger,
    originalWorkout: deload ? next.plan.workout : null,
    adjustmentReason: deload ? "Deload cycle: sets and load are reduced and target RIR is increased." : `Rolling Cycle ${next.cycle}, Day ${next.day} prescription.`,
    context: rollingContext(mesocycle, next),
    startAction: () => startNextMesoWorkout(mesocycle)
  });
};

startNextMesoWorkout = function (mesocycle) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.startNextMesoWorkout(mesocycle);
  const next = nextMesoSlot(mesocycle);
  if (!next || next.plan.dayType === "rest" || mesocycle.progress.needsCycleReview) return;
  const workout = workoutForMesoSlot(mesocycle, next);
  startWorkout(workout.id, rollingContext(mesocycle, next));
};

function rollingHistoryEntry(mesocycle, next, type, title, status, details = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    date: new Date().toISOString(),
    workoutName: title,
    exercises: [],
    scheduleStatus: status,
    ...details,
    mesocycle: rollingContext(mesocycle, next)
  };
}

function completeRollingRestDay(mesocycle, status = "completed") {
  const next = nextMesoSlot(mesocycle);
  if (!next || next.plan.dayType !== "rest") return;
  mesocycle.progress.restCompleted.push({ cycle: next.cycle, week: next.cycle, slot: next.slot, day: next.day, date: new Date().toISOString(), status, title: next.plan.restTitle || "Rest Day" });
  data.history.unshift(rollingHistoryEntry(mesocycle, next, "rest-day", next.plan.restTitle || "Rest Day", status));
  afterMesoAdvance(mesocycle, next.cycle);
  saveData();
}

function moveToNextRollingDayEarly(mesocycle) {
  const next = nextMesoSlot(mesocycle);
  if (!next) return;
  if (next.plan.dayType === "rest") {
    if (confirm(`Complete Cycle Day ${next.day} early and move to the next cycle day?`)) completeRollingRestDay(mesocycle, "early-advancement");
    return;
  }
  if (confirm(`Skip Cycle Day ${next.day} and advance? The skipped training day will remain in history.`)) skipNextMeso(mesocycle, "Manual cycle-day advancement");
}

function addRollingExtraRestDay(mesocycle) {
  const next = nextMesoSlot(mesocycle);
  if (!next) return;
  const entry = { cycle: next.cycle, week: next.cycle, slot: next.slot, day: next.day, date: new Date().toISOString(), nextTitle: next.plan.dayType === "rest" ? next.plan.restTitle || "Rest Day" : next.plan.workout.name };
  mesocycle.progress.extraRestDays.push(entry);
  data.history.unshift(rollingHistoryEntry(mesocycle, next, "extra-rest-day", "Extra Rest Day", "completed", { nextPlannedItem: entry.nextTitle }));
  saveData();
}

function rollingSkipReason() {
  const answer = prompt("Optional skip reason: Schedule conflict, Illness, Recovery, Travel, Equipment unavailable, Other, or leave blank.", "");
  return answer == null ? null : answer.trim();
}

skipNextMeso = function (mesocycle, suppliedReason = null) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.skipNextMeso(mesocycle);
  const next = nextMesoSlot(mesocycle);
  if (!next) return;
  if (next.plan.dayType === "rest") return completeRollingRestDay(mesocycle, "skipped-rest");
  if (!suppliedReason && !confirm(`Skip Cycle ${next.cycle}, Day ${next.day}: ${next.plan.workout.name}?`)) return;
  const reason = suppliedReason || rollingSkipReason();
  if (reason == null) return;
  mesocycle.progress.skipped.push({ cycle: next.cycle, week: next.cycle, slot: next.slot, day: next.day, date: new Date().toISOString(), workoutName: next.plan.workout.name, reason });
  data.history.unshift(rollingHistoryEntry(mesocycle, next, "skipped-workout", next.plan.workout.name, "skipped", { skipReason: reason }));
  afterMesoAdvance(mesocycle, next.cycle);
  saveData();
};

function keepRollingDayAsNext() {
  alert("This cycle day will remain next until you complete, skip, or explicitly advance it.");
}

function rescheduleRollingDay(mesocycle) {
  const next = nextMesoSlot(mesocycle);
  if (!next) return;
  const selected = prompt("Enter the chosen date in YYYY-MM-DD format.", new Date().toISOString().slice(0, 10));
  if (selected == null) return;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(selected) && !Number.isNaN(new Date(`${selected}T12:00:00`).getTime());
  if (!valid) return alert("Enter a valid date in YYYY-MM-DD format.");
  mesocycle.progress.rescheduled = mesocycle.progress.rescheduled.filter(item => !rollingEntryMatches(item, next.cycle, next.slot));
  mesocycle.progress.rescheduled.push({ cycle: next.cycle, week: next.cycle, slot: next.slot, day: next.day, date: selected });
  saveData();
}

rescheduleNextMeso = function (mesocycle) {
  if (isRollingMeso(mesocycle)) return rescheduleRollingDay(mesocycle);
  return rollingLegacy.rescheduleNextMeso(mesocycle);
};

moveMesoForward = function (mesocycle) {
  if (isRollingMeso(mesocycle)) return addRollingExtraRestDay(mesocycle);
  return rollingLegacy.moveMesoForward(mesocycle);
};

afterMesoAdvance = function (mesocycle, oldPeriod) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.afterMesoAdvance(mesocycle, oldPeriod);
  const next = nextMesoSlot(mesocycle);
  const completedNormalCycle = Number(oldPeriod) <= mesocycle.normalCycles && (!next || next.cycle > Number(oldPeriod));
  if (completedNormalCycle) {
    mesocycle.progress.needsCycleReview = true;
    mesocycle.progress.reviewCycle = Number(oldPeriod);
  }
};

function beginNextRollingCycle(mesocycle) {
  mesocycle.progress.needsCycleReview = false;
  mesocycle.progress.reviewCycle = null;
  saveData();
}

repeatPreviousMesoWeek = function (mesocycle) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.repeatPreviousMesoWeek(mesocycle);
  const cycle = Number(mesocycle.progress.reviewCycle || Math.max(1, currentMesoPosition(mesocycle).cycle - 1));
  mesocycle.progress.completed = mesocycle.progress.completed.filter(item => Number(item.cycle ?? item.week) !== cycle);
  mesocycle.progress.skipped = mesocycle.progress.skipped.filter(item => Number(item.cycle ?? item.week) !== cycle);
  mesocycle.progress.restCompleted = mesocycle.progress.restCompleted.filter(item => Number(item.cycle ?? item.week) !== cycle);
  mesocycle.progress.needsCycleReview = false;
  mesocycle.progress.reviewCycle = null;
  saveData();
};

onMesocycleWorkoutFinished = function (session) {
  if (session.mesocycle?.scheduleType !== "rolling") return rollingLegacy.onMesocycleWorkoutFinished(session);
  const mesocycle = data.mesocycles.active;
  const reference = session.mesocycle;
  if (!mesocycle || mesocycle.id !== reference.mesocycleId) return;
  if (!mesocycle.progress.completed.some(item => rollingEntryMatches(item, reference.cycle, reference.slot))) {
    mesocycle.progress.completed.push({ cycle: reference.cycle, week: reference.cycle, slot: reference.slot, day: reference.cycleDay, phase: reference.phase, date: session.date, sessionDate: session.date, workoutName: session.workoutName });
  }
  afterMesoAdvance(mesocycle, reference.cycle);
};

function cycleReviewMarkup(mesocycle) {
  const cycle = Number(mesocycle.progress.reviewCycle || 1);
  const isFinalCycle = cycle >= rollingTotalCycles(mesocycle);
  const nextCycleLabel = cycle >= mesocycle.normalCycles && mesocycle.deloadMode === "final-cycle" ? "Begin Deload Cycle" : "Begin Next Cycle";
  const sessions = data.history.filter(entry => entry.mesocycle?.mesocycleId === mesocycle.id && Number(entry.mesocycle.cycle ?? entry.mesocycle.week) === cycle);
  const workouts = sessions.filter(entry => !["rest-day", "extra-rest-day", "skipped-workout"].includes(entry.type));
  const skipped = mesocycle.progress.skipped.filter(item => Number(item.cycle ?? item.week) === cycle);
  const rests = mesocycle.progress.restCompleted.filter(item => Number(item.cycle ?? item.week) === cycle);
  const extraRests = mesocycle.progress.extraRestDays.filter(item => Number(item.cycle ?? item.week) === cycle);
  const sets = workouts.reduce((sum, session) => sum + (session.exercises || []).reduce((exerciseSum, exercise) => exerciseSum + (exercise.sets || []).filter(set => set.done).length, 0), 0);
  const soreness = workouts.flatMap(session => Object.entries(session.soreness?.ratings || {}).filter(([, rating]) => rating >= 2).map(([muscle, rating]) => `${sorenessLabel(muscle)}: ${rating === 3 ? "I can barely move" : "I still feel it"}`));
  const pain = workouts.flatMap(session => (session.exercises || []).filter(exercise => Number(exercise.jointPain?.rating) >= 3).map(exercise => `${exercise.name}: ${exercise.jointPain.rating}/5 (${(exercise.jointPain.joints || []).join(", ")})`));
  const primaryAction = isFinalCycle
    ? '<button id="completeMesoFromReview" class="primary-button">Complete Mesocycle</button>'
    : `<button id="beginMesoCycle" class="primary-button">${nextCycleLabel}</button>`;
  return `<div class="review-card"><p class="eyebrow">CYCLE REVIEW</p><h3>Cycle ${cycle} complete</h3><p>${workouts.length} workouts completed • ${skipped.length} skipped • ${rests.length} rest days completed • ${extraRests.length} extra rest days • ${sets} working sets</p><div class="prescription-change"><h3>Soreness adjustments</h3><p>${soreness.map(escapeHtml).join(" • ") || "No significant soreness adjustments recorded."}</p></div><div class="prescription-change"><h3>Joint-pain flags</h3><p>${pain.map(escapeHtml).join(" • ") || "No joint-pain ratings of 3 or higher."}</p></div><div class="prescription-change"><h3>Exercise progression</h3><p>${isFinalCycle ? "Review the final progression and pain flags before completing this mesocycle." : "Next-occurrence weight and repetition recommendations are ready for the next cycle. Review any pain flags before approving substitutions."}</p></div><div class="exercise-actions">${primaryAction}<button id="editFutureMeso" class="secondary-button">Edit Future Cycle</button><button id="repeatMesoCycle" class="secondary-button">Repeat Current Cycle</button><button id="endMeso" class="danger-button">End Mesocycle</button></div></div>`;
}

activeMesocycleMarkup = function (mesocycle) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.activeMesocycleMarkup(mesocycle);
  normalizeRollingMesocycle(mesocycle);
  const next = nextMesoSlot(mesocycle);
  const done = mesoDoneCount(mesocycle);
  const total = rollingTotalPlannedDays(mesocycle);
  const percentage = Math.min(100, Math.round(done / Math.max(1, total) * 100));
  const paused = savedWorkoutInProgress();
  if (mesocycle.progress.needsCycleReview) return `<div class="mesocycle-card"><p class="eyebrow">ROLLING CYCLE</p><h2>${escapeHtml(mesocycle.name)}</h2><div class="progress-track"><div class="progress-fill" style="width:${percentage}%"></div></div>${cycleReviewMarkup(mesocycle)}</div>`;
  if (!next) return `<div class="mesocycle-card"><p class="eyebrow">ROLLING CYCLE • READY TO COMPLETE</p><h2>${escapeHtml(mesocycle.name)}</h2><p>${done} of ${total} numbered cycle days resolved.</p><div class="progress-track"><div class="progress-fill" style="width:100%"></div></div><button id="completeMeso" class="primary-button">View summary and complete</button></div>`;
  const totalCycles = rollingTotalCycles(mesocycle);
  const phase = next.phase === "deload" ? "Deload Cycle" : `Cycle ${next.cycle} of ${mesocycle.normalCycles}`;
  const title = next.plan.dayType === "rest" ? next.plan.restTitle || "Rest Day" : next.plan.workout.name;
  const rescheduled = mesocycle.progress.rescheduled.find(item => rollingEntryMatches(item, next.cycle, next.slot));
  const mainAction = paused ? '<button id="startNextMeso" class="primary-button">Resume workout</button>' : next.plan.dayType === "rest" ? '<button id="completeRollingRest" class="primary-button">Complete Rest Day</button>' : `<button id="startNextMeso" class="primary-button">${rollingDayIsOverdue(mesocycle, next) ? "Complete It Today" : "Start Workout"}</button>`;
  return `<div class="mesocycle-card"><p class="eyebrow">ACTIVE MESOCYCLE • ROLLING CYCLE</p><h2>${escapeHtml(mesocycle.name)}</h2><p>${phase} • Day ${next.day} of ${mesocycle.cycleLength}</p><div class="progress-track"><div class="progress-fill" style="width:${percentage}%"></div></div><p>${done} cycle days resolved • ${total - done} remaining</p><h3>Next: ${escapeHtml(title)}</h3>${rescheduled ? `<p class="small-note">Chosen date: ${new Date(`${rescheduled.date}T12:00:00`).toLocaleDateString()}</p>` : ""}${mainAction}<div class="card-actions mesocycle-actions" aria-label="Rolling Cycle actions">${next.plan.dayType === "training" ? '<button id="previewNextMeso" class="secondary-button">Preview Workout</button><button id="keepRollingNext" class="secondary-button">Keep It as Next</button><button id="skipMesoWorkout" class="secondary-button">Skip This Cycle Day</button><button id="rescheduleMesoWorkout" class="secondary-button">Reschedule to a Chosen Date</button>' : '<button id="advanceRollingEarly" class="secondary-button">Move to Next Cycle Day Early</button>'}<button id="addRollingRest" class="secondary-button">Add Extra Rest Day</button><button id="viewMeso" class="secondary-button">View Cycle</button><button id="editFutureMeso" class="secondary-button">Edit Future Cycle</button><button id="draftActiveMeso" class="secondary-button">Return to Draft</button><button id="endMeso" class="danger-button">End Mesocycle</button></div></div>`;
};

wireActiveMesoButtons = function (active) {
  if (!active || !isRollingMeso(active)) return rollingLegacy.wireActiveMesoButtons(active);
  document.querySelector("#startNextMeso")?.addEventListener("click", () => { const paused = savedWorkoutInProgress(); if (paused) resumeSavedWorkout(); else startNextMesoWorkout(active); });
  document.querySelector("#completeRollingRest")?.addEventListener("click", () => completeRollingRestDay(active));
  document.querySelector("#advanceRollingEarly")?.addEventListener("click", () => moveToNextRollingDayEarly(active));
  document.querySelector("#addRollingRest")?.addEventListener("click", () => addRollingExtraRestDay(active));
  document.querySelector("#keepRollingNext")?.addEventListener("click", keepRollingDayAsNext);
  document.querySelector("#previewNextMeso")?.addEventListener("click", event => previewNextMesoWorkout(active, event.currentTarget));
  document.querySelector("#viewMeso")?.addEventListener("click", () => openMesocyclePreview(active));
  document.querySelector("#editFutureMeso")?.addEventListener("click", () => openMesocycleBuilder(active));
  document.querySelector("#rescheduleMesoWorkout")?.addEventListener("click", () => rescheduleRollingDay(active));
  document.querySelector("#skipMesoWorkout")?.addEventListener("click", () => skipNextMeso(active));
  document.querySelector("#draftActiveMeso")?.addEventListener("click", () => returnMesoToDraft(active));
  document.querySelector("#endMeso")?.addEventListener("click", () => endMesocycle(active));
  document.querySelector("#beginMesoCycle")?.addEventListener("click", () => beginNextRollingCycle(active));
  document.querySelector("#completeMesoFromReview")?.addEventListener("click", () => {
    active.progress.needsCycleReview = false;
    active.progress.reviewCycle = null;
    completeMesocycle(active);
  });
  document.querySelector("#repeatMesoCycle")?.addEventListener("click", () => repeatPreviousMesoWeek(active));
  document.querySelector("#completeMeso")?.addEventListener("click", () => completeMesocycle(active));
};

renderMesoCollection = function (selector, items, type) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.innerHTML = items.length ? "" : `<div class="panel"><p>No ${type} mesocycles.</p></div>`;
  items.forEach(mesocycle => {
    normalizeStoredMesocycle(mesocycle);
    if (!isRollingMeso(mesocycle)) {
      const holder = document.createElement("div");
      element.appendChild(holder);
      const originalSelectorId = holder.id = `weekly-meso-${crypto.randomUUID()}`;
      rollingLegacy.renderMesoCollection(`#${originalSelectorId}`, [mesocycle], type);
      return;
    }
    const card = document.createElement("article");
    card.className = "mesocycle-card";
    const next = nextMesoSlot(mesocycle);
    const deloadText = mesocycle.deloadMode === "final-cycle" ? "Final deload cycle" : "No deload";
    card.innerHTML = `<p class="eyebrow">ROLLING CYCLE</p><h3>${escapeHtml(mesocycle.name)}</h3><p>${mesocycle.cycleLength}-day cycle • ${mesocycle.normalCycles} normal cycles • ${deloadText} • ${rollingTotalDays(mesocycle)} total days</p>${type === "active" && next ? `<p>Cycle ${next.cycle} • Day ${next.day} of ${mesocycle.cycleLength}</p>` : ""}<div class="card-actions workout-card-actions horizontal-scroll-row"><button class="secondary-button preview">Preview</button><button class="secondary-button open">${type === "draft" ? "Continue Editing" : "View"}</button><button class="secondary-button duplicate">Duplicate</button>${type === "draft" ? '<button class="primary-button start">Start Mesocycle</button><button class="danger-button delete">Delete</button>' : ""}</div>`;
    card.querySelector(".preview").onclick = () => openMesocyclePreview(mesocycle);
    card.querySelector(".open").onclick = () => openMesocycleBuilder(mesocycle);
    card.querySelector(".duplicate").onclick = () => duplicateMesocycle(mesocycle);
    card.querySelector(".start")?.addEventListener("click", () => activateMesocycle(mesocycle));
    card.querySelector(".delete")?.addEventListener("click", () => deleteMesocycleDraft(mesocycle));
    element.appendChild(card);
  });
};

openMesocyclePreview = function (mesocycle) {
  mesoBuilder = structuredClone(mesocycle);
  normalizeStoredMesocycle(mesoBuilder);
  mesoStep = 5;
  document.querySelector("#mesocycleDialogTitle").textContent = "Preview mesocycle";
  renderMesoBuilder();
  const dialog = document.querySelector("#mesocycleDialog");
  if (!dialog.open) dialog.showModal();
};

buildMesoSummary = function (mesocycle) {
  if (!isRollingMeso(mesocycle)) return rollingLegacy.buildMesoSummary(mesocycle);
  const base = rollingLegacy.buildMesoSummary(mesocycle);
  const sessions = data.history.filter(entry => entry.mesocycle?.mesocycleId === mesocycle.id);
  const workoutSessions = sessions.filter(entry => !entry.type || entry.type === "workout");
  const personalRecords = workoutSessions.reduce((count, session) => count + (session.exercises || []).filter(exercise => exercise.personalRecord).length, 0);
  return {
    ...base,
    scheduleType: "rolling",
    cycleLength: mesocycle.cycleLength,
    normalCyclesPlanned: mesocycle.normalCycles,
    normalCyclesCompleted: Math.min(mesocycle.normalCycles, Math.max(0, currentMesoPosition(mesocycle).cycle - 1)),
    deloadCycleCompleted: mesocycle.deloadMode === "final-cycle" && !nextMesoSlot(mesocycle),
    totalCalendarDays: rollingTotalDays(mesocycle),
    planned: mesoTotalWorkouts(mesocycle),
    completed: mesocycle.progress.completed.length,
    skipped: mesocycle.progress.skipped.length,
    restDaysCompleted: mesocycle.progress.restCompleted.length,
    extraRestDays: mesocycle.progress.extraRestDays.length,
    personalRecords,
    percentage: Math.round(mesocycle.progress.completed.length / Math.max(1, mesoTotalWorkouts(mesocycle)) * 100)
  };
};

duplicateMesocycle = function (source) {
  if (!isRollingMeso(source)) return rollingLegacy.duplicateMesocycle(source);
  const copy = structuredClone(source);
  copy.id = crypto.randomUUID();
  copy.name = `${source.name} Copy`;
  copy.status = "draft";
  copy.startDate = new Date().toISOString().slice(0, 10);
  copy.progress = rollingProgressDefaults();
  copy.schedule.forEach((slot, index) => {
    slot.id = crypto.randomUUID();
    slot.cycleDay = index + 1;
    if (slot.workout) {
      slot.workout.id = crypto.randomUUID();
      slot.workout.exercises = slot.workout.exercises.map(exercise => {
        const prior = latestExerciseResult(exercise.id);
        return { ...exercise, id: crypto.randomUUID(), startWeight: prior ? recommendationFor(exercise).weight : exercise.startWeight };
      });
    }
  });
  normalizeRollingMesocycle(copy);
  data.mesocycles.drafts.unshift(copy);
  saveData();
  openMesocycleBuilder(copy);
};

renderMesocycleToday = function () {
  const mesocycle = data.mesocycles?.active;
  if (!isRollingMeso(mesocycle)) return rollingLegacy.renderMesocycleToday();
  const button = document.querySelector("#startWorkoutButton");
  const previewButton = document.querySelector("#previewTodayWorkoutButton");
  const hero = document.querySelector("#homeView .hero-card");
  const paused = savedWorkoutInProgress();
  if (paused) {
    const completed = paused.exercises.reduce((sum, exercise) => sum + exercise.sets.filter(set => set.done).length, 0);
    const total = paused.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    hero.querySelector(".eyebrow").textContent = "WORKOUT IN PROGRESS • ROLLING CYCLE";
    document.querySelector("#todayWorkoutName").textContent = paused.workoutName;
    document.querySelector("#todayWorkoutSummary").textContent = `${completed} of ${total} working sets completed • Cycle ${paused.mesocycle?.cycle || paused.mesocycle?.week}, Day ${paused.mesocycle?.cycleDay || Number(paused.mesocycle?.slot) + 1}`;
    button.textContent = "Resume workout";
    button.onclick = resumeSavedWorkout;
    previewButton.classList.add("hidden");
    return;
  }
  const next = nextMesoSlot(mesocycle);
  if (mesocycle.progress.needsCycleReview) {
    const isFinalCycle = Number(mesocycle.progress.reviewCycle || 1) >= rollingTotalCycles(mesocycle);
    hero.querySelector(".eyebrow").textContent = `${mesocycle.name.toUpperCase()} • ROLLING CYCLE`;
    document.querySelector("#todayWorkoutName").textContent = `Cycle ${mesocycle.progress.reviewCycle} Review`;
    document.querySelector("#todayWorkoutSummary").textContent = isFinalCycle ? "Review the final completed cycle before finishing the mesocycle." : "Review the completed cycle before beginning the next cycle.";
    button.textContent = "Open Cycle Review";
    button.onclick = () => document.querySelector('[data-view="programsView"]').click();
    previewButton.classList.add("hidden");
    return;
  }
  if (!next) {
    hero.querySelector(".eyebrow").textContent = "ROLLING CYCLE COMPLETE";
    document.querySelector("#todayWorkoutName").textContent = mesocycle.name;
    document.querySelector("#todayWorkoutSummary").textContent = "All numbered cycle days are complete. Open Build to review the mesocycle summary.";
    button.textContent = "Open Build";
    button.onclick = () => document.querySelector('[data-view="programsView"]').click();
    previewButton.classList.add("hidden");
    return;
  }
  const phase = next.phase === "deload" ? "DELOAD CYCLE" : `CYCLE ${next.cycle} OF ${mesocycle.normalCycles}`;
  hero.querySelector(".eyebrow").textContent = `${mesocycle.name.toUpperCase()} • ROLLING CYCLE • ${phase}`;
  if (next.plan.dayType === "rest") {
    document.querySelector("#todayWorkoutName").textContent = next.plan.restTitle || "Rest Day";
    document.querySelector("#todayWorkoutSummary").textContent = `Cycle Day ${next.day} of ${mesocycle.cycleLength} • The next numbered day advances only when you complete or explicitly advance this rest day.`;
    button.textContent = "Complete Rest Day";
    button.onclick = () => completeRollingRestDay(mesocycle);
    previewButton.classList.add("hidden");
    return;
  }
  document.querySelector("#todayWorkoutName").textContent = next.plan.workout.name;
  document.querySelector("#todayWorkoutSummary").textContent = `Cycle ${next.cycle} • Day ${next.day} of ${mesocycle.cycleLength} • ${next.plan.workout.exercises.length} exercises`;
  button.textContent = rollingDayIsOverdue(mesocycle, next) ? "Complete It Today" : "Start Workout";
  button.onclick = () => startNextMesoWorkout(mesocycle);
  previewButton.classList.remove("hidden");
  previewButton.onclick = event => previewNextMesoWorkout(mesocycle, event.currentTarget);
};

rollingLegacy.dashboardWorkoutContext = dashboardWorkoutContext;
dashboardWorkoutContext = function () {
  const paused = dashboardSavedSession();
  if (paused) return { workout: paused, paused, context: paused.mesocycle || null };
  const mesocycle = data.mesocycles?.active;
  if (!isRollingMeso(mesocycle)) return rollingLegacy.dashboardWorkoutContext();
  const next = nextMesoSlot(mesocycle);
  if (!next) return { workout: null, paused: null, context: null };
  return { workout: next.plan.dayType === "rest" ? null : next.plan.workout, paused: null, context: rollingContext(mesocycle, next) };
};

renderTodayDashboard = function () {
  const active = data.mesocycles?.active;
  if (!isRollingMeso(active)) return rollingLegacy.renderTodayDashboard();
  const { workout, paused, context } = dashboardWorkoutContext();
  const exercises = workout?.exercises || [];
  const completedSets = paused ? exercises.reduce((sum, exercise) => sum + (exercise.sets || []).filter(set => set.done).length, 0) : 0;
  const totalSets = exercises.reduce((sum, exercise) => sum + (paused ? (exercise.sets || []).length : Number(exercise.sets || 0)), 0);
  const progressValue = document.querySelector("#todayProgressValue");
  const progressSegments = document.querySelector("#todayProgressSegments");
  progressValue.textContent = `${completedSets} / ${totalSets} SETS`;
  progressSegments.innerHTML = Array.from({ length: Math.max(1, totalSets) }, (_, index) => `<span class="${index < completedSets ? "complete" : ""}"></span>`).join("");
  progressSegments.setAttribute("aria-label", `${completedSets} of ${totalSets} working sets completed`);
  progressSegments.setAttribute("aria-valuemax", String(totalSets));
  progressSegments.setAttribute("aria-valuenow", String(completedSets));
  const elapsedMetric = document.querySelector("#todayElapsedMetric");
  elapsedMetric.classList.toggle("hidden", !paused);
  if (paused) {
    const elapsed = Number(paused.elapsedMs) || Math.max(0, Date.now() - new Date(paused.startTime || paused.date).getTime());
    document.querySelector("#todayElapsedValue").textContent = typeof formatElapsed === "function" ? formatElapsed(elapsed) : `${Math.floor(elapsed / 60000)}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, "0")}`;
  }
  const next = nextMesoSlot(active);
  const cycle = context?.cycle || next?.cycle || active.progress.reviewCycle || active.normalCycles;
  document.querySelector("#todayMesoMeta").textContent = `${active.name} | ROLLING CYCLE | ${isDeloadWeek(active, cycle) ? "DELOAD" : `CYCLE ${cycle}`}`;
  const strip = document.querySelector("#todayWeekStrip");
  const summary = document.querySelector("#weekDashboardSummary");
  const completed = active.progress.completed.filter(item => Number(item.cycle ?? item.week) === cycle).length;
  const skipped = active.progress.skipped.filter(item => Number(item.cycle ?? item.week) === cycle).length;
  const rested = active.progress.restCompleted.filter(item => Number(item.cycle ?? item.week) === cycle).length;
  summary.textContent = `${completed} workouts completed${skipped ? ` | ${skipped} skipped` : ""} | ${rested} rest days | Cycle ${cycle}${cycle <= active.normalCycles ? ` of ${active.normalCycles}` : " deload"}`;
  strip.innerHTML = active.schedule.map((baseSlot, index) => {
    const slot = rollingPlanFor(active, cycle, index);
    const done = active.progress.completed.some(item => rollingEntryMatches(item, cycle, index)) || active.progress.restCompleted.some(item => rollingEntryMatches(item, cycle, index));
    const missed = active.progress.skipped.some(item => rollingEntryMatches(item, cycle, index));
    const current = next?.cycle === cycle && next?.slot === index && !done && !missed;
    const state = done ? "completed" : missed ? "skipped" : current ? "current" : "planned";
    const status = done ? "DONE" : missed ? "SKIP" : current ? "NOW" : slot.dayType === "rest" ? "REST" : "NEXT";
    const title = slot.dayType === "rest" ? slot.restTitle || "Rest Day" : slot.workout.name;
    return `<div class="week-day ${state}" aria-label="Cycle Day ${index + 1}: ${escapeHtml(title)}, ${state}"><span>DAY</span><strong>${index + 1}</strong><i aria-hidden="true">${status}</i></div>`;
  }).join("");
  const recovery = document.querySelector("#todayRecoverySummary");
  const definitions = exercises.map(dashboardExerciseDefinition);
  const muscles = workout ? workoutMuscles({ exercises: definitions }) : [];
  const ratings = paused?.soreness?.ratings || {};
  recovery.innerHTML = muscles.length ? muscles.map(muscle => { const state = dashboardRecoveryState(ratings[muscle]); return `<div class="dashboard-row"><span class="muscle-mark" aria-hidden="true"></span><div><strong>${escapeHtml(sorenessLabel(muscle))}</strong><small>${escapeHtml(state.note)}</small></div><b class="status-chip ${state.className}">${state.label}</b></div>`; }).join("") : '<p class="dashboard-empty">Rest day or no training workout selected.</p>';
  const recent = dashboardRecentExerciseResults();
  document.querySelector("#recentExerciseProgress").innerHTML = recent.length ? recent.map(result => `<div class="dashboard-row"><span class="performance-mark" aria-hidden="true">◆</span><div><strong>${escapeHtml(result.name)}</strong><small>${new Date(result.date).toLocaleDateString()}</small></div><b class="performance-value">${displayWeightValue(result.weight, data.profile?.units)} ${weightUnit(data.profile?.units)}<small>${result.reps} reps</small></b></div>`).join("") : '<p class="dashboard-empty">Complete a workout to begin building recent progress.</p>';
};

ensureMesocycleData();
renderAll();
restoreNavigationState();
