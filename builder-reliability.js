"use strict";

const MESO_BUILDER_VERSION = 2;
const MESO_AUTOSAVE_DELAY = 750;
const builderReliabilityLegacy = {
  openMesocycleBuilder,
  renderMesoBuilder,
  saveMesocycleDraft,
  activateMesocycle,
  renderMesoCollection,
  mesoExerciseEditor,
  openExerciseLibrary,
  closeExerciseLibrary,
  addExerciseFromLibrary,
  openExercisePreview,
  closeExercisePreview,
  openWorkoutPreview,
  closeWorkoutPreview
};

let mesoAutosaveTimer = null;
let mesoAutosaveEnabled = false;
let mesoLastSavedFingerprint = "";
let mesoDraftWasStored = false;
let mesoRestoreState = null;
const builderOverlayStack = [];

function mesoDialogCard() {
  return document.querySelector("#mesocycleDialog .mesocycle-dialog");
}

function mesoSaveStatus(message, state = "saved") {
  const status = document.querySelector("#mesocycleSaveStatus");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

function mesoDraftFingerprint(mesocycle = mesoBuilder) {
  if (!mesocycle) return "";
  const copy = structuredClone(mesocycle);
  delete copy.updatedAt;
  delete copy.uiRecoveryState;
  copy.builderStep = Number(mesoStep || copy.builderStep || 1);
  copy.builderVersion = MESO_BUILDER_VERSION;
  return JSON.stringify(copy);
}

function isMeaningfulMesoDraft(mesocycle = mesoBuilder) {
  if (!mesocycle) return false;
  if (data.mesocycles?.drafts?.some(item => item.id === mesocycle.id)) return true;
  return Boolean(String(mesocycle.name || "").trim() || mesocycle.scheduleType || Number(mesoStep) > 1 || mesocycle.sourceTemplateId);
}

function captureBuilderState() {
  if (!mesoBuilder) return;
  try { captureMesoStep(); } catch (error) { console.warn("Could not capture the current mesocycle step.", error); }
  const card = mesoDialogCard();
  mesoBuilder.builderVersion = MESO_BUILDER_VERSION;
  mesoBuilder.builderStep = Number(mesoStep || 1);
  mesoBuilder.uiRecoveryState = {
    scrollTop: Number(card?.scrollTop || 0),
    openDetails: [...document.querySelectorAll("#mesocycleBuilderBody details")].map((item, index) => item.open ? index : -1).filter(index => index >= 0)
  };
}

function persistMesoDraft({ force = false, announce = true } = {}) {
  if (!mesoAutosaveEnabled || !mesoBuilder || !isMeaningfulMesoDraft()) return false;
  window.clearTimeout(mesoAutosaveTimer);
  mesoAutosaveTimer = null;
  captureBuilderState();
  mesoBuilder.status = "draft";
  const fingerprint = mesoDraftFingerprint();
  if (!force && fingerprint === mesoLastSavedFingerprint) return false;
  if (announce) mesoSaveStatus("Saving…", "saving");
  try {
    ensureMesocycleData();
    const now = new Date().toISOString();
    mesoBuilder.createdAt ||= now;
    mesoBuilder.updatedAt = now;
    const draft = structuredClone(mesoBuilder);
    const index = data.mesocycles.drafts.findIndex(item => item.id === draft.id);
    if (index >= 0) data.mesocycles.drafts[index] = draft;
    else data.mesocycles.drafts.unshift(draft);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    mesoDraftWasStored = true;
    mesoLastSavedFingerprint = mesoDraftFingerprint(draft);
    if (announce) mesoSaveStatus("Saved just now", "saved");
    return true;
  } catch (error) {
    console.error("Mesocycle draft autosave failed.", error);
    mesoSaveStatus("Couldn’t save draft. Keep this screen open and try Save draft again.", "error");
    return false;
  }
}

function scheduleMesoAutosave() {
  if (!mesoAutosaveEnabled || !isMeaningfulMesoDraft()) return;
  mesoSaveStatus("Saving…", "saving");
  window.clearTimeout(mesoAutosaveTimer);
  mesoAutosaveTimer = window.setTimeout(() => persistMesoDraft(), MESO_AUTOSAVE_DELAY);
}

function validBuilderStep(mesocycle) {
  return Math.min(5, Math.max(1, Number(mesocycle?.builderStep || (mesocycle ? 2 : 1))));
}

function restoreBuilderUiState() {
  const recovery = mesoRestoreState;
  mesoRestoreState = null;
  if (!recovery) return;
  requestAnimationFrame(() => {
    const card = mesoDialogCard();
    if (card) card.scrollTop = Number(recovery.scrollTop || 0);
    const details = [...document.querySelectorAll("#mesocycleBuilderBody details")];
    (recovery.openDetails || []).forEach(index => { if (details[index]) details[index].open = true; });
  });
}

function migrateMesoDrafts() {
  ensureMesocycleData();
  let changed = false;
  data.mesocycles.drafts.forEach(draft => {
    if (!draft.status) { draft.status = "draft"; changed = true; }
    if (!draft.createdAt) { draft.createdAt = new Date().toISOString(); changed = true; }
    if (!draft.updatedAt) { draft.updatedAt = draft.createdAt; changed = true; }
    if (!draft.builderVersion) { draft.builderVersion = 1; changed = true; }
    if (!draft.builderStep) { draft.builderStep = draft.scheduleType ? 2 : 1; changed = true; }
    if (!draft.uiRecoveryState) { draft.uiRecoveryState = { scrollTop: 0, openDetails: [] }; changed = true; }
  });
  if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function refreshDraftCollections() {
  renderMesoCollection("#draftMesocycles", data.mesocycles.drafts, "draft");
}

openMesocycleBuilder = function (mesocycle = null) {
  window.clearTimeout(mesoAutosaveTimer);
  const activeId = data.mesocycles?.active?.id;
  const isActiveEdit = Boolean(mesocycle && activeId === mesocycle.id);
  builderReliabilityLegacy.openMesocycleBuilder(mesocycle);
  mesoAutosaveEnabled = !isActiveEdit;
  mesoDraftWasStored = Boolean(mesocycle && data.mesocycles.drafts.some(item => item.id === mesocycle.id));
  if (mesocycle && mesoDraftWasStored) {
    mesoStep = validBuilderStep(mesocycle);
    mesoRestoreState = structuredClone(mesocycle.uiRecoveryState || null);
    builderReliabilityLegacy.renderMesoBuilder();
  }
  mesoLastSavedFingerprint = mesoDraftWasStored ? mesoDraftFingerprint(mesocycle) : "";
  mesoSaveStatus(mesoAutosaveEnabled ? (mesoDraftWasStored ? "Draft recovered" : "Changes save automatically") : "Active plan changes save when approved", "saved");
  enhanceMesoBuilderSelectors();
  restoreBuilderUiState();
};

renderMesoBuilder = function () {
  builderReliabilityLegacy.renderMesoBuilder();
  enhanceMesoBuilderSelectors();
};

saveMesocycleDraft = function () {
  if (!mesoAutosaveEnabled) return builderReliabilityLegacy.saveMesocycleDraft();
  persistMesoDraft({ force: true });
  refreshDraftCollections();
};

activateMesocycle = function (mesocycle) {
  if (mesocycle?.id === mesoBuilder?.id && mesoAutosaveEnabled) persistMesoDraft({ force: true, announce: false });
  const invalid = typeof firstInvalidMesoStep === "function" ? firstInvalidMesoStep(mesocycle) : null;
  if (!invalid) {
    mesoAutosaveEnabled = false;
    window.clearTimeout(mesoAutosaveTimer);
  }
  const result = builderReliabilityLegacy.activateMesocycle(mesocycle);
  if (invalid) mesoAutosaveEnabled = true;
  return result;
};

function draftDateLabel(value) {
  if (!value) return "Not yet saved";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Saved draft" : `Last edited ${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
}

function duplicateReliableDraft(source) {
  const copy = structuredClone(source);
  const now = new Date().toISOString();
  copy.id = crypto.randomUUID();
  copy.name = `${source.name || "Untitled Mesocycle"} Copy`;
  copy.status = "draft";
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.builderVersion = MESO_BUILDER_VERSION;
  copy.builderStep = source.builderStep || 2;
  copy.progress = isRollingMeso(copy) ? rollingProgressDefaults() : { week: 1, slot: 0, completed: [], skipped: [], needsWeekReview: false };
  copy.schedule?.forEach((slot, index) => {
    slot.id = crypto.randomUUID();
    if (isRollingMeso(copy)) slot.cycleDay = index + 1;
    if (slot.workout) {
      slot.workout.id = crypto.randomUUID();
      slot.workout.exercises = (slot.workout.exercises || []).map(exercise => ({ ...exercise, id: crypto.randomUUID() }));
    }
  });
  data.mesocycles.drafts.unshift(copy);
  saveData();
}

function renameReliableDraft(draft) {
  const name = prompt("Draft name", draft.name || "");
  if (!name?.trim()) return;
  draft.name = name.trim();
  draft.updatedAt = new Date().toISOString();
  saveData();
}

renderMesoCollection = function (selector, items, type) {
  builderReliabilityLegacy.renderMesoCollection(selector, items, type);
  if (type !== "draft") return;
  const root = document.querySelector(selector);
  const cards = [...root.querySelectorAll(".mesocycle-card")];
  cards.forEach((card, index) => {
    const draft = items[index];
    if (!draft) return;
    const open = card.querySelector(".open");
    if (open) open.textContent = "Resume";
    const heading = card.querySelector("h3");
    if (heading && !card.querySelector(".draft-edited-date")) heading.insertAdjacentHTML("afterend", `<p class="small-note draft-edited-date">${escapeHtml(draftDateLabel(draft.updatedAt))}</p>`);
    const actions = card.querySelector(".card-actions");
    if (!actions || actions.querySelector(".rename-reliable-draft")) return;
    if (!actions.querySelector(".duplicate")) {
      const duplicate = document.createElement("button");
      duplicate.className = "secondary-button duplicate-reliable-draft";
      duplicate.textContent = "Duplicate";
      duplicate.onclick = () => duplicateReliableDraft(draft);
      actions.appendChild(duplicate);
    }
    const rename = document.createElement("button");
    rename.className = "secondary-button rename-reliable-draft";
    rename.textContent = "Rename";
    rename.onclick = () => renameReliableDraft(draft);
    actions.appendChild(rename);
  });
};

function dialogScroller(dialog) {
  return dialog?.querySelector(":scope > .dialog-card") || dialog;
}

function beginBuilderOverlay(dialog, underlay, trigger, closeAction) {
  if (!dialog || !underlay || builderOverlayStack.some(record => record.dialog === dialog)) return;
  const isFirstOverlay = builderOverlayStack.length === 0;
  const record = { dialog, underlay, trigger: trigger || document.activeElement, underlayScroll: Number(dialogScroller(underlay)?.scrollTop || 0), bodyScroll: window.scrollY, closeAction };
  builderOverlayStack.push(record);
  dialog.classList.add("nested-builder-overlay");
  underlay.classList.add("overlay-underlay-frozen");
  underlay.setAttribute("aria-hidden", "true");
  if ("inert" in underlay) underlay.inert = true;
  document.documentElement.classList.add("nested-overlay-open");
  document.body.classList.add("nested-overlay-open");
  if (isFirstOverlay) {
    try { history.pushState({ fleemanBuilderOverlay: true }, "", location.href); } catch {}
  }
}

function finishBuilderOverlay(dialog, { fromHistory = false } = {}) {
  const index = builderOverlayStack.findIndex(record => record.dialog === dialog);
  if (index < 0) return;
  const [record] = builderOverlayStack.splice(index, 1);
  dialog.classList.remove("nested-builder-overlay");
  record.underlay.classList.remove("overlay-underlay-frozen");
  record.underlay.removeAttribute("aria-hidden");
  if ("inert" in record.underlay) record.underlay.inert = false;
  const next = builderOverlayStack.at(-1);
  if (next) {
    next.underlay.classList.add("overlay-underlay-frozen");
    next.underlay.setAttribute("aria-hidden", "true");
    if ("inert" in next.underlay) next.underlay.inert = true;
  } else {
    document.documentElement.classList.remove("nested-overlay-open");
    document.body.classList.remove("nested-overlay-open");
  }
  requestAnimationFrame(() => {
    const scroller = dialogScroller(record.underlay);
    if (scroller) scroller.scrollTop = record.underlayScroll;
    window.scrollTo({ top: record.bodyScroll, behavior: "auto" });
    record.trigger?.focus?.({ preventScroll: true });
  });
  if (fromHistory && builderOverlayStack.length) {
    try { history.pushState({ fleemanBuilderOverlay: true }, "", location.href); } catch {}
  } else if (!fromHistory && !builderOverlayStack.length) {
    try { history.replaceState({ fleemanBuilderOverlayClosed: true }, "", location.href); } catch {}
  }
}

window.addEventListener("popstate", () => {
  const top = builderOverlayStack.at(-1);
  if (!top) return;
  if (typeof top.closeAction === "function") top.closeAction();
  else if (top.dialog.open) top.dialog.close();
  finishBuilderOverlay(top.dialog, { fromHistory: true });
});

function portalDialogToBody(dialog) {
  if (dialog && dialog.parentElement !== document.body) document.body.appendChild(dialog);
}

openExerciseLibrary = function (context = { type: "browse" }) {
  const dialog = document.querySelector("#exerciseLibraryDialog");
  const builderIsOpen = document.querySelector("#mesocycleDialog")?.open && String(context.type || "").startsWith("mesocycle");
  const trigger = document.activeElement;
  if (builderIsOpen) persistMesoDraft({ force: true, announce: false });
  portalDialogToBody(dialog);
  builderReliabilityLegacy.openExerciseLibrary(context);
  if (builderIsOpen) {
    const closeButton = document.querySelector("#closeExerciseLibraryButton");
    closeButton.textContent = "Back to Mesocycle";
    beginBuilderOverlay(dialog, document.querySelector("#mesocycleDialog"), trigger, closeExerciseLibrary);
  }
};

closeExerciseLibrary = function () {
  const dialog = document.querySelector("#exerciseLibraryDialog");
  builderReliabilityLegacy.closeExerciseLibrary();
  finishBuilderOverlay(dialog);
  const closeButton = document.querySelector("#closeExerciseLibraryButton");
  if (closeButton) closeButton.textContent = "Close";
  if (mesoAutosaveEnabled) persistMesoDraft({ force: true, announce: false });
};

openExercisePreview = function (exercise, trigger) {
  const libraryDialog = document.querySelector("#exerciseLibraryDialog");
  builderReliabilityLegacy.openExercisePreview(exercise, trigger);
  const preview = document.querySelector("#exercisePreviewDialog");
  if (libraryDialog?.open && builderOverlayStack.some(record => record.dialog === libraryDialog)) beginBuilderOverlay(preview, libraryDialog, trigger, closeExercisePreview);
};

closeExercisePreview = function () {
  const dialog = document.querySelector("#exercisePreviewDialog");
  builderReliabilityLegacy.closeExercisePreview();
  finishBuilderOverlay(dialog);
};

openWorkoutPreview = function (workout, options = {}) {
  const builder = document.querySelector("#mesocycleDialog");
  const trigger = options.trigger || document.activeElement;
  if (builder?.open) persistMesoDraft({ force: true, announce: false });
  builderReliabilityLegacy.openWorkoutPreview(workout, options);
  if (builder?.open) beginBuilderOverlay(document.querySelector("#workoutPreviewDialog"), builder, trigger, closeWorkoutPreview);
};

closeWorkoutPreview = function () {
  const dialog = document.querySelector("#workoutPreviewDialog");
  builderReliabilityLegacy.closeWorkoutPreview();
  finishBuilderOverlay(dialog);
};

mesoExerciseEditor = function (exercise, slot, index) {
  const card = builderReliabilityLegacy.mesoExerciseEditor(exercise, slot, index);
  const swap = card.querySelector(".swap");
  if (swap) swap.onclick = event => openExerciseLibrary({ type: "mesocycle-replace", slot, exerciseIndex: index, muscle: exercise.targetMuscle || exercise.primaryMuscle || "", trigger: event.currentTarget });
  return card;
};

addExerciseFromLibrary = function (definition) {
  if (exerciseLibraryContext.type !== "mesocycle-replace") return builderReliabilityLegacy.addExerciseFromLibrary(definition);
  const { slot, exerciseIndex } = exerciseLibraryContext;
  if (!slot?.workout?.exercises || !Number.isInteger(exerciseIndex)) return;
  const prescription = exerciseDefinitionToPrescription(definition);
  const starting = startingWeightRecommendation(prescription);
  prescription.startWeight = starting.weight;
  prescription.startingWeightRecommendation = starting;
  prescription.targetMuscle = definition.primaryMuscle;
  slot.workout.exercises[exerciseIndex] = prescription;
  markExerciseUsed(definition.id);
  renderMesoBuilder();
  persistMesoDraft({ force: true, announce: false });
  closeExercisePreview();
  closeExerciseLibrary();
};

let savedWorkoutPickerSlot = null;
function ensureSavedWorkoutPicker() {
  let dialog = document.querySelector("#mesoSavedWorkoutPicker");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "mesoSavedWorkoutPicker";
  dialog.setAttribute("aria-labelledby", "mesoSavedWorkoutPickerTitle");
  dialog.innerHTML = `<div class="dialog-card preview-dialog-card"><div class="dialog-header sticky"><div><p class="eyebrow">MESOCYCLE BUILDER</p><h2 id="mesoSavedWorkoutPickerTitle">Choose a saved workout</h2></div><button type="button" class="icon-button close-saved-workout-picker" aria-label="Back to mesocycle">×</button></div><p class="small-note">Choose a workout to copy into this training day. Your other builder changes stay saved.</p><div class="saved-workout-picker-list"></div></div>`;
  document.body.appendChild(dialog);
  dialog.querySelector(".close-saved-workout-picker").onclick = closeSavedWorkoutPicker;
  dialog.addEventListener("cancel", event => { event.preventDefault(); closeSavedWorkoutPicker(); });
  return dialog;
}

function openSavedWorkoutPicker(slot, trigger) {
  persistMesoDraft({ force: true, announce: false });
  savedWorkoutPickerSlot = slot;
  const dialog = ensureSavedWorkoutPicker();
  const list = dialog.querySelector(".saved-workout-picker-list");
  list.innerHTML = data.workouts.length ? "" : '<div class="panel"><p>No saved workouts are available yet.</p></div>';
  data.workouts.forEach(workout => {
    const item = document.createElement("article");
    item.className = "panel saved-workout-picker-item";
    item.innerHTML = `<div><strong>${escapeHtml(workout.name)}</strong><p class="small-note">${workout.exercises.length} exercises${workout.notes ? ` • ${escapeHtml(workout.notes)}` : ""}</p></div><button type="button" class="primary-button compact">Use workout</button>`;
    item.querySelector("button").onclick = () => {
      const oldId = savedWorkoutPickerSlot.workout?.id || crypto.randomUUID();
      savedWorkoutPickerSlot.workout = { ...structuredClone(workout), id: oldId, exercises: workout.exercises.map(copyExercise) };
      renderMesoBuilder();
      persistMesoDraft({ force: true, announce: false });
      closeSavedWorkoutPicker();
    };
    list.appendChild(item);
  });
  dialog.showModal();
  beginBuilderOverlay(dialog, document.querySelector("#mesocycleDialog"), trigger, closeSavedWorkoutPicker);
  dialog.querySelector(".close-saved-workout-picker").focus();
}

function closeSavedWorkoutPicker() {
  const dialog = document.querySelector("#mesoSavedWorkoutPicker");
  if (dialog?.open) dialog.close();
  if (dialog) finishBuilderOverlay(dialog);
  savedWorkoutPickerSlot = null;
}

function enhanceMesoBuilderSelectors() {
  const cards = [...document.querySelectorAll("#mesoWorkoutDays .meso-workout-card")];
  cards.forEach((card, index) => {
    const slot = mesoBuilder?.schedule?.[index];
    if (!slot || slot.dayType === "rest") return;
    const inline = card.querySelector(".rolling-saved-workout");
    inline?.closest("label")?.classList.add("hidden");
    if (card.querySelector(".meso-saved-workout-trigger")) return;
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "secondary-button meso-saved-workout-trigger";
    trigger.textContent = "Choose Saved Workout";
    trigger.onclick = event => openSavedWorkoutPicker(slot, event.currentTarget);
    const actions = card.querySelector(".exercise-actions");
    if (actions) actions.insertBefore(trigger, actions.firstChild);
  });
}

const mesocycleDialog = document.querySelector("#mesocycleDialog");
mesocycleDialog.addEventListener("input", scheduleMesoAutosave);
mesocycleDialog.addEventListener("change", scheduleMesoAutosave);
mesocycleDialog.addEventListener("click", event => {
  if (event.target.closest("button")) window.setTimeout(() => {
    if (mesoAutosaveEnabled && mesocycleDialog.open) persistMesoDraft({ force: true, announce: false });
  }, 0);
});
mesoDialogCard()?.addEventListener("scroll", scheduleMesoAutosave, { passive: true });

document.querySelector("#closeMesocycleButton").onclick = () => {
  if (mesoAutosaveEnabled) persistMesoDraft({ force: true });
  mesoAutosaveEnabled = false;
  window.clearTimeout(mesoAutosaveTimer);
  mesocycleDialog.close();
  if (mesoDraftWasStored) refreshDraftCollections();
};

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistMesoDraft({ force: true, announce: false });
});
window.addEventListener("pagehide", () => persistMesoDraft({ force: true, announce: false }));

[
  ["#exerciseLibraryDialog", closeExerciseLibrary],
  ["#exercisePreviewDialog", closeExercisePreview],
  ["#workoutPreviewDialog", closeWorkoutPreview]
].forEach(([selector, closeAction]) => {
  const dialog = document.querySelector(selector);
  dialog?.addEventListener("cancel", event => {
    if (!builderOverlayStack.some(record => record.dialog === dialog)) return;
    event.preventDefault();
    closeAction();
  });
});

document.querySelector("#closeExerciseLibraryButton").onclick = closeExerciseLibrary;
document.querySelector("#closeExercisePreviewButton").onclick = closeExercisePreview;
document.querySelector("#closeWorkoutPreviewButton").onclick = closeWorkoutPreview;

migrateMesoDrafts();
renderAll();
