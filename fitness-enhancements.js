"use strict";

const FITNESS_ENHANCEMENTS_VERSION = 1;
const CANONICAL_MUSCLES = ["Chest","Back","Shoulders","Biceps","Triceps","Quads","Hamstrings","Glutes","Calves","Core","Traps","Forearms","Adductors","Abductors","Lower Back"];
const CUSTOM_EQUIPMENT = ["Bodyweight","Barbell","Dumbbells","Cable Station","Smith Machine","Selectorized Machine","Plate-Loaded Machine","Bench","Pull-Up Station","Dip Station","Leg Press","Hack Squat","Commercial Gym Equipment","Other"];
const CUSTOM_LOAD_TYPES = ["Total Weight","Per Dumbbell","Machine Stack","Plate-Loaded Total","Plate-Loaded Per Side","Bodyweight","Bodyweight + Added Weight","Assisted Bodyweight"];
const MOVEMENTS_BY_MUSCLE = {
  Chest:["Horizontal Chest Press","Incline Chest Press","Decline / Dip Press","Chest Fly / Adduction","Other Isolation","Other Compound"],
  Back:["Vertical Pull","Horizontal Row","Hip Hinge","Other Isolation","Other Compound"],
  Shoulders:["Shoulder Press","Other Isolation","Other Compound"],
  Biceps:["Biceps Curl","Other Isolation"], Triceps:["Triceps Extension / Pushdown","Decline / Dip Press","Other Isolation","Other Compound"],
  Quads:["Squat Pattern","Leg Press / Hack Squat","Lunge / Split Squat","Leg Extension","Other Isolation","Other Compound"],
  Hamstrings:["Hip Hinge","Leg Curl","Other Isolation","Other Compound"], Glutes:["Hip Extension","Hip Hinge","Lunge / Split Squat","Other Isolation","Other Compound"],
  Calves:["Calf Raise","Other Isolation"], Core:["Core","Carry","Other Isolation","Other Compound"], Traps:["Carry","Other Isolation"], Forearms:["Carry","Other Isolation"],
  Adductors:["Other Isolation"], Abductors:["Other Isolation"], "Lower Back":["Hip Hinge","Other Isolation","Other Compound"]
};

const fitnessLegacy = {
  createCustomExercise,
  addExerciseEditor,
  mesoExerciseEditor,
  renderMesoBuilder,
  openOnboarding,
  renderOnboardingStep,
  saveOnboardingStep,
  finishOnboarding,
  startingWeightRecommendation,
  recommendationFor,
  renderSession,
  beginWorkout,
  finishWorkout,
  openActiveExerciseHistory
};

function isStandardBodyweight(entry) { return entry === "Bodyweight"; }
function isAddedBodyweight(entry) { return entry === "Bodyweight + Added Weight" || entry === "Bodyweight Plus Added Weight"; }
function isAssistedBodyweight(entry) { return entry === "Assisted Bodyweight"; }
function isAnyBodyweight(entry) { return isStandardBodyweight(entry) || isAddedBodyweight(entry) || isAssistedBodyweight(entry); }

function exerciseLoadType(exercise) {
  const definition = definitionForExercise(exercise) || exercise;
  return exercise.weightEntryType || definition.defaults?.weightEntryType || "Total Weight";
}

function normalizeFitnessEnhancementData() {
  const priorRestAlerts = data.settings.restTimerAlerts || {};
  data.settings.restTimerAlerts = { vibration:priorRestAlerts.vibration ?? true, tone:priorRestAlerts.tone ?? false };
  localStorage.removeItem("fleemanFitnessVoicePreviewTestV1");
  data.profile.quickStrengthProfile = { bench:null, squat:null, deadlift:null, pulling:null, ...(data.profile.quickStrengthProfile || {}) };
  data.exerciseLibraryUser.customExercises = (data.exerciseLibraryUser.customExercises || []).map(definition => {
    definition.secondaryMuscles ||= [];
    definition.equipment = Array.isArray(definition.equipment) ? definition.equipment : [definition.equipment || "Other"];
    definition.exerciseType ||= "Compound";
    definition.movementPattern ||= movementBaselineCategory(definition) || "Other Compound";
    definition.substitutionFamily ||= definition.movementPattern;
    definition.defaults ||= {};
    definition.defaults.weightEntryType ||= definition.weightEntryType || "Total Weight";
    definition.progressionMode ||= definition.defaults.progressionMode || (isStandardBodyweight(definition.defaults.weightEntryType) ? "reps" : isAddedBodyweight(definition.defaults.weightEntryType) ? "added_load" : isAssistedBodyweight(definition.defaults.weightEntryType) ? "assisted_reduction" : "manual");
    definition.defaults.progressionMode ||= definition.progressionMode;
    definition.defaults.repUnit ||= definition.repUnit || "reps";
    definition.setup ||= [];
    definition.cues ||= [];
    definition.searchKeywords ||= [definition.name?.toLowerCase() || "", definition.primaryMuscle?.toLowerCase() || ""];
    return definition;
  });
  const prescriptions = [
    ...data.workouts.flatMap(workout => workout.exercises || []),
    ...[data.mesocycles?.active, ...(data.mesocycles?.drafts || []), ...(data.mesocycles?.completed || [])].filter(Boolean).flatMap(meso => (meso.schedule || []).flatMap(slot => slot.workout?.exercises || []))
  ];
  prescriptions.forEach(exercise => {
    const definition = definitionForExercise(exercise);
    if (!definition) return;
    exercise.primaryMuscle = definition.primaryMuscle;
    exercise.secondaryMuscles = [...(definition.secondaryMuscles || [])];
    exercise.muscle = definition.primaryMuscle;
    exercise.weightEntryType ||= definition.defaults?.weightEntryType || "Total Weight";
    exercise.progressionMode ||= definition.progressionMode || definition.defaults?.progressionMode || "manual";
    exercise.repUnit ||= definition.repUnit || definition.defaults?.repUnit || "reps";
  });
  data.history.forEach(session => (session.exercises || []).forEach(result => {
    result.weightEntryType ||= exerciseLoadType(result);
    result.progressionMode ||= (definitionForExercise(result)?.progressionMode || "manual");
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function injectFitnessEnhancementUi() {
  if (!document.querySelector("#customExerciseDialog")) document.body.insertAdjacentHTML("beforeend", `
    <dialog id="customExerciseDialog" aria-labelledby="customExerciseTitle"><form id="customExerciseForm" class="dialog-card custom-exercise-dialog" novalidate>
      <div class="dialog-header sticky"><div><p class="eyebrow">EXERCISE LIBRARY</p><h2 id="customExerciseTitle">Create Custom Exercise</h2></div><button type="button" id="closeCustomExerciseButton" class="icon-button" aria-label="Cancel custom exercise">×</button></div>
      <div class="onboarding-grid custom-exercise-grid">
        <label class="wide">Exercise name<input id="customExerciseName" required></label>
        <label>Primary Muscle<select id="customPrimaryMuscle" required><option value="">Choose muscle</option>${CANONICAL_MUSCLES.map(muscle=>`<option>${muscle}</option>`).join("")}</select></label>
        <label>Equipment<select id="customEquipment">${CUSTOM_EQUIPMENT.map(value=>`<option>${value}</option>`).join("")}</select></label>
        <fieldset class="wide secondary-muscle-field"><legend>Secondary Muscles</legend><p class="small-note">Choose all that apply. The primary muscle cannot also be secondary.</p><div id="customSecondaryMuscles" class="secondary-muscle-grid">${CANONICAL_MUSCLES.map(muscle=>`<label><input type="checkbox" value="${muscle}">${muscle}</label>`).join("")}</div></fieldset>
        <label>Exercise Type<select id="customExerciseType"><option>Compound</option><option>Isolation</option></select></label>
        <label>Movement Category<select id="customMovementCategory"></select></label>
        <label>Load Type<select id="customLoadType">${CUSTOM_LOAD_TYPES.map(value=>`<option>${value}</option>`).join("")}</select></label>
        <label>Progression<select id="customProgressionMode"><option value="reps">Repetitions</option><option value="added_load">Added load</option><option value="harder_variation">Harder variation</option><option value="assisted_reduction">Reduce assistance</option><option value="duration">Duration</option><option value="manual">Manual</option></select></label>
        <label>Default sets<input id="customDefaultSets" type="number" min="1" max="10" value="3"></label>
        <label>Minimum reps / seconds<input id="customMinReps" type="number" min="1" max="300" value="8"></label>
        <label>Maximum reps / seconds<input id="customMaxReps" type="number" min="1" max="600" value="12"></label>
        <label>Target RIR<input id="customTargetRir" type="number" min="0" max="10" value="3"></label>
        <label>Rest seconds<input id="customRestSeconds" type="number" min="0" max="900" value="90"></label>
        <label>Load increment<input id="customWeightIncrement" type="number" min="0" step="0.5" value="5"></label>
        <label class="wide">Description (optional)<textarea id="customExerciseDescription"></textarea></label>
      </div>
      <button class="primary-button" type="submit">Save Custom Exercise</button>
    </form></dialog>`);
  if (!document.querySelector("#restTimerPanel")) document.querySelector("#sessionDialog .live-workout-header, #sessionDialog .dialog-header").insertAdjacentHTML("afterend", `
    <section id="restTimerPanel" class="rest-timer-panel hidden" aria-live="polite">
      <div><span class="eyebrow">REST</span><strong id="restTimerValue">00:00</strong><p id="restTimerContext"></p></div>
      <div class="rest-timer-actions"><button id="restTimerPause" class="secondary-button compact" type="button">Pause</button><button id="restTimerSkip" class="secondary-button compact" type="button">Skip</button><button id="restTimerAdd15" class="secondary-button compact" type="button">+15 sec</button><button id="restTimerAdd30" class="secondary-button compact" type="button">+30 sec</button><button id="restTimerRestart" class="secondary-button compact" type="button">Restart</button></div>
    </section>`);
  if (!document.querySelector("#restTimerPreferences")) document.querySelector("#autoCollapseExercises").closest("label").insertAdjacentHTML("afterend", `
    <fieldset id="restTimerPreferences" class="rest-timer-preferences"><legend>Rest timer alerts</legend>
      <label class="setting-toggle"><input id="restVibration" type="checkbox"><span>Vibration</span></label>
      <label class="setting-toggle"><input id="restCompletionTone" type="checkbox"><span>Completion tone</span></label>
      <p class="small-note">Alerts use this device only. Vibration and tone availability depends on the browser and operating system.</p>
    </fieldset>`);
}

let customExerciseSaveCallback = null;
function customMovementOptions(primary) {
  return MOVEMENTS_BY_MUSCLE[primary] || ["Other Isolation","Other Compound"];
}

function updateCustomExerciseControls() {
  const primary = document.querySelector("#customPrimaryMuscle").value;
  document.querySelectorAll("#customSecondaryMuscles input").forEach(input => {
    input.disabled = input.value === primary;
    if (input.disabled) input.checked = false;
  });
  const movement = document.querySelector("#customMovementCategory");
  const previous = movement.value;
  const options = customMovementOptions(primary);
  movement.innerHTML = options.map(value => `<option>${value}</option>`).join("");
  if (options.includes(previous)) movement.value = previous;
  const loadType = document.querySelector("#customLoadType").value;
  const progression = document.querySelector("#customProgressionMode");
  if (isStandardBodyweight(loadType) && !["reps","duration","harder_variation"].includes(progression.value)) progression.value = "reps";
  if (isAddedBodyweight(loadType)) progression.value = "added_load";
  if (isAssistedBodyweight(loadType)) progression.value = "assisted_reduction";
}

function openCustomExerciseForm(callback = null) {
  customExerciseSaveCallback = callback;
  const form = document.querySelector("#customExerciseForm");
  form.reset();
  document.querySelector("#customDefaultSets").value = 3;
  document.querySelector("#customMinReps").value = 8;
  document.querySelector("#customMaxReps").value = 12;
  document.querySelector("#customTargetRir").value = 3;
  document.querySelector("#customRestSeconds").value = 90;
  document.querySelector("#customWeightIncrement").value = 5;
  updateCustomExerciseControls();
  const dialog = document.querySelector("#customExerciseDialog");
  dialog.showModal();
  document.querySelector("#customExerciseName").focus();
}

function closeCustomExerciseForm() {
  const dialog = document.querySelector("#customExerciseDialog");
  if (dialog.open) dialog.close();
  customExerciseSaveCallback = null;
}

function isCustomExerciseFieldCorrected(field) {
  const value = field.value;
  switch (field.dataset.validationKey) {
    case "custom.name":
    case "custom.primaryMuscle": return Boolean(String(value || "").trim());
    case "custom.sets": return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 10;
    case "custom.minReps": return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 300 && Number(value) <= Number(document.querySelector("#customMaxReps").value);
    case "custom.maxReps": return Number.isInteger(Number(value)) && Number(value) >= Number(document.querySelector("#customMinReps").value) && Number(value) <= 600;
    default: return true;
  }
}

function bindCustomExerciseValidation() {
  const form = document.querySelector("#customExerciseForm");
  FormValidation.setKey(document.querySelector("#customExerciseName"), "custom.name");
  FormValidation.setKey(document.querySelector("#customPrimaryMuscle"), "custom.primaryMuscle");
  FormValidation.setKey(document.querySelector("#customDefaultSets"), "custom.sets");
  FormValidation.setKey(document.querySelector("#customMinReps"), "custom.minReps", ["custom.maxReps"]);
  FormValidation.setKey(document.querySelector("#customMaxReps"), "custom.maxReps", ["custom.minReps"]);
  FormValidation.bindLiveClear(form, { isCorrected: isCustomExerciseFieldCorrected });
}

function saveCustomExerciseForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const result = FormValidation.createResult();
  FormValidation.required(result,"custom.name",document.querySelector("#customExerciseName").value,"Enter an exercise name.");
  FormValidation.required(result,"custom.primaryMuscle",document.querySelector("#customPrimaryMuscle").value,"Choose a primary muscle.");
  FormValidation.number(result,"custom.sets",document.querySelector("#customDefaultSets").value,{label:"Default sets",min:1,max:10,integer:true});
  FormValidation.number(result,"custom.minReps",document.querySelector("#customMinReps").value,{label:"Minimum reps or seconds",min:1,max:300,integer:true});
  FormValidation.number(result,"custom.maxReps",document.querySelector("#customMaxReps").value,{label:"Maximum reps or seconds",min:1,max:600,integer:true});
  const min = Number(document.querySelector("#customMinReps").value), max = Number(document.querySelector("#customMaxReps").value);
  if (max < min) FormValidation.addError(result,"custom.maxReps","Maximum reps or seconds must be at least the minimum.");
  if (!FormValidation.apply(form,result,{summaryTitle:"The custom exercise could not be saved. Fix these fields:"})) return;
  const name = document.querySelector("#customExerciseName").value.trim();
  const primaryMuscle = document.querySelector("#customPrimaryMuscle").value;
  const secondaryMuscles = [...document.querySelectorAll("#customSecondaryMuscles input:checked")].map(input=>input.value).filter(muscle=>muscle!==primaryMuscle);
  const equipment = document.querySelector("#customEquipment").value;
  const movementPattern = document.querySelector("#customMovementCategory").value;
  const weightEntryType = document.querySelector("#customLoadType").value;
  const progressionMode = document.querySelector("#customProgressionMode").value;
  const definition = {
    id:`custom-${crypto.randomUUID()}`, name, description:document.querySelector("#customExerciseDescription").value.trim() || `A custom ${movementPattern.toLowerCase()} exercise.`,
    primaryMuscle, secondaryMuscles, muscleTags:[primaryMuscle,...secondaryMuscles], equipment:[equipment], exerciseType:document.querySelector("#customExerciseType").value,
    movementPattern, laterality:"Bilateral", substitutionFamily:movementPattern, progressionMode, repUnit:progressionMode==="duration"?"seconds":"reps",
    defaults:{sets:Number(document.querySelector("#customDefaultSets").value),minReps:min,maxReps:max,targetRIR:Number(document.querySelector("#customTargetRir").value),restSeconds:Number(document.querySelector("#customRestSeconds").value),weightIncrement:Number(document.querySelector("#customWeightIncrement").value),weightEntryType,progressionMode,repUnit:progressionMode==="duration"?"seconds":"reps"},
    setup:[],cues:["Use a controlled range of motion.","Stop if technique breaks down or the movement causes pain."],caution:"",sourceType:"custom",
    searchKeywords:[name.toLowerCase(),primaryMuscle.toLowerCase(),...secondaryMuscles.map(value=>value.toLowerCase()),equipment.toLowerCase(),movementPattern.toLowerCase()]
  };
  data.exerciseLibraryUser.customExercises.push(definition);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
  const callback = customExerciseSaveCallback;
  closeCustomExerciseForm();
  if (callback) callback(definition); else if (exerciseLibraryContext.type !== "browse") addExerciseFromLibrary(definition); else renderExerciseLibrary();
}

createCustomExercise = function () { openCustomExerciseForm(); };

function syncExerciseMetadata(exercise) {
  const definition = definitionForExercise(exercise);
  if (!definition) return;
  exercise.primaryMuscle = definition.primaryMuscle;
  exercise.secondaryMuscles = [...(definition.secondaryMuscles || [])];
  exercise.muscle = definition.primaryMuscle;
  exercise.weightEntryType = definition.defaults?.weightEntryType || exercise.weightEntryType || "Total Weight";
  exercise.progressionMode = definition.progressionMode || definition.defaults?.progressionMode || exercise.progressionMode || "manual";
  exercise.repUnit = definition.repUnit || definition.defaults?.repUnit || exercise.repUnit || "reps";
}

addExerciseEditor = function (exercise = {}) {
  const definition = definitionForExercise(exercise);
  const merged = definition ? { ...exerciseDefinitionToPrescription(definition), ...exercise } : exercise;
  fitnessLegacy.addExerciseEditor(merged);
  const card = document.querySelector("#exerciseEditor .exercise-editor-card:last-child");
  if (!card) return;
  const entry = merged.weightEntryType || definition?.defaults?.weightEntryType || "Total Weight";
  const weightInput = card.querySelector(".exercise-weight");
  if (isStandardBodyweight(entry) && weightInput) {
    weightInput.type = "hidden";
    weightInput.value = 0;
    const label = weightInput.closest("label");
    label.classList.add("bodyweight-prescription-field");
    label.querySelector(".exercise-weight-label").textContent = "Load";
    label.insertAdjacentHTML("beforeend", "<strong>Bodyweight</strong>");
  }
  if (["reps","duration","harder_variation"].includes(merged.progressionMode || definition?.progressionMode)) {
    card.querySelector(".exercise-increment")?.closest("label")?.classList.add("hidden");
  }
};

mesoExerciseEditor = function (exercise, slot, index) {
  syncExerciseMetadata(exercise);
  const card = fitnessLegacy.mesoExerciseEditor(exercise,slot,index);
  card.querySelector('[data-field="muscle"]')?.closest("label")?.remove();
  const entry = exerciseLoadType(exercise);
  const weightInput = card.querySelector('[data-field="startWeight"]');
  if (isStandardBodyweight(entry) && weightInput) {
    weightInput.type = "hidden";
    weightInput.value = 0;
    weightInput.closest("label").classList.add("bodyweight-prescription-field");
    weightInput.closest("label").insertAdjacentHTML("afterbegin",'<span>Load</span><strong>Bodyweight</strong>');
  }
  const increment = card.querySelector('[data-field="increment"]');
  if (increment && ["reps","duration","harder_variation"].includes(exercise.progressionMode)) increment.closest("label").classList.add("hidden");
  return card;
};

function enhanceMesoCustomActions() {
  [...document.querySelectorAll("#mesoWorkoutDays .meso-workout-card")].forEach((card,index) => {
    const slot = mesoBuilder?.schedule?.[index];
    const button = card.querySelector(".add-meso-exercise");
    if (!button || !slot || slot.dayType === "rest") return;
    button.textContent = "Create Custom Exercise";
    button.onclick = () => openCustomExerciseForm(definition => {
      slot.workout.exercises.push(exerciseDefinitionToPrescription(definition));
      renderMesoBuilder();
      if (typeof persistMesoDraft === "function") persistMesoDraft({force:true,announce:false});
    });
  });
}

renderMesoBuilder = function () { fitnessLegacy.renderMesoBuilder(); enhanceMesoCustomActions(); };

let onboardingMode = "choice";
let advancedBaselinesOnly = false;
openOnboarding = function (step=1) {
  advancedBaselinesOnly = step === 4;
  onboardingMode = advancedBaselinesOnly ? "advanced" : "choice";
  return fitnessLegacy.openOnboarding(advancedBaselinesOnly ? 4 : 1);
};

function renderSetupChoice() {
  document.querySelector("#onboardingProgress").innerHTML = '<div class="step-pill active"></div><div class="step-pill"></div>';
  document.querySelector("#onboardingProgress").setAttribute("aria-valuemax","2");
  document.querySelector("#onboardingProgress").setAttribute("aria-valuenow","1");
  document.querySelector("#onboardingBackButton").disabled = true;
  document.querySelector("#onboardingContinueButton").classList.add("hidden");
  document.querySelector("#onboardingBody").innerHTML = `<h3>Choose your strength setup</h3><div class="setup-choice-grid">
    <button id="chooseQuickStrength" class="setup-choice-card recommended" type="button"><span class="confidence-label">RECOMMENDED • ABOUT 1 MINUTE</span><strong>Quick Setup</strong><small>Uses body weight, Bench, Squat, Deadlift, and experience to create conservative starting estimates.</small></button>
    <button id="chooseAdvancedStrength" class="setup-choice-card" type="button"><span class="confidence-label">OPTIONAL</span><strong>Advanced Strength Setup</strong><small>Add detailed movement-specific baselines for more precise initial estimates.</small></button></div>`;
  document.querySelector("#chooseQuickStrength").onclick = () => { onboardingMode="quick"; renderOnboardingStep(); };
  document.querySelector("#chooseAdvancedStrength").onclick = () => { onboardingMode="advanced"; onboardingStep=1; renderOnboardingStep(); };
}

function strengthAnchorMarkup(key,label,value) {
  const method=value?.method||"known";
  return `<fieldset class="strength-anchor-card" data-anchor="${key}"><legend>${label}</legend><label>Entry method<select class="anchor-method"><option value="known" ${method==="known"?"selected":""}>Known 1RM</option><option value="recent" ${method==="recent"?"selected":""}>Estimate from recent set</option></select></label><div class="anchor-known"><label>${label} 1RM<input class="anchor-one-rm" type="number" min="1" step="0.5" value="${value?.oneRepMax?displayWeightValue(value.oneRepMax,onboardingDraft.units):""}"></label></div><div class="anchor-recent"><label>Weight<input class="anchor-weight" type="number" min="1" step="0.5" value="${value?.weight?displayWeightValue(value.weight,onboardingDraft.units):""}"></label><label>Reps<input class="anchor-reps" type="number" min="1" max="30" value="${value?.repetitions||""}"></label><label>Estimated RIR<input class="anchor-rir" type="number" min="0" max="10" value="${value?.repsRemaining??2}"></label></div></fieldset>`;
}

function updateStrengthAnchorVisibility() {
  document.querySelectorAll(".strength-anchor-card[data-anchor]").forEach(card => {
    const recent = card.querySelector(".anchor-method").value === "recent";
    card.querySelector(".anchor-known").classList.toggle("hidden",recent);
    card.querySelector(".anchor-recent").classList.toggle("hidden",!recent);
  });
}

function isQuickStrengthFieldCorrected(field) {
  if (!field.matches("input")) return true;
  const number = Number(field.value);
  if (!field.value || !Number.isFinite(number)) return false;
  if (field.classList.contains("anchor-rir")) return Number.isInteger(number) && number >= 0 && number <= 10;
  if (field.classList.contains("anchor-reps")) return Number.isInteger(number) && number >= 1 && number <= 30;
  return number > 0;
}

function bindQuickStrengthValidation() {
  const root = document.querySelector("#onboardingBody");
  FormValidation.setKey(document.querySelector("#quickBodyWeight"), "quick.bodyWeight");
  document.querySelectorAll(".strength-anchor-card[data-anchor]").forEach(card => {
    const key = card.dataset.anchor;
    FormValidation.setKey(card.querySelector(".anchor-one-rm"), `quick.${key}.oneRepMax`);
    FormValidation.setKey(card.querySelector(".anchor-weight"), `quick.${key}.weight`);
    FormValidation.setKey(card.querySelector(".anchor-reps"), `quick.${key}.repetitions`);
    FormValidation.setKey(card.querySelector(".anchor-rir"), `quick.${key}.rir`);
  });
  FormValidation.bindLiveClear(root, { isCorrected: isQuickStrengthFieldCorrected });
}

function renderQuickStrengthSetup() {
  const profile=onboardingDraft, metric=profile.units==="metric", unit=weightUnit(profile.units), quick=profile.quickStrengthProfile||{};
  document.querySelector("#onboardingProgress").innerHTML='<div class="step-pill active"></div><div class="step-pill active"></div>';
  document.querySelector("#onboardingProgress").setAttribute("aria-valuemax","2");document.querySelector("#onboardingProgress").setAttribute("aria-valuenow","2");
  document.querySelector("#onboardingBackButton").disabled=false;document.querySelector("#onboardingContinueButton").classList.remove("hidden");document.querySelector("#onboardingContinueButton").textContent="Finish Quick Setup";
  document.querySelector("#onboardingBody").innerHTML=`<h3>Quick Strength Setup</h3><p class="small-note">Enter known 1RMs or estimate from recent sets. You do not need to test a true maximum.</p><div class="onboarding-grid"><label>Preferred units<select id="quickUnits"><option value="imperial" ${!metric?"selected":""}>Pounds</option><option value="metric" ${metric?"selected":""}>Kilograms</option></select></label><label>Body weight (${unit})<input id="quickBodyWeight" type="number" min="1" step="0.1" value="${profile.bodyWeight.value?displayWeightValue(profile.bodyWeight.value,profile.units):""}"></label><label>Experience level<select id="quickExperience"><option value="brand-new">Brand new</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="experienced">Experienced</option><option value="custom">Custom</option></select></label></div><div class="quick-anchor-grid">${strengthAnchorMarkup("bench","Bench Press",quick.bench)}${strengthAnchorMarkup("squat","Squat",quick.squat)}${strengthAnchorMarkup("deadlift","Deadlift",quick.deadlift)}</div><fieldset class="strength-anchor-card optional-pull"><legend>Optional pulling baseline</legend><label>Pulling exercise<select id="quickPullExercise"><option value="">Skip optional pulling baseline</option>${["Pull-Up","Lat Pulldown","Barbell Row","Cable Row"].map(name=>`<option ${quick.pulling?.exerciseName===name?"selected":""}>${name}</option>`).join("")}</select></label><div id="quickPullFields"><label><span id="quickPullWeightLabel">Training weight (${unit})</span><input id="quickPullWeight" type="number" min="0" step="0.5" value="${quick.pulling?.weight?displayWeightValue(quick.pulling.weight,profile.units):""}"></label><label>Reps<input id="quickPullReps" type="number" min="1" max="30" value="${quick.pulling?.repetitions||8}"></label><label>Estimated RIR<input id="quickPullRir" type="number" min="0" max="10" value="${quick.pulling?.repsRemaining??2}"></label><p class="small-note">For Pull-Up, enter only added weight. Leave it at zero for a standard bodyweight pull-up.</p></div></fieldset><button id="openAdvancedFromQuick" type="button" class="secondary-button">Open Advanced Strength Setup</button>`;
  document.querySelector("#quickExperience").value=profile.experienceLevel||"brand-new";
  document.querySelectorAll(".anchor-method").forEach(select=>select.onchange=updateStrengthAnchorVisibility);
  document.querySelector("#quickPullExercise").onchange=event=>{document.querySelector("#quickPullFields").classList.toggle("hidden",!event.target.value);document.querySelector("#quickPullWeightLabel").textContent=event.target.value==="Pull-Up"?`Added weight (${unit})`:`Training weight (${unit})`;};
  document.querySelector("#quickPullFields").classList.toggle("hidden",!document.querySelector("#quickPullExercise").value);
  document.querySelector("#quickPullWeightLabel").textContent=document.querySelector("#quickPullExercise").value==="Pull-Up"?`Added weight (${unit})`:`Training weight (${unit})`;
  document.querySelector("#quickUnits").onchange=event=>{saveQuickStrengthDraft(false);profile.units=event.target.value;renderQuickStrengthSetup();};
  document.querySelector("#openAdvancedFromQuick").onclick=()=>{saveQuickStrengthDraft(false);onboardingMode="advanced";onboardingStep=1;renderOnboardingStep();};
  updateStrengthAnchorVisibility();
  bindQuickStrengthValidation();
}

renderOnboardingStep = function () {
  if (onboardingMode === "advanced") {
    document.querySelector("#onboardingContinueButton").classList.remove("hidden");
    return fitnessLegacy.renderOnboardingStep();
  }
  if (onboardingMode === "choice") return renderSetupChoice();
  return renderQuickStrengthSetup();
};

function readStrengthAnchor(card, required, result) {
  const key=card.dataset.anchor, method=card.querySelector(".anchor-method").value;
  if (method==="known") {
    const field=card.querySelector(".anchor-one-rm"),value=Number(field.value);
    if(required)FormValidation.number(result,`quick.${key}.oneRepMax`,field.value,{label:`${key} 1RM`,min:1});
    return value?{method,oneRepMax:internalWeightValue(value,onboardingDraft.units)}:null;
  }
  const weight=card.querySelector(".anchor-weight"),reps=card.querySelector(".anchor-reps"),rir=card.querySelector(".anchor-rir");
  if(required){FormValidation.number(result,`quick.${key}.weight`,weight.value,{label:`${key} recent-set weight`,min:1});FormValidation.number(result,`quick.${key}.repetitions`,reps.value,{label:`${key} repetitions`,min:1,max:30,integer:true});FormValidation.number(result,`quick.${key}.rir`,rir.value,{label:`${key} RIR`,min:0,max:10,integer:true});}
  if(!Number(weight.value)||!Number(reps.value))return null;
  const internal=internalWeightValue(Number(weight.value),onboardingDraft.units);
  return{method,weight:internal,repetitions:Number(reps.value),repsRemaining:Number(rir.value)||0,oneRepMax:estimatedOneRepMax(internal,Number(reps.value),Number(rir.value)||0)};
}

function saveQuickStrengthDraft(validate=true) {
  const result=FormValidation.createResult(),weightField=document.querySelector("#quickBodyWeight");
  if(validate)FormValidation.number(result,"quick.bodyWeight",weightField.value,{label:"Body weight",min:1});
  const anchors={};document.querySelectorAll(".strength-anchor-card[data-anchor]").forEach(card=>anchors[card.dataset.anchor]=readStrengthAnchor(card,validate,result));
  if(validate&&!FormValidation.apply(document.querySelector("#onboardingBody"),result,{summaryTitle:"Quick Setup needs a few corrections:"}))return false;
  const units=document.querySelector("#quickUnits").value;onboardingDraft.units=units;onboardingDraft.bodyWeight={value:internalWeightValue(Number(weightField.value)||0,units)||null,unit:"lb"};onboardingDraft.experienceLevel=document.querySelector("#quickExperience").value;
  const pullName=document.querySelector("#quickPullExercise").value;let pulling=null;if(pullName){const weight=internalWeightValue(Number(document.querySelector("#quickPullWeight").value)||0,units),repetitions=Number(document.querySelector("#quickPullReps").value)||8,repsRemaining=Number(document.querySelector("#quickPullRir").value)||0,effectiveWeight=pullName==="Pull-Up"?Number(onboardingDraft.bodyWeight.value||0)+weight:weight;pulling={exerciseName:pullName,weight,repetitions,repsRemaining,oneRepMax:estimatedOneRepMax(effectiveWeight,repetitions,repsRemaining)};}
  onboardingDraft.quickStrengthProfile={...anchors,pulling};return true;
}

function finishQuickStrengthSetup() {
  if(!saveQuickStrengthDraft(true))return;
  const now=new Date().toISOString();
  const names={bench:"Barbell Bench Press",squat:"Back Squat",deadlift:"Deadlift"};
  Object.entries(onboardingDraft.quickStrengthProfile).forEach(([key,anchor])=>{if(!anchor||key==="pulling")return;const existing=onboardingDraft.strengthBaselines.findIndex(item=>item.quickStrengthAnchor===key);const baseline={id:existing>=0?onboardingDraft.strengthBaselines[existing].id:crypto.randomUUID(),quickStrengthAnchor:key,movementCategory:key==="bench"?"Horizontal chest press":key==="squat"?"Squat pattern":"Hip hinge",exerciseId:definitionForExercise({name:names[key]})?.id||null,exerciseName:names[key],weight:anchor.weight||anchor.oneRepMax,repetitions:anchor.repetitions||1,repsRemaining:anchor.repsRemaining||0,weightEntryType:"Total Weight",date:new Date().toISOString().slice(0,10),estimatedOneRepMax:anchor.oneRepMax};if(existing>=0)onboardingDraft.strengthBaselines[existing]=baseline;else onboardingDraft.strengthBaselines.push(baseline);});
  onboardingDraft.onboardingStatus={completed:true,dismissedUntil:null,currentStep:1,declined:false};onboardingDraft.createdAt||=now;onboardingDraft.updatedAt=now;data.profile=structuredClone(onboardingDraft);document.querySelector("#onboardingDialog").close();saveData();
}

document.querySelector("#onboardingContinueButton").onclick=()=>{
  if(onboardingMode==="quick")return finishQuickStrengthSetup();
  if(onboardingMode==="choice")return;
  if(onboardingStep===4)return fitnessLegacy.finishOnboarding();
  fitnessLegacy.saveOnboardingStep();onboardingStep++;onboardingDraft.onboardingStatus.currentStep=onboardingStep;renderOnboardingStep();
};
document.querySelector("#onboardingBackButton").onclick=()=>{
  if(onboardingMode==="quick"){saveQuickStrengthDraft(false);onboardingMode="choice";return renderOnboardingStep();}
  if(onboardingMode==="advanced"&&(onboardingStep<=1||advancedBaselinesOnly)){onboardingMode="choice";advancedBaselinesOnly=false;return renderOnboardingStep();}
  if(onboardingMode==="advanced"){fitnessLegacy.saveOnboardingStep();onboardingStep--;renderOnboardingStep();}
};

function bigThreeEstimate(exercise) {
  const definition=definitionForExercise(exercise)||exercise,movement=movementBaselineCategory(definition),quick=data.profile?.quickStrengthProfile||{};
  const mapping={"Horizontal chest press":["bench",.72],"Incline chest press":["bench",.58],"Shoulder press":["bench",.42],"Triceps pushdown":["bench",.2],"Squat pattern":["squat",.72],"Leg press or hack squat":["squat",1.0],"Leg extension":["squat",.25],"Hip hinge":["deadlift",.68],"Leg curl":["deadlift",.2]};
  if(["Vertical pull","Horizontal row"].includes(movement)&&quick.pulling?.oneRepMax){const oneRm=quick.pulling.oneRepMax*.8;return recommendationResult(workingWeightFromOneRepMax(oneRm,exercise.minReps||definition.defaults?.minReps,exercise.maxReps||definition.defaults?.maxReps,exercise.targetRir??definition.defaults?.targetRIR,exercise.increment||definition.defaults?.weightIncrement||5),"Moderate confidence",`Conservative estimate from your optional ${quick.pulling.exerciseName} baseline. Confirm it with a calibration set.`,"medium",true);}
  const match=mapping[movement];if(!match||!quick[match[0]]?.oneRepMax)return null;
  let oneRm=quick[match[0]].oneRepMax*match[1];const entry=exerciseLoadType(exercise);if(entry==="Per Dumbbell")oneRm/=2;
  return recommendationResult(workingWeightFromOneRepMax(oneRm,exercise.minReps||definition.defaults?.minReps,exercise.maxReps||definition.defaults?.maxReps,exercise.targetRir??definition.defaults?.targetRIR,exercise.increment||definition.defaults?.weightIncrement||5),"Low confidence",`Conservative estimate anchored to your ${match[0]} strength. This is a starting point, not a precise prediction.`,"low",true);
}

startingWeightRecommendation = function(exercise) {
  const entry=exerciseLoadType(exercise);
  if(isStandardBodyweight(entry))return recommendationResult(0,"Bodyweight","No numeric load is required. Progress with repetitions, duration, or an approved harder variation.","high",false);
  const result=fitnessLegacy.startingWeightRecommendation(exercise);
  if(isAddedBodyweight(entry)&&!result.weight)return recommendationResult(0,"Bodyweight + added load","Begin with bodyweight and add load only when the prescribed rep range is controlled.","high",false);
  if(["low","calibration"].includes(result.confidence)||result.label==="Conservative starting estimate"||result.label==="Starting weight needed")return bigThreeEstimate(exercise)||result;
  return result;
};

recommendationFor = function(exercise) {
  const mode=exercise.progressionMode||definitionForExercise(exercise)?.progressionMode||"manual",entry=exerciseLoadType(exercise),prior=latestExerciseResult(exercise.id);
  if(!prior)return fitnessLegacy.recommendationFor(exercise);
  const completed=(prior.sets||[]).filter(set=>set.done),allAtTop=completed.length===(prior.sets||[]).length&&completed.every(set=>Number(set.reps)>=Number(exercise.maxReps));
  if(mode==="reps"||mode==="harder_variation")return{weight:isStandardBodyweight(entry)?0:Number(prior.weight)||0,note:allAtTop?(exercise.name==="Hand-Release Push-Up"?"Keep bodyweight and improve repeatable reps":"Top of range reached — add reps, or review a harder variation or added load before changing the exercise"):"Keep the variation and add reps"};
  if(mode==="duration")return{weight:0,note:allAtTop?"Increase hold duration conservatively":"Keep the variation and build duration"};
  if(mode==="assisted_reduction"){const increment=Number(exercise.increment||5);return{weight:allAtTop?Math.max(0,Number(prior.weight)-increment):Number(prior.weight),note:allAtTop?`Reduce assistance by ${increment} lb`:`Keep assistance and add reps`};}
  return fitnessLegacy.recommendationFor(exercise);
};

let restTimerInterval=null;
function restTimerRemaining(timer=currentSession?.restTimer) {
  if(!timer)return 0;if(timer.status==="paused")return Math.max(0,Number(timer.remainingSeconds)||0);if(timer.status==="complete")return 0;return Math.max(0,Math.ceil((new Date(timer.endsAt).getTime()-Date.now())/1000));
}
function formatRestTimer(seconds){const value=Math.max(0,Math.ceil(seconds));return`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;}
function playRestCompletionTone(){if(!data.settings.restTimerAlerts.tone)return;try{const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return;const context=new AudioContextClass(),osc=context.createOscillator(),gain=context.createGain();osc.frequency.value=660;gain.gain.value=.05;osc.connect(gain);gain.connect(context.destination);osc.start();osc.stop(context.currentTime+.18);}catch{}}
function completeRestTimer(timer){timer.status="complete";timer.remainingSeconds=0;if(timer.completionAlerted)return;timer.completionAlerted=true;if(data.settings.restTimerAlerts.vibration&&navigator.vibrate)navigator.vibrate([180,80,180]);playRestCompletionTone();persistActiveWorkout(true);}
function updateRestTimerUi(){const panel=document.querySelector("#restTimerPanel");if(!panel)return;const timer=currentSession?.restTimer;if(!timer){panel.classList.add("hidden");return;}panel.classList.remove("hidden");const remaining=restTimerRemaining(timer);if(timer.status==="running"&&remaining<=0)completeRestTimer(timer);panel.classList.toggle("complete",timer.status==="complete");document.querySelector("#restTimerValue").textContent=timer.status==="complete"?"READY":formatRestTimer(remaining);document.querySelector("#restTimerContext").textContent=timer.status==="complete"?`Rest complete • ${timer.exerciseName}`:`${timer.exerciseName} • After Set ${timer.afterSet}${timer.nextText?` • Next: ${timer.nextText}`:""}`;document.querySelector("#restTimerPause").textContent=timer.status==="paused"?"Resume":"Pause";}
function ensureRestTimerTicker(){if(restTimerInterval)clearInterval(restTimerInterval);restTimerInterval=setInterval(updateRestTimerUi,250);}
function startExerciseRestTimer(exercise,setIndex){const {prescription,definition}=sessionExerciseDefinition(exercise),duration=Math.max(0,Number(prescription.rest??definition.defaults?.restSeconds??data.settings.rest));if(!duration)return;const nextSet=exercise.sets.findIndex((set,index)=>index>setIndex&&!set.done);const nextText=nextSet>=0?`Set ${nextSet+1} • ${prescription.minReps||definition.defaults?.minReps}-${prescription.maxReps||definition.defaults?.maxReps} ${exerciseRepLabel(exercise)}`:"Next exercise";currentSession.restTimer={status:"running",exerciseId:exercise.exerciseId,exerciseName:exercise.name,afterSet:setIndex+1,durationSeconds:duration,remainingSeconds:duration,startedAt:new Date().toISOString(),endsAt:new Date(Date.now()+duration*1000).toISOString(),nextText,completionAlerted:false};persistActiveWorkout(true);updateRestTimerUi();ensureRestTimerTicker();}
function adjustRestTimer(seconds){const timer=currentSession?.restTimer;if(!timer)return;const remaining=restTimerRemaining(timer)+seconds;timer.remainingSeconds=remaining;if(timer.status!=="paused"){timer.status="running";timer.endsAt=new Date(Date.now()+remaining*1000).toISOString();}timer.completionAlerted=false;persistActiveWorkout(true);updateRestTimerUi();}

function enhanceBodyweightLiveWorkout() {
  currentSession.exercises.forEach((exercise,index)=>{
    const entry=exerciseLoadType(sessionExerciseDefinition(exercise).prescription),card=document.querySelectorAll("#sessionExerciseList > .exercise-card")[index];if(!card)return;
    const todayLoad = card.querySelector(".today-prescription strong");
    if(isStandardBodyweight(entry)){exercise.weight=0;exercise.sets.forEach(set=>set.weight=0);card.querySelector(".recommended-weight-field")?.classList.add("hidden");if(todayLoad)todayLoad.textContent="Bodyweight";}
    else if(isAddedBodyweight(entry)||isAssistedBodyweight(entry)){if(todayLoad)todayLoad.textContent=workoutLoadText(exercise,exercise.weight);}
    card.querySelectorAll(".live-set-card").forEach((setCard,setIndex)=>{const weightLabel=setCard.querySelector(".set-weight-input")?.closest("label");if(isStandardBodyweight(entry)&&weightLabel){weightLabel.replaceWith(Object.assign(document.createElement("div"),{className:"bodyweight-load-display",innerHTML:"<span>Load</span><strong>Bodyweight</strong>"}));}else if(weightLabel){weightLabel.childNodes[0].textContent=`${weightEntryLabel(entry)} (${weightUnit(data.profile?.units)})`;}
      if(exerciseRepUnit(exercise)==="seconds"){const reps=setCard.querySelector(".set-reps-input")?.closest("label");if(reps)reps.childNodes[0].textContent="Duration (seconds)";}
      const button=setCard.querySelector(".complete-set-card");if(button){const original=button.onclick;button.onclick=()=>{const completing=!exercise.sets[setIndex].done;original();if(completing&&exercise.sets[setIndex].done)startExerciseRestTimer(exercise,setIndex);};}
    });
  });
}

renderSession = function(){fitnessLegacy.renderSession();if(!currentSession)return;enhanceBodyweightLiveWorkout();updateRestTimerUi();ensureRestTimerTicker();};
beginWorkout = function(...args){const result=fitnessLegacy.beginWorkout(...args);if(currentSession&&!currentSession.restTimer)currentSession.restTimer=null;return result;};
finishWorkout = function(){const result=fitnessLegacy.finishWorkout();if(!currentSession&&restTimerInterval){clearInterval(restTimerInterval);restTimerInterval=null;}return result;};

function bindRestTimerControls(){document.querySelector("#restTimerPause").onclick=()=>{const timer=currentSession?.restTimer;if(!timer||timer.status==="complete")return;if(timer.status==="paused"){timer.status="running";timer.endsAt=new Date(Date.now()+Number(timer.remainingSeconds)*1000).toISOString();}else{timer.remainingSeconds=restTimerRemaining(timer);timer.status="paused";timer.endsAt=null;}persistActiveWorkout(true);updateRestTimerUi();};document.querySelector("#restTimerSkip").onclick=()=>{const timer=currentSession?.restTimer;if(!timer)return;timer.status="complete";timer.remainingSeconds=0;timer.completionAlerted=true;persistActiveWorkout(true);updateRestTimerUi();};document.querySelector("#restTimerAdd15").onclick=()=>adjustRestTimer(15);document.querySelector("#restTimerAdd30").onclick=()=>adjustRestTimer(30);document.querySelector("#restTimerRestart").onclick=()=>{const timer=currentSession?.restTimer;if(!timer)return;timer.status="running";timer.remainingSeconds=timer.durationSeconds;timer.startedAt=new Date().toISOString();timer.endsAt=new Date(Date.now()+timer.durationSeconds*1000).toISOString();timer.completionAlerted=false;persistActiveWorkout(true);updateRestTimerUi();};}

function bindRestPreferences(){const preferences=data.settings.restTimerAlerts;const vibration=document.querySelector("#restVibration"),tone=document.querySelector("#restCompletionTone");vibration.checked=preferences.vibration;tone.checked=preferences.tone;vibration.onchange=()=>{preferences.vibration=vibration.checked;saveData();};tone.onchange=()=>{preferences.tone=tone.checked;saveData();};}

function bindManualWorkoutStartingWeights() {
  const form = document.querySelector("#workoutForm");
  const legacySubmit = form.onsubmit;
  form.onsubmit = event => {
    form.querySelectorAll(".exercise-editor-card").forEach(card => {
      const metadata = JSON.parse(card.dataset.exerciseMetadata || "{}");
      const entered = internalWeightValue(card.querySelector(".exercise-weight").value, data.profile?.units);
      const entry = metadata.weightEntryType || "Total Weight";
      if (entered > 0 && !isStandardBodyweight(entry)) {
        metadata.startingWeightRecommendation = recommendationResult(entered,"Manual starting weight","Saved directly in this workout prescription.","manual",false);
        card.dataset.exerciseMetadata = JSON.stringify(metadata);
      }
    });
    return legacySubmit.call(form,event);
  };
}

normalizeFitnessEnhancementData();
injectFitnessEnhancementUi();
bindCustomExerciseValidation();
bindManualWorkoutStartingWeights();
document.querySelector("#customPrimaryMuscle").onchange=updateCustomExerciseControls;
document.querySelector("#customLoadType").onchange=updateCustomExerciseControls;
document.querySelector("#customExerciseForm").onsubmit=saveCustomExerciseForm;
document.querySelector("#closeCustomExerciseButton").onclick=closeCustomExerciseForm;
document.querySelector("#customExerciseDialog").addEventListener("cancel",event=>{event.preventDefault();closeCustomExerciseForm();});
document.querySelector("#createCustomExerciseButton").onclick=createCustomExercise;
document.querySelector("#addExerciseButton").onclick=()=>openCustomExerciseForm(definition=>addExerciseEditor(exerciseDefinitionToPrescription(definition)));
bindRestTimerControls();bindRestPreferences();enhanceMesoCustomActions();renderAll();
if (document.querySelector("#onboardingDialog").open && !data.profile?.onboardingStatus?.completed) {
  onboardingMode = "choice";
  renderOnboardingStep();
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden)updateRestTimerUi();});
