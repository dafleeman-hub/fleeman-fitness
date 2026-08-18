
const STORAGE_KEY = "fleemanFitnessDataV1";
const APP_VERSION = "1.6.0-beta";
let previewReturnFocus = null;
let previewScrollPosition = 0;
const defaultData = {
  settings: { increment: 5, rest: 90, autoCollapseExercises: true, restTimerAlerts: { vibration: true, tone: false } },
  ui: { activeView: "homeView", librarySection: "premade" },
  selectedWorkoutId: "push-a",
  activeWorkoutSession: null,
  mesocycles: { drafts: [], active: null, completed: [] },
  exerciseLibraryUser: { favorites: [], recent: [], customExercises: [], exercisePreferences: {} },
  profile: {
    id:"local-user",displayName:"",units:"imperial",height:{value:null,unit:"in"},bodyWeight:{value:null,unit:"lb"},age:null,gender:"",experienceLevel:"",yearsExperience:null,
    trainingBackground:{barbell:"",dumbbell:"",machines:"",structuredPrograms:"",comfortableWithRIR:false,knownWorkingWeights:"unknown"},currentTrainingDays:null,preferredTrainingDays:null,primaryGoal:"",customGoal:"",
    strengthBaselines:[],quickStrengthProfile:{bench:null,squat:null,deadlift:null,pulling:null},skippedBaselineCategories:[],startingWeightRecommendations:[],calibrationHistory:[],recalculationHistory:[],onboardingStatus:{completed:false,dismissedUntil:null,currentStep:1,declined:false},createdAt:"",updatedAt:""
  },
  workouts: [
    {
      id: "push-a",
      name: "Chest, Shoulders, and Triceps",
      notes: "Chest, shoulders, triceps",
      exercises: [
        { id: crypto.randomUUID(), name: "Barbell Bench Press", sets: 3, minReps: 8, maxReps: 10, startWeight: 135 },
        { id: crypto.randomUUID(), name: "Incline Dumbbell Press", sets: 3, minReps: 8, maxReps: 12, startWeight: 40 },
        { id: crypto.randomUUID(), name: "Seated Dumbbell Press", sets: 3, minReps: 8, maxReps: 12, startWeight: 25 },
        { id: crypto.randomUUID(), name: "Triceps Extension", sets: 3, minReps: 10, maxReps: 15, startWeight: 30 }
      ]
    },
    {
      id: "pull-a",
      name: "Back and Biceps",
      notes: "Back and biceps",
      exercises: [
        { id: crypto.randomUUID(), name: "Lat Pulldown", sets: 3, minReps: 8, maxReps: 12, startWeight: 100 },
        { id: crypto.randomUUID(), name: "Dumbbell Row", sets: 3, minReps: 8, maxReps: 12, startWeight: 45 },
        { id: crypto.randomUUID(), name: "Rear Delt Raise", sets: 3, minReps: 12, maxReps: 20, startWeight: 15 },
        { id: crypto.randomUUID(), name: "Dumbbell Curl", sets: 3, minReps: 10, maxReps: 15, startWeight: 20 }
      ]
    },
    {
      id: "legs-a",
      name: "Quads, Hamstrings, and Calves",
      notes: "Quads, hamstrings, calves",
      exercises: [
        { id: crypto.randomUUID(), name: "Back Squat", sets: 3, minReps: 6, maxReps: 10, startWeight: 135 },
        { id: crypto.randomUUID(), name: "Romanian Deadlift", sets: 3, minReps: 8, maxReps: 12, startWeight: 95 },
        { id: crypto.randomUUID(), name: "Split Squat", sets: 3, minReps: 8, maxReps: 12, startWeight: 20 },
        { id: crypto.randomUUID(), name: "Standing Calf Raise", sets: 3, minReps: 12, maxReps: 20, startWeight: 40 }
      ]
    }
  ],
  history: []
};

let data = loadData();
migrateExerciseReferences(data);
data.ui = migrateNavigationState(data.ui || {});
if (migrateBuiltInWorkoutNames(data)) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
let currentSession = null;
let deferredPrompt = null;
let pendingWorkoutId = null;
let recommendedWorkoutId = null;
let pendingWorkoutContext = null;
let sorenessAnswers = {};
let pendingSorenessPlan = null;
let waitingServiceWorker = null;
let updateReloading = false;
let exerciseLibraryContext = { type: "browse" };
let exerciseLibraryFilters = { search: "", muscle: "", equipment: "", loadType: "", type: "", favorites: false, recent: false };
let exercisePreviewReturnFocus = null;
let previewedProgramTemplate = null;
let programPreviewReturnFocus = null;
let pendingProgramTemplate = null;
let onboardingStep = 1;
let onboardingDraft = null;

const muscleGroups = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core", "traps", "forearms", "adductors", "abductors", "lower back"];
const muscleLabels = {
  chest: "Chest", back: "Back", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps", arms: "Arms",
  quads: "Quads", hamstrings: "Hamstrings", glutes: "Glutes", calves: "Calves", core: "Core", traps: "Traps", forearms: "Forearms", adductors: "Adductors", abductors: "Abductors", "lower back": "Lower Back"
};

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && isValidBackup(saved) ? mergeWithDefaults(saved) : structuredClone(defaultData);
  } catch {
    return structuredClone(defaultData);
  }
}

function migrateNavigationState(ui) {
  const oldValue = ui.activeView || ui.activeTab || ui.selectedTab || "homeView";
  const routeMap = {
    home: "homeView", homeView: "homeView",
    programs: "builderView", programsView: "programsView",
    workouts: "programsView", builderView: "builderView",
    library: "builderView", libraryView: "builderView",
    build: "programsView", buildView: "programsView",
    history: "historyView", historyView: "historyView",
    profile: "profileView", profileView: "profileView"
  };
  const activeView = routeMap[oldValue] || "homeView";
  const allowedSections = ["premade", "workouts", "exercises", "favorites", "recent"];
  return { activeView, librarySection: allowedSections.includes(ui.librarySection) ? ui.librarySection : "premade" };
}

function migrateBuiltInWorkoutNames(target) {
  let changed = false;
  const starterNames = {
    "push-a": ["Push A", "Chest, Shoulders, and Triceps"],
    "pull-a": ["Pull A", "Back and Biceps"],
    "legs-a": ["Legs A", "Quads, Hamstrings, and Calves"]
  };
  (target.workouts || []).forEach(workout => {
    const update = starterNames[workout.id];
    if (update && workout.name === update[0]) {
      workout.name = update[1];
      changed = true;
    }
  });

  const legacyNames = {
    "balanced-hypertrophy-4-day": ["Upper A", "Lower A", "Upper B", "Lower B"],
    "upper-body-focus-4-day": ["Upper Push Focus", "Lower Maintenance", "Upper Pull Focus", "Upper Mixed"],
    "lower-body-focus-4-day": ["Lower Quad Focus", "Upper Maintenance", "Lower Hamstring and Glute Focus", "Lower Mixed"],
    "chest-focus-4-day": ["Chest and Triceps", "Lower Body", "Back and Biceps", "Upper Body with Chest Focus"],
    "back-focus-4-day": ["Back and Biceps", "Lower Body", "Chest and Shoulders", "Upper Body with Back Focus"]
  };
  const mesocycles = [
    ...(target.mesocycles?.drafts || []),
    ...(target.mesocycles?.active ? [target.mesocycles.active] : []),
    ...(target.mesocycles?.completed || [])
  ];
  mesocycles.forEach(mesocycle => {
    const template = PREMADE_PROGRAM_TEMPLATES.find(item => item.id === mesocycle.sourceTemplateId);
    const previousNames = legacyNames[mesocycle.sourceTemplateId];
    if (!template || !previousNames || Number(mesocycle.sourceTemplateVersion || 1) >= PROGRAM_TEMPLATE_VERSION) return;
    template.schedule.forEach((templateDay, index) => {
      const savedDay = (mesocycle.schedule || []).find(day => Number(day.dayIndex) === Number(templateDay.dayIndex)) || mesocycle.schedule?.[index];
      if (savedDay?.workout?.name === previousNames[index]) {
        savedDay.workout.name = templateDay.workout.name;
        changed = true;
      }
    });
    mesocycle.sourceTemplateVersion = PROGRAM_TEMPLATE_VERSION;
    changed = true;
  });
  return changed;
}

function isValidBackup(candidate) {
  return Boolean(
    candidate &&
    typeof candidate === "object" &&
    candidate.settings &&
    Number.isFinite(Number(candidate.settings.increment)) &&
    Number.isFinite(Number(candidate.settings.rest)) &&
    Array.isArray(candidate.workouts) &&
    candidate.workouts.every(workout =>
      workout &&
      typeof workout.id === "string" &&
      typeof workout.name === "string" &&
      Array.isArray(workout.exercises) &&
      workout.exercises.every(exercise =>
        exercise &&
        typeof exercise.id === "string" &&
        typeof exercise.name === "string" &&
        Number.isFinite(Number(exercise.sets)) &&
        Number.isFinite(Number(exercise.minReps)) &&
        Number.isFinite(Number(exercise.maxReps)) &&
        Number.isFinite(Number(exercise.startWeight))
      )
    ) &&
    Array.isArray(candidate.history)
  );
}

function mergeWithDefaults(saved) {
  const merged = {
    ...structuredClone(defaultData),
    ...saved,
    settings: { ...defaultData.settings, ...saved.settings, restTimerAlerts: { ...defaultData.settings.restTimerAlerts, ...(saved.settings?.restTimerAlerts || {}) } },
    ui: { ...defaultData.ui, ...(saved.ui || {}) },
    exerciseLibraryUser: { ...structuredClone(defaultData.exerciseLibraryUser), ...(saved.exerciseLibraryUser || {}) },
    profile: {...structuredClone(defaultData.profile),...(saved.profile||{}),quickStrengthProfile:{...defaultData.profile.quickStrengthProfile,...(saved.profile?.quickStrengthProfile||{})},trainingBackground:{...defaultData.profile.trainingBackground,...(saved.profile?.trainingBackground||{})},onboardingStatus:{...defaultData.profile.onboardingStatus,...(saved.profile?.onboardingStatus||{})}}
  };
  migrateExerciseReferences(merged);
  return merged;
}

function normalizedExerciseName(name="") { return name.toLowerCase().replace(/[^a-z0-9]+/g,"").trim(); }
function allExerciseDefinitions() { return [...COMMERCIAL_GYM_EXERCISES, ...(data.exerciseLibraryUser?.customExercises || [])]; }
function exerciseRepUnit(exercise={}) { const definition=typeof definitionForExercise==="function"?definitionForExercise(exercise):null;return exercise.repUnit||exercise.defaults?.repUnit||definition?.repUnit||definition?.defaults?.repUnit||(exercise.progressionMode==="duration"||exercise.defaults?.progressionMode==="duration"||definition?.progressionMode==="duration"||definition?.defaults?.progressionMode==="duration"?"seconds":"reps"); }
function exerciseRepLabel(exercise={}) { return exerciseRepUnit(exercise) === "seconds" ? "sec" : "reps"; }
function exerciseHistorySummary(exercise={}) {
  const completed = (exercise.sets || []).filter(set => set.done);
  const last = completed[completed.length - 1];
  const definition = typeof definitionForExercise === "function" ? definitionForExercise(exercise) : null;
  const entry = exercise.weightEntryType || definition?.defaults?.weightEntryType || "Total Weight";
  const amount = `${displayWeightValue(last?.weight ?? exercise.weight ?? 0,data.profile?.units)} ${weightUnit(data.profile?.units)}`;
  const load = entry === "Bodyweight" ? "Bodyweight" : entry === "Bodyweight + Added Weight" || entry === "Bodyweight Plus Added Weight" ? `Bodyweight + ${amount}` : entry === "Assisted Bodyweight" ? `${amount} assistance` : amount;
  return `${escapeHtml(exercise.name)}: ${escapeHtml(load)}${last ? ` × ${Number(last.reps) || 0} ${exerciseRepLabel(exercise)}` : ""}`;
}
function migrateExerciseReferences(target=data) {
  const byName = new Map(COMMERCIAL_GYM_EXERCISES.map(exercise => [normalizedExerciseName(exercise.name),exercise.id]));
  const migrate = exercise => { if(!exercise.libraryExerciseId) exercise.libraryExerciseId=byName.get(normalizedExerciseName(exercise.name))||null; return exercise; };
  target.workouts?.forEach(workout=>workout.exercises?.forEach(migrate));
  [target.mesocycles?.active,...(target.mesocycles?.drafts||[]),...(target.mesocycles?.completed||[])].filter(Boolean).forEach(meso=>meso.schedule?.forEach(slot=>slot.workout?.exercises?.forEach(migrate)));
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderAll();
}

function latestExerciseResult(exerciseId) {
  for (const session of data.history) {
    const result = session.exercises.find(e => e.exerciseId === exerciseId);
    if (result) return result;
  }
  return null;
}

function jointPainPlanFor(exerciseId) {
  const results = data.history.flatMap(session => session.exercises
    .filter(exercise => exercise.exerciseId === exerciseId && exercise.jointPain)
    .map(exercise => ({ ...exercise.jointPain, week: session.mesocycle?.week, mesocycleId: session.mesocycle?.mesocycleId })));
  if (!results.length) return { rating: 1, joints: [], note: "" };
  const latest = results[0];
  let rating = Number(latest.rating || 1);
  if (latest.week != null) rating = Math.max(...results.filter(result => result.week === latest.week && result.mesocycleId === latest.mesocycleId).map(result => Number(result.rating || 1)));
  if (rating === 2 && Number(results[1]?.rating) === 2) rating = 3;
  const weekly = {};
  results.forEach(result => { if (result.week != null) weekly[result.week] = Math.max(weekly[result.week] || 0, Number(result.rating)); });
  const weeks = Object.keys(weekly).map(Number).sort((a,b)=>b-a);
  const replaceRemainder = weeks.length > 1 && weekly[weeks[0]] >= 3 && weekly[weeks[1]] >= 3 && weeks[0] - weeks[1] === 1;
  return { rating, joints: latest.joints || [], replaceRemainder, history: results.slice(0,5) };
}

function definitionForExercise(exercise){return allExerciseDefinitions().find(item=>item.id===exercise.libraryExerciseId)||allExerciseDefinitions().find(item=>normalizedExerciseName(item.name)===normalizedExerciseName(exercise.name));}
function workoutSplitLabel(workout,fallback="TRAINING DAY"){const enriched={...(workout||{}),exercises:(workout?.exercises||[]).map(exercise=>({...definitionForExercise(exercise),...exercise,sets:Array.isArray(exercise.sets)?exercise.sets.length:exercise.sets}))};return FleemanWorkoutClassifier.workoutDisplayLabel(enriched,fallback);}
function recommendationResult(weight,label,reason,confidence,calibrationRecommended=false){return{weight:Math.max(0,Number(weight)||0),label,reason,confidence,calibrationRecommended};}

function hasPriorExerciseUse(exercise) {
  const definition = definitionForExercise(exercise) || exercise;
  const libraryExerciseId = exercise.libraryExerciseId || definition.id || null;
  const exerciseName = normalizedExerciseName(exercise.name || definition.name || "");
  const matchesExercise = item =>
    (libraryExerciseId && item.libraryExerciseId === libraryExerciseId) ||
    normalizedExerciseName(item.name || item.exerciseName || "") === exerciseName;
  const completedInHistory = data.history.some(session =>
    session.exercises?.some(item => matchesExercise(item) && item.sets?.some(set => set.done))
  );
  if (completedInHistory) return true;
  return (data.profile?.calibrationHistory || []).some(item => matchesExercise(item));
}

function startingWeightCalibrationEligible(exercise, context = null) {
  return Boolean(context?.mesocycleId) && Number(context?.week) === 1 && !hasPriorExerciseUse(exercise);
}

function startingWeightRecommendation(exercise){
  const definition=definitionForExercise(exercise)||exercise;const entry=exercise.weightEntryType||definition.defaults?.weightEntryType||"Total Weight";const increment=exercise.increment||definition.defaults?.weightIncrement||data.settings.increment;
  if(entry==="Bodyweight"||entry==="Bodyweight Plus Added Weight")return recommendationResult(0,"Bodyweight","This movement begins with bodyweight unless reliable added-weight history exists.","high",false);
  for(const session of data.history){const result=session.exercises.find(item=>(item.libraryExerciseId&&item.libraryExerciseId===definition.id)||normalizedExerciseName(item.name)===normalizedExerciseName(exercise.name));if(!result)continue;const successful=result.sets?.some(set=>set.done)&&result.feedback!=="failed"&&Number(result.jointPain?.rating||1)<4;if(successful)return recommendationResult(result.weight,"Based on your exercise history","Most recent successful completed session for this exact exercise.","high",false);}
  const calibrated=(data.profile?.calibrationHistory||[]).slice().reverse().find(item=>(item.libraryExerciseId===definition.id||normalizedExerciseName(item.exerciseName)===normalizedExerciseName(exercise.name))&&Number(item.finalAcceptedWeight||item.recommendedNextWeight)>0&&!['unsafe','joint-pain'].includes(item.result));if(calibrated)return recommendationResult(calibrated.finalAcceptedWeight||calibrated.recommendedNextWeight,"Based on your exercise history","Most recent accepted calibration for this exact exercise.","high",false);
  for(const mesocycle of data.mesocycles?.completed||[]){for(const slot of mesocycle.schedule||[]){const prior=slot.workout?.exercises?.find(item=>item.libraryExerciseId===definition.id&&Number(item.startWeight)>0);if(prior)return recommendationResult(prior.startWeight,"Based on your previous mesocycle","Most recent completed mesocycle prescription for this exercise.","high",false);}}
  const baselines=data.profile?.strengthBaselines||[];const exact=baselines.slice().reverse().find(item=>item.exerciseId===definition.id&&Number(item.weight)>0);if(exact){const oneRm=estimatedOneRepMax(exact.weight,exact.repetitions,exact.repsRemaining);return recommendationResult(workingWeightFromOneRepMax(oneRm,exercise.minReps||definition.defaults?.minReps,exercise.maxReps||definition.defaults?.maxReps,exercise.targetRir??definition.defaults?.targetRIR,increment),"Based on your strength baseline","Calculated from your entered weight, repetitions, and estimated repetitions remaining.","high",false);}
  if(definition.sourceType==="custom"&&(!definition.movementPattern||!definition.substitutionFamily||!definition.defaults?.weightEntryType))return recommendationResult(0,"Starting weight needed","Add movement category, weight-entry type, and substitution-family metadata or complete a calibration set.","calibration",true);
  const family=definition.substitutionFamily;for(const session of data.history){const source=session.exercises.find(item=>{const sourceDefinition=definitionForExercise(item);return sourceDefinition&&sourceDefinition.id!==definition.id&&sourceDefinition.substitutionFamily===family&&item.sets?.some(set=>set.done)&&Number(item.jointPain?.rating||1)<4;});if(source){const sourceDefinition=definitionForExercise(source);const sameEntry=(sourceDefinition.defaults?.weightEntryType||source.weightEntryType)==entry;const factor=EXERCISE_TRANSFER_FACTORS.find(item=>item.sourceFamily===family&&item.targetFamily===family);if(sameEntry&&factor){const reps=source.sets.find(set=>set.done)?.reps||8;const oneRm=estimatedOneRepMax(source.weight,reps,source.targetRir||2)*factor.ratio;return recommendationResult(workingWeightFromOneRepMax(oneRm,exercise.minReps||definition.defaults?.minReps,exercise.maxReps||definition.defaults?.maxReps,exercise.targetRir??definition.defaults?.targetRIR,increment),"Estimated from a similar exercise",factor.notes,"medium",true);}}}
  const movement=movementBaselineCategory(definition);const related=baselines.slice().reverse().find(item=>item.movementCategory===movement&&Number(item.weight)>0&&(item.weightEntryType||"Total Weight")===entry);if(related){const oneRm=estimatedOneRepMax(related.weight,related.repetitions,related.repsRemaining);return recommendationResult(workingWeightFromOneRepMax(oneRm,exercise.minReps||definition.defaults?.minReps,exercise.maxReps||definition.defaults?.maxReps,exercise.targetRir??definition.defaults?.targetRIR,increment),"Estimated from your movement baseline",`Estimated from your ${movement.toLowerCase()} baseline; equipment differences require confirmation.`,"medium",true);}
  const estimate=conservativeProfileEstimate({...definition,...exercise},data.profile);if(estimate&&estimate.weight>0)return recommendationResult(estimate.weight,"Conservative starting estimate",entry==="Machine Stack"?"Machine stacks vary by gym. Confirm this weight with a calibration set.":"Low-confidence test load based on body weight, experience, equipment, and movement category. Gender is not used.","low",true);
  return recommendationResult(0,"Starting weight needed","Not enough reliable information is available. Complete a calibration set or enter a weight manually.","calibration",true);
}

function recommendationFor(exercise) {
  const prior = latestExerciseResult(exercise.id);
  if (!prior) {const starting=exercise.startingWeightRecommendation|| (Number(exercise.startWeight)>0?recommendationResult(exercise.startWeight,"Saved starting weight","Saved with this workout prescription.","medium",false):startingWeightRecommendation(exercise));return{weight:starting.weight,note:starting.label,starting};}

  const completed = prior.sets.filter(s => s.done);
  const allAtTop = completed.length === prior.sets.length && completed.every(s => s.reps >= exercise.maxReps);
  const missedBottom = completed.some(s => s.reps < exercise.minReps);
  const hard = prior.feedback === "very-hard" || prior.feedback === "failed";
  const increment = Number(exercise.increment ?? data.settings.increment);
  let recommendation = allAtTop && !hard
    ? { weight: Number(prior.weight) + increment, note: `Increase by ${increment} lb` }
    : missedBottom || prior.feedback === "failed"
      ? { weight: Math.max(0, Number(prior.weight) - increment), note: "Reduce slightly and rebuild" }
      : { weight: Number(prior.weight), note: "Keep weight, add reps" };
  const pain = jointPainPlanFor(exercise.id);
  if (pain.rating === 2) recommendation = { weight: Number(prior.weight), note: "Minor discomfort reported — monitor the joint", pain };
  if (pain.rating === 3) recommendation = { weight: Math.max(0, Math.round(Number(prior.weight) * .925 / 2.5) * 2.5), note: "Noticeable pain — reduced load; review technique", pain };
  if (pain.rating === 4) recommendation = { weight: Math.max(0, Math.round(Number(prior.weight) * .825 / 2.5) * 2.5), note: "Significant pain — replacement recommended", pain };
  if (pain.rating >= 5) recommendation = { weight: 0, note: "Severe pain — replacement or skip required", pain };
  return { ...recommendation, pain: recommendation.pain || pain };
}

function renderAll() {
  renderHome();
  renderLibrary();
  renderHistory();
  if (typeof renderPrograms === "function") renderPrograms();
  document.querySelector("#defaultIncrement").value = data.settings.increment;
  document.querySelector("#defaultRest").value = data.settings.rest;
  document.querySelector("#autoCollapseExercises").checked = data.settings.autoCollapseExercises !== false;
  document.querySelector("#appVersion").textContent = APP_VERSION;
  renderProfile();
  renderUpdateNotice();
}

function profileDisplayMeasurement(measurement,metricUnit){if(measurement?.value==null)return"Not provided";if(metricUnit==="cm")return`${Math.round(Number(measurement.value)*2.54)} cm`;if(metricUnit==="kg")return`${Math.round(Number(measurement.value)/2.20462*10)/10} kg`;return`${measurement.value} ${measurement.unit}`;}
function renderProfile(){const profile=data.profile||defaultData.profile;const complete=profile.onboardingStatus?.completed;const unit=weightUnit(profile.units);document.querySelector("#profileSummary").innerHTML=`<div class="panel"><div class="workout-card-top"><div><h3>${escapeHtml(profile.displayName||"Local user")}</h3><p>${complete?"Profile setup complete":"Profile setup incomplete"}</p></div><span class="confidence-label">${complete?"Complete":"Needs setup"}</span></div><p>${profile.units==="metric"?profileDisplayMeasurement(profile.height,"cm"):profileDisplayMeasurement(profile.height)} • ${profile.units==="metric"?profileDisplayMeasurement(profile.bodyWeight,"kg"):profileDisplayMeasurement(profile.bodyWeight)} • ${profile.age?`${profile.age} years old`:"Age not provided"}</p><p>${profile.units==="metric"?"Kilograms and centimeters":"Pounds and inches"} • ${escapeHtml(profile.experienceLevel||"Experience not provided")} • ${escapeHtml(profile.primaryGoal||"Goal not provided")}</p></div><details class="panel profile-section"><summary>Training background</summary><p>Barbells: ${escapeHtml(profile.trainingBackground?.barbell||"Not provided")}</p><p>Dumbbells: ${escapeHtml(profile.trainingBackground?.dumbbell||"Not provided")}</p><p>Machines: ${escapeHtml(profile.trainingBackground?.machines||"Not provided")}</p><p>Structured programs: ${escapeHtml(profile.trainingBackground?.structuredPrograms||"Not provided")}</p><p>Preferred training days: ${profile.preferredTrainingDays??"Not provided"}</p></details><details class="panel profile-section"><summary>Strength baselines (${profile.strengthBaselines?.length||0})</summary>${profile.strengthBaselines?.length?profile.strengthBaselines.map(item=>`<p>${escapeHtml(item.exerciseName||item.movementCategory)}: ${displayWeightValue(item.weight,profile.units)} ${unit} × ${item.repetitions} reps, ${item.repsRemaining} RIR • ${escapeHtml(weightEntryLabel(item.weightEntryType))}</p>`).join(""):"<p>No strength baselines saved.</p>"}</details><div class="panel"><p class="small-note">Last updated: ${profile.updatedAt?new Date(profile.updatedAt).toLocaleString():"Not yet updated"}</p>${profile.gender?`<p class="small-note">Gender: ${escapeHtml(profile.gender)}. Gender is stored only as optional profile information and is not used as a strength multiplier.</p>`:""}</div>`;document.querySelector("#activeMesoProfileNotice").classList.toggle("hidden",!data.mesocycles?.active);}

function openOnboarding(step=1){onboardingStep=step;onboardingDraft=structuredClone(data.profile||defaultData.profile);renderOnboardingStep();const dialog=document.querySelector("#onboardingDialog");if(!dialog.open)dialog.showModal();}
function onboardingOption(value,label,current){return`<option value="${value}" ${current===value?"selected":""}>${label}</option>`;}
function renderOnboardingStep(){const profile=onboardingDraft;document.querySelector("#onboardingProgress").innerHTML=[1,2,3,4].map(step=>`<div class="step-pill ${step<=onboardingStep?"active":""}"></div>`).join("");document.querySelector("#onboardingProgress").setAttribute("aria-valuenow",String(onboardingStep));document.querySelector("#onboardingBackButton").disabled=onboardingStep===1;document.querySelector("#onboardingContinueButton").textContent=onboardingStep===4?"Finish setup":"Continue";const body=document.querySelector("#onboardingBody");
  if(onboardingStep===1){const metric=profile.units==="metric";body.innerHTML=`<h3>Step 1 of 4: Basic profile</h3><div class="onboarding-grid"><label class="wide">Display name<input id="profileName" value="${escapeHtml(profile.displayName||"")}"></label><label>Preferred units<select id="profileUnits">${onboardingOption("imperial","Pounds and inches",profile.units)}${onboardingOption("metric","Kilograms and centimeters",profile.units)}</select></label><label>Height (${metric?"cm":"in"})<input id="profileHeight" type="number" min="1" value="${profile.height.value==null?"":metric?Math.round(profile.height.value*2.54):profile.height.value}"></label><label>Body weight (${metric?"kg":"lb"})<input id="profileWeight" type="number" min="1" step="0.1" value="${profile.bodyWeight.value==null?"":metric?Math.round(profile.bodyWeight.value/2.20462*10)/10:profile.bodyWeight.value}"></label><label>Age<input id="profileAge" type="number" min="13" max="120" value="${profile.age||""}"></label><label>Gender (optional)<select id="profileGender">${onboardingOption("","Prefer not to say",profile.gender)}${onboardingOption("Male","Male",profile.gender)}${onboardingOption("Female","Female",profile.gender)}${onboardingOption("Custom","Custom or self-described",profile.gender==="Male"||profile.gender==="Female"||!profile.gender?"": "Custom")}</select></label><label>Custom gender (optional)<input id="profileCustomGender" value="${profile.gender&&!['Male','Female'].includes(profile.gender)?escapeHtml(profile.gender):""}"></label><label>Experience level<select id="profileExperience">${onboardingOption("brand-new","Brand new",profile.experienceLevel)}${onboardingOption("beginner","Beginner",profile.experienceLevel)}${onboardingOption("intermediate","Intermediate",profile.experienceLevel)}${onboardingOption("experienced","Experienced",profile.experienceLevel)}${onboardingOption("custom","Custom",profile.experienceLevel)}</select></label><label>Approximate years (optional)<input id="profileYears" type="number" min="0" step="0.5" value="${profile.yearsExperience??""}"></label></div><button id="continueWithoutProfileButton" class="secondary-button">Continue without a profile</button>`;document.querySelector("#profileUnits").onchange=()=>{saveOnboardingStep();renderOnboardingStep();};document.querySelector("#continueWithoutProfileButton").onclick=()=>{data.profile.onboardingStatus={...data.profile.onboardingStatus,declined:true,completed:false,dismissedUntil:null};document.querySelector("#onboardingDialog").close();saveData();};}
  if(onboardingStep===2){const b=profile.trainingBackground||{};body.innerHTML=`<h3>Step 2 of 4: Training background</h3><div class="onboarding-grid">${[["barbell","Barbell experience"],["dumbbell","Dumbbell experience"],["machines","Commercial-machine experience"],["structuredPrograms","Structured-program experience"]].map(([id,label])=>`<label>${label}<select id="background-${id}">${["Never","A little","Comfortable","Very experienced"].map(value=>onboardingOption(value,value,b[id])).join("")}</select></label>`).join("")}<label>Days currently training<input id="currentDays" type="number" min="0" max="7" value="${profile.currentTrainingDays??""}"></label><label>Days you want to train<input id="preferredDays" type="number" min="1" max="7" value="${profile.preferredTrainingDays??""}"></label><label class="wide"><span>Comfortable estimating reps in reserve?</span><select id="comfortableRir">${onboardingOption("no","No",b.comfortableWithRIR?"yes":"no")}${onboardingOption("yes","Yes",b.comfortableWithRIR?"yes":"no")}</select></label><label class="wide"><span>Are there exercises whose normal working weight you already know?</span><select id="knownWorkingWeights">${onboardingOption("unknown","I am not sure",b.knownWorkingWeights||"unknown")}${onboardingOption("no","No",b.knownWorkingWeights)}${onboardingOption("yes","Yes",b.knownWorkingWeights)}</select></label></div>`;}
  if(onboardingStep===3){body.innerHTML=`<h3>Step 3 of 4: Primary training goal</h3><label>Primary goal<select id="primaryGoal">${["Build muscle","Gain strength","General fitness","Return to training","Maintain current muscle","Custom goal"].map(value=>onboardingOption(value,value,profile.primaryGoal)).join("")}</select></label><label>Custom goal (optional)<input id="customGoal" value="${escapeHtml(profile.customGoal||"")}"></label><p class="small-note">Fleeman Fitness will continue prioritizing hypertrophy programming in this version.</p>`;}
  if(onboardingStep===4){const unit=weightUnit(profile.units);body.innerHTML=`<h3>Step 4 of 4: Known movement baselines</h3><p class="small-note">Optional. Add only movements whose normal working weight you know. You can skip any or every movement.</p><div class="baseline-card onboarding-grid"><label>Movement category<select id="baselineMovement">${MOVEMENT_BASELINE_CATEGORIES.map(value=>`<option>${value}</option>`).join("")}</select></label><label>Exact exercise<select id="baselineExercise"><option value="">Movement baseline only</option>${COMMERCIAL_GYM_EXERCISES.map(exercise=>`<option value="${exercise.id}">${escapeHtml(exercise.name)}</option>`).join("")}</select></label><label>Weight-entry type<select id="baselineEntryType">${["Total Weight","Per Dumbbell","Machine Stack","Plate-Loaded Total","Plate-Loaded Per Side","Bodyweight","Bodyweight Plus Added Weight","Assisted Bodyweight"].map(value=>`<option>${value}</option>`).join("")}</select></label><label>Weight (${unit})<input id="baselineWeight" type="number" min="0" step="0.5"></label><label>Repetitions completed<input id="baselineReps" type="number" min="1" max="30" value="8"></label><label>Estimated reps remaining<input id="baselineRir" type="number" min="0" max="10" value="2"></label><label>Date<input id="baselineDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label><div class="exercise-actions wide"><button id="addBaselineButton" class="secondary-button">Add strength baseline</button><button id="unknownBaselineButton" class="secondary-button">I do not know</button><button id="skipBaselineButton" class="secondary-button">Skip this movement</button></div></div><div id="onboardingBaselineList">${profile.strengthBaselines.length?profile.strengthBaselines.map(item=>`<p>${escapeHtml(item.exerciseName||item.movementCategory)}: ${displayWeightValue(item.weight,profile.units)} ${unit} × ${item.repetitions} reps • Estimated strength baseline ${displayWeightValue(item.estimatedOneRepMax,profile.units)} ${unit}</p>`).join(""):"<p>No baselines added. You can skip this step.</p>"}</div>`;document.querySelector("#addBaselineButton").onclick=addOnboardingBaseline;document.querySelector("#unknownBaselineButton").onclick=()=>{document.querySelector("#baselineWeight").value="";document.querySelector("#baselineWeight").focus();};document.querySelector("#skipBaselineButton").onclick=()=>{const movement=document.querySelector("#baselineMovement").value;profile.skippedBaselineCategories=[...new Set([...(profile.skippedBaselineCategories||[]),movement])];renderOnboardingStep();};document.querySelector("#baselineExercise").onchange=event=>{const definition=COMMERCIAL_GYM_EXERCISES.find(item=>item.id===event.target.value);if(!definition)return;document.querySelector("#baselineMovement").value=movementBaselineCategory(definition)||document.querySelector("#baselineMovement").value;document.querySelector("#baselineEntryType").value=definition.defaults.weightEntryType;};}
  if(onboardingStep===1)document.querySelector("#profileUnits").onchange=event=>{const nextUnits=event.target.value;event.target.value=profile.units;saveOnboardingStep();profile.units=nextUnits;renderOnboardingStep();};
  if(onboardingStep===4){FormValidation.setKey(document.querySelector("#baselineWeight"),"baseline.weight");FormValidation.setKey(document.querySelector("#baselineReps"),"baseline.repetitions");FormValidation.setKey(document.querySelector("#baselineRir"),"baseline.repsRemaining");FormValidation.setKey(document.querySelector("#baselineDate"),"baseline.date");FormValidation.bindLiveClear(document.querySelector("#onboardingDialog"),{isCorrected:isBaselineFieldCorrected});}
  body.querySelector("input,select,button")?.focus();
}

function saveOnboardingStep(){const profile=onboardingDraft;if(onboardingStep===1){const units=document.querySelector("#profileUnits").value;const height=Number(document.querySelector("#profileHeight").value)||null;const weight=Number(document.querySelector("#profileWeight").value)||null;profile.displayName=document.querySelector("#profileName").value.trim();profile.units=units;profile.height={value:height==null?null:units==="metric"?Math.round(height/2.54*10)/10:height,unit:"in"};profile.bodyWeight={value:weight==null?null:units==="metric"?Math.round(weight*2.20462*10)/10:weight,unit:"lb"};profile.age=Number(document.querySelector("#profileAge").value)||null;const gender=document.querySelector("#profileGender").value;profile.gender=gender==="Custom"?document.querySelector("#profileCustomGender").value.trim():gender;profile.experienceLevel=document.querySelector("#profileExperience").value;profile.yearsExperience=Number(document.querySelector("#profileYears").value)||null;}
  if(onboardingStep===2){for(const key of ["barbell","dumbbell","machines","structuredPrograms"])profile.trainingBackground[key]=document.querySelector(`#background-${key}`).value;profile.trainingBackground.comfortableWithRIR=document.querySelector("#comfortableRir").value==="yes";profile.trainingBackground.knownWorkingWeights=document.querySelector("#knownWorkingWeights").value;profile.currentTrainingDays=Number(document.querySelector("#currentDays").value)||null;profile.preferredTrainingDays=Number(document.querySelector("#preferredDays").value)||null;}
  if(onboardingStep===3){profile.primaryGoal=document.querySelector("#primaryGoal").value;profile.customGoal=document.querySelector("#customGoal").value.trim();}}

function isBaselineFieldCorrected(field){if(field.matches("input,select,textarea")&&!field.checkValidity())return false;if(field.dataset.validationKey==="baseline.weight")return Number(field.value)>0;return field.value!=="";}
function addOnboardingBaseline(){const result=FormValidation.createResult();const weightField=document.querySelector("#baselineWeight"),repsField=document.querySelector("#baselineReps"),rirField=document.querySelector("#baselineRir"),dateField=document.querySelector("#baselineDate");FormValidation.number(result,"baseline.weight",weightField.value,{label:"Weight",min:.1,minMessage:"Enter the weight used, choose I do not know, or skip this movement."});FormValidation.number(result,"baseline.repetitions",repsField.value,{label:"Repetitions completed",min:1,max:30,integer:true});FormValidation.number(result,"baseline.repsRemaining",rirField.value,{label:"Estimated reps remaining",min:0,max:10,integer:true});FormValidation.required(result,"baseline.date",dateField.value,"Choose the date for this baseline.");if(!FormValidation.apply(document.querySelector("#onboardingBody"),result,{summaryTitle:"The strength baseline could not be added. Fix these fields:"}))return;const weightEntered=Number(weightField.value);const exerciseId=document.querySelector("#baselineExercise").value;const definition=COMMERCIAL_GYM_EXERCISES.find(item=>item.id===exerciseId);const weight=internalWeightValue(weightEntered,onboardingDraft.units);const repetitions=Number(repsField.value),repsRemaining=Number(rirField.value);onboardingDraft.strengthBaselines.push({id:crypto.randomUUID(),movementCategory:document.querySelector("#baselineMovement").value,exerciseId:exerciseId||null,exerciseName:definition?.name||"",weight:Math.round(weight*10)/10,repetitions,repsRemaining,weightEntryType:document.querySelector("#baselineEntryType").value,date:dateField.value,estimatedOneRepMax:estimatedOneRepMax(weight,repetitions,repsRemaining)});renderOnboardingStep();}
function finishOnboarding(){saveOnboardingStep();const now=new Date().toISOString();onboardingDraft.onboardingStatus={completed:true,dismissedUntil:null,currentStep:4,declined:false};onboardingDraft.createdAt=onboardingDraft.createdAt||now;onboardingDraft.updatedAt=now;data.profile=structuredClone(onboardingDraft);document.querySelector("#onboardingDialog").close();saveData();}
function dismissOnboarding(){
  if(data.profile.onboardingStatus?.completed){document.querySelector("#onboardingDialog").close();renderAll();return;}
  if(typeof onboardingMode!=="undefined"&&onboardingMode==="quick"&&typeof saveQuickStrengthDraft==="function")saveQuickStrengthDraft(false);
  else if(document.querySelector("#profileUnits"))saveOnboardingStep();
  data.profile={...data.profile,...onboardingDraft,onboardingStatus:{...data.profile.onboardingStatus,completed:false,dismissedUntil:new Date(Date.now()+7*86400000).toISOString(),currentStep:onboardingStep}};
  document.querySelector("#onboardingDialog").close();saveData();
}

function renderUpdateNotice() {
  const notice = document.querySelector("#updateNotice");
  if (!waitingServiceWorker) {
    notice.classList.add("hidden");
    return;
  }
  notice.classList.remove("hidden");
  document.querySelector("#updateMessage").textContent = currentSession
    ? "Update available. Finish or save your workout before updating."
    : "A new version of Fleeman Fitness is available.";
  document.querySelector("#updateNowButton").disabled = Boolean(currentSession);
}

function renderHome() {
  const selected = data.workouts.find(w => w.id === data.selectedWorkoutId);
  document.querySelector("#todayWorkoutName").textContent = selected?.name || "Choose a workout";
  document.querySelector("#todayWorkoutSummary").textContent = selected
    ? `${selected.exercises.length} exercises • ${selected.notes || "Ready to train"}`
    : "Select one of your saved workouts to begin.";
  document.querySelector("#startWorkoutButton").textContent = selected ? "Start workout" : "Choose workout";
  const previewToday = document.querySelector("#previewTodayWorkoutButton");
  previewToday.classList.toggle("hidden", !selected);
  previewToday.onclick = selected ? event => openWorkoutPreview(selected, { trigger: event.currentTarget, selectable: true }) : null;

  const quick = document.querySelector("#quickWorkoutList");
  quick.innerHTML = "";
  PREMADE_PROGRAM_TEMPLATES.forEach(template => quick.appendChild(programTemplateCard(template)));
  document.querySelector("#quickStartHeading").textContent = data.mesocycles?.active ? "Start Something New" : "Quick Start Programs";

  const completedSets = data.history.reduce((sum, h) =>
    sum + h.exercises.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0), 0);
  const thisWeek = data.history.filter(h => Date.now() - new Date(h.date).getTime() < 7 * 86400000).length;
  const prs = calculatePRs();
  document.querySelector("#progressSummary").innerHTML = `
    <div class="stat"><strong>${thisWeek}</strong><span>Workouts this week</span></div>
    <div class="stat"><strong>${completedSets}</strong><span>Total sets logged</span></div>
    <div class="stat"><strong>${prs}</strong><span>Exercise bests</span></div>`;
  if (typeof renderMesocycleToday === "function") renderMesocycleToday();
  const todayAction = document.querySelector("#startWorkoutButton");
  if (todayAction?.textContent.includes("Programs")) todayAction.textContent = todayAction.textContent.replace("Programs", "Build");
  const todaySummary = document.querySelector("#todayWorkoutSummary");
  if (todaySummary?.textContent.includes("Programs")) todaySummary.textContent = todaySummary.textContent.replace("Programs", "Build");
  renderTodayDashboard();
}

function dashboardSavedSession() {
  if (typeof loadSavedActiveWorkout === "function") return loadSavedActiveWorkout();
  return data.activeWorkoutSession || null;
}

function dashboardWorkoutContext() {
  const paused = dashboardSavedSession();
  if (paused) return { workout: paused, paused, context: paused.mesocycle || null };
  const meso = data.mesocycles?.active;
  if (meso && typeof nextMesoSlot === "function") {
    const next = nextMesoSlot(meso);
    if (next) return { workout: next.plan.workout, paused: null, context: typeof mesoOccurrenceContext==="function"?mesoOccurrenceContext(meso,next):{ mesocycleId: meso.id, week: next.week, slot: next.slot } };
  }
  const selected = data.workouts.find(workout => workout.id === data.selectedWorkoutId) || null;
  return { workout: selected, paused: null, context: null };
}

function dashboardExerciseDefinition(exercise) {
  return definitionForExercise(exercise) || exercise.sessionPrescription || exercise;
}

function dashboardRecentExerciseResults(limit = 3) {
  const seen = new Set();
  const results = [];
  for (const session of data.history) {
    for (const exercise of session.exercises || []) {
      const completed = (exercise.sets || []).filter(set => set.done);
      if (!completed.length || exercise.skipped) continue;
      const key = exercise.libraryExerciseId || normalizedExerciseName(exercise.name);
      if (seen.has(key)) continue;
      seen.add(key);
      const best = completed.reduce((winner, set) => {
        const score = Number(set.weight ?? exercise.weight) * Math.max(1, Number(set.reps));
        const winnerScore = Number(winner.weight ?? exercise.weight) * Math.max(1, Number(winner.reps));
        return score > winnerScore ? set : winner;
      }, completed[0]);
      results.push({ name: exercise.name, weight: Number(best.weight ?? exercise.weight) || 0, reps: Number(best.reps) || 0, date: session.date });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

function dashboardRecoveryState(rating) {
  if (rating == null) return { label: "CHECK IN", className: "pending", note: "Rate before training" };
  if (Number(rating) === 0) return { label: "READY", className: "good", note: "Not sore" };
  if (Number(rating) === 1) return { label: "MILD", className: "fair", note: "A little sore" };
  if (Number(rating) === 2) return { label: "SORE", className: "warning", note: "Still feeling it" };
  return { label: "HIGH", className: "danger", note: "Recovery recommended" };
}

function renderTodayDashboardLegacy() {
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

  const activeMeso = data.mesocycles?.active;
  document.querySelector("#todayMesoMeta").textContent = activeMeso && context
    ? `${activeMeso.name} • WEEK ${context.week || 1}`
    : paused ? "SAVED SESSION" : workout ? "SAVED WORKOUT" : "TRAINING DASHBOARD";

  const weekStrip = document.querySelector("#todayWeekStrip");
  const weekSummary = document.querySelector("#weekDashboardSummary");
  if (activeMeso && typeof currentMesoPosition === "function") {
    const week = context?.week || currentMesoPosition(activeMeso).week;
    const completed = activeMeso.progress.completed.filter(item => item.week === week).length;
    const skipped = activeMeso.progress.skipped.filter(item => item.week === week).length;
    weekSummary.textContent = `${completed} completed${skipped ? ` • ${skipped} skipped` : ""} • Week ${week} of ${activeMeso.totalWeeks}`;
    weekStrip.innerHTML = activeMeso.schedule.map((slot, index) => {
      const done = activeMeso.progress.completed.some(item => item.week === week && item.slot === index);
      const missed = activeMeso.progress.skipped.some(item => item.week === week && item.slot === index);
      const current = context?.slot === index && !done && !missed;
      const status = done ? "✓" : missed ? "—" : current ? "●" : "○";
      const state = done ? "completed" : missed ? "skipped" : current ? "current" : "planned";
      return `<div class="week-day ${state}" aria-label="${escapeHtml(mesoWeekdays[index === context?.slot ? slot.dayIndex : slot.dayIndex])}: ${escapeHtml(slot.workout.name)}, ${state}"><span>${escapeHtml(mesoWeekdays[slot.dayIndex].slice(0,3).toUpperCase())}</span><strong>${index + 1}</strong><i aria-hidden="true">${status}</i></div>`;
    }).join("");
  } else {
    weekSummary.textContent = "Create a mesocycle to plan the week";
    weekStrip.innerHTML = ["MON","TUE","WED","THU","FRI","SAT","SUN"].map(day => `<div class="week-day empty"><span>${day}</span><strong>•</strong><i aria-hidden="true">○</i></div>`).join("");
  }

  const recovery = document.querySelector("#todayRecoverySummary");
  const definitions = exercises.map(dashboardExerciseDefinition);
  const muscles = workout ? workoutMuscles({ exercises: definitions }) : [];
  const ratings = paused?.soreness?.ratings || {};
  recovery.innerHTML = muscles.length ? muscles.map(muscle => {
    const state = dashboardRecoveryState(ratings[muscle]);
    return `<div class="dashboard-row"><span class="muscle-mark" aria-hidden="true"></span><div><strong>${escapeHtml(sorenessLabel(muscle))}</strong><small>${escapeHtml(state.note)}</small></div><b class="status-chip ${state.className}">${state.label}</b></div>`;
  }).join("") : '<p class="dashboard-empty">Choose a workout to see today’s recovery check-in.</p>';

  const recent = dashboardRecentExerciseResults();
  document.querySelector("#recentExerciseProgress").innerHTML = recent.length ? recent.map(result => `<div class="dashboard-row"><span class="performance-mark" aria-hidden="true">◆</span><div><strong>${escapeHtml(result.name)}</strong><small>${new Date(result.date).toLocaleDateString()}</small></div><b class="performance-value">${displayWeightValue(result.weight, data.profile?.units)} ${weightUnit(data.profile?.units)}<small>${result.reps} reps</small></b></div>`).join("") : '<p class="dashboard-empty">Complete a workout to begin building recent progress.</p>';
}

function renderTodayDashboard() {
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

  const activeMeso = data.mesocycles?.active;
  document.querySelector("#todayMesoMeta").textContent = activeMeso && context
    ? activeMeso.scheduleType === "rolling" ? `${activeMeso.name} | ROLLING CYCLE | CYCLE ${context.cycle || context.week || 1}` : `${activeMeso.name} | WEEK ${context.week || 1}`
    : paused ? "SAVED SESSION" : workout ? "SAVED WORKOUT" : "TRAINING DASHBOARD";

  const weekStrip = document.querySelector("#todayWeekStrip");
  const weekSummary = document.querySelector("#weekDashboardSummary");
  if (activeMeso && typeof currentMesoPosition === "function") {
    if (activeMeso.scheduleType === "rolling") {
      const position = currentMesoPosition(activeMeso);
      const cycle = context?.cycle || position.cycle || position.week || 1;
      const completed = activeMeso.progress.completed.filter(item => Number(item.cycle ?? item.week) === cycle).length;
      const skipped = activeMeso.progress.skipped.filter(item => Number(item.cycle ?? item.week) === cycle).length;
      const rested = (activeMeso.progress.restCompleted || []).filter(item => Number(item.cycle ?? item.week) === cycle).length;
      weekSummary.textContent = `${completed} workouts completed${skipped ? ` | ${skipped} skipped` : ""} | ${rested} rest days | Cycle ${cycle}`;
      weekStrip.innerHTML = activeMeso.schedule.map((slot, index) => {
        const done = activeMeso.progress.completed.some(item => Number(item.cycle ?? item.week) === cycle && item.slot === index) || (activeMeso.progress.restCompleted || []).some(item => Number(item.cycle ?? item.week) === cycle && item.slot === index);
        const missed = activeMeso.progress.skipped.some(item => Number(item.cycle ?? item.week) === cycle && item.slot === index);
        const current = position.slot === index && !done && !missed;
        const status = done ? "DONE" : missed ? "SKIP" : current ? "NOW" : slot.dayType === "rest" ? "REST" : "NEXT";
        const state = done ? "completed" : missed ? "skipped" : current ? "current" : "planned";
        const title = slot.dayType === "rest" ? slot.restTitle || "Rest Day" : slot.workout?.name || `Day ${index + 1}`;
        return `<div class="week-day ${state}" aria-label="Cycle Day ${index + 1}: ${escapeHtml(title)}, ${state}"><span>DAY</span><strong>${index + 1}</strong><i aria-hidden="true">${status}</i></div>`;
      }).join("");
    } else {
    const week = context?.week || currentMesoPosition(activeMeso).week;
    const completed = activeMeso.progress.completed.filter(item => item.week === week).length;
    const skipped = activeMeso.progress.skipped.filter(item => item.week === week).length;
    weekSummary.textContent = `${completed} completed${skipped ? ` | ${skipped} skipped` : ""} | Week ${week} of ${activeMeso.totalWeeks}`;
    weekStrip.innerHTML = activeMeso.schedule.map((slot, index) => {
      const done = activeMeso.progress.completed.some(item => item.week === week && item.slot === index);
      const missed = activeMeso.progress.skipped.some(item => item.week === week && item.slot === index);
      const current = context?.slot === index && !done && !missed;
      const status = done ? "DONE" : missed ? "SKIP" : current ? "NOW" : "NEXT";
      const state = done ? "completed" : missed ? "skipped" : current ? "current" : "planned";
      return `<div class="week-day ${state}" aria-label="${escapeHtml(mesoWeekdays[slot.dayIndex])}: ${escapeHtml(slot.workout.name)}, ${state}"><span>${escapeHtml(mesoWeekdays[slot.dayIndex].slice(0,3).toUpperCase())}</span><strong>${index + 1}</strong><i aria-hidden="true">${status}</i></div>`;
    }).join("");
    }
  } else {
    weekSummary.textContent = "Create a mesocycle to plan the week";
    weekStrip.innerHTML = ["MON","TUE","WED","THU","FRI","SAT","SUN"].map(day => `<div class="week-day empty"><span>${day}</span><strong>-</strong><i aria-hidden="true">OPEN</i></div>`).join("");
  }

  const recovery = document.querySelector("#todayRecoverySummary");
  const definitions = exercises.map(dashboardExerciseDefinition);
  const muscles = workout ? workoutMuscles({ exercises: definitions }) : [];
  const ratings = paused?.soreness?.ratings || {};
  recovery.innerHTML = muscles.length ? muscles.map(muscle => {
    const state = dashboardRecoveryState(ratings[muscle]);
    return `<div class="dashboard-row"><span class="muscle-mark" aria-hidden="true"></span><div><strong>${escapeHtml(sorenessLabel(muscle))}</strong><small>${escapeHtml(state.note)}</small></div><b class="status-chip ${state.className}">${state.label}</b></div>`;
  }).join("") : '<p class="dashboard-empty">Choose a workout to see today\'s recovery check-in.</p>';

  const recent = dashboardRecentExerciseResults();
  document.querySelector("#recentExerciseProgress").innerHTML = recent.length ? recent.map(result => `<div class="dashboard-row"><span class="performance-mark" aria-hidden="true">+</span><div><strong>${escapeHtml(result.name)}</strong><small>${new Date(result.date).toLocaleDateString()}</small></div><b class="performance-value">${displayWeightValue(result.weight, data.profile?.units)} ${weightUnit(data.profile?.units)}<small>${result.reps} reps</small></b></div>`).join("") : '<p class="dashboard-empty">Complete a workout to begin building recent progress.</p>';
}

function calculatePRs() {
  const best = {};
  data.history.forEach(h => h.exercises.forEach(e => {
    e.sets.forEach(s => {
      if (!s.done) return;
      const score = Number(e.weight) * Number(s.reps);
      best[e.exerciseId] = Math.max(best[e.exerciseId] || 0, score);
    });
  }));
  return Object.keys(best).length;
}

function programTemplateCard(template, surface = "home") {
  const card=document.createElement("article");card.className="workout-card program-template-card";
  card.innerHTML=`<div class="workout-card-top"><div><h3>${escapeHtml(template.name)}</h3><p>${escapeHtml(template.description)}</p><p class="small-note">${template.daysPerWeek} days per week • ${escapeHtml(template.focus)} • Approximately ${escapeHtml(template.duration)} per workout</p></div></div><div class="card-actions workout-card-actions horizontal-scroll-row"><button class="secondary-button compact preview-program">Preview</button><button class="primary-button compact build-program">Build Mesocycle</button></div>`;
  card.querySelector(".preview-program").onclick=event=>openProgramPreview(template,event.currentTarget);
  if (surface === "library") card.querySelector(".build-program").textContent = "Use This Program";
  card.querySelector(".build-program").onclick=()=>buildProgramMesocycle(template);
  return card;
}

function latestTemplateStartingWeight(definition) {
  for (const session of data.history) {
    const result=session.exercises.find(exercise=>exercise.libraryExerciseId===definition.id||normalizedExerciseName(exercise.name)===normalizedExerciseName(definition.name));
    if(result&&Number(result.weight)>0)return Number(result.weight);
  }
  for (const workout of data.workouts) {
    const exercise=workout.exercises.find(item=>item.libraryExerciseId===definition.id&&Number(item.startWeight)>0);
    if(exercise)return Number(exercise.startWeight);
  }
  return 0;
}

function templateExercisePrescription(item) {
  const definition=COMMERCIAL_GYM_EXERCISES.find(exercise=>exercise.id===item.exerciseId);
  if(!definition)return null;
  const prescription=exerciseDefinitionToPrescription(definition);
  prescription.sets=Number(item.sets||definition.defaults.sets);
  const starting=startingWeightRecommendation(prescription);prescription.startWeight=starting.weight;prescription.startingWeightRecommendation=starting;
  return prescription;
}

function mesocycleFromProgramTemplate(template) {
  return {id:crypto.randomUUID(),name:template.name,scheduleType:"weekly",startDate:new Date().toISOString().slice(0,10),trainingWeeks:4,includeDeload:false,totalWeeks:4,daysPerWeek:template.daysPerWeek,status:"draft",createdAt:new Date().toISOString(),sourceTemplateId:template.id,sourceTemplateVersion:PROGRAM_TEMPLATE_VERSION,progress:{week:1,slot:0,completed:[],skipped:[],needsWeekReview:false},schedule:template.schedule.map((day,index)=>({id:crypto.randomUUID(),dayIndex:day.dayIndex,order:index,focusMuscle:day.workout.focus,workout:{id:crypto.randomUUID(),name:day.workout.name,notes:day.workout.focus,exercises:day.workout.exercises.map(templateExercisePrescription).filter(Boolean)}}))};
}

function programWeeklySets(template) {
  const totals={};template.schedule.forEach(day=>day.workout.exercises.forEach(item=>{const exercise=COMMERCIAL_GYM_EXERCISES.find(definition=>definition.id===item.exerciseId);if(exercise)totals[exercise.primaryMuscle]=(totals[exercise.primaryMuscle]||0)+Number(item.sets||exercise.defaults.sets);}));return totals;
}

function estimatedProgramWorkoutMinutes(workout) {
  const prescriptions=workout.exercises.map(templateExercisePrescription).filter(Boolean);
  return Math.max(45,workoutPreviewTotals({exercises:prescriptions}).estimatedMinutes);
}

function openProgramPreview(template,trigger) {
  previewedProgramTemplate=template;programPreviewReturnFocus=trigger;
  const days=new Map(template.schedule.map(day=>[day.dayIndex,day]));const weekdayNames=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  document.querySelector("#programPreviewTitle").textContent=template.name;
  document.querySelector("#programPreviewContent").innerHTML=`<p>${escapeHtml(template.description)}</p><p><strong>${template.daysPerWeek} days per week</strong> • ${escapeHtml(template.focus)} • ${escapeHtml(template.duration)} per workout</p><h3>Weekly schedule</h3>${weekdayNames.map((name,index)=>{const day=days.get(index);if(!day)return `<div class="preview-exercise"><h3>${name}: Rest</h3></div>`;return `<details class="preview-exercise" ${index===1?"open":""}><summary><strong>${name}: ${escapeHtml(day.workout.name)}</strong> • about ${estimatedProgramWorkoutMinutes(day.workout)} min</summary>${day.workout.exercises.map(item=>{const exercise=COMMERCIAL_GYM_EXERCISES.find(definition=>definition.id===item.exerciseId);return exercise?`<p>${escapeHtml(exercise.name)} — ${item.sets||exercise.defaults.sets} sets, ${exercise.defaults.minReps}–${exercise.defaults.maxReps} reps, RIR ${exercise.defaults.targetRIR}</p>`:"";}).join("")}</details>`;}).join("")}<h3>Estimated weekly sets</h3><p>${Object.entries(programWeeklySets(template)).map(([muscle,sets])=>`${escapeHtml(muscle)}: ${sets}`).join(" • ")}</p><p class="small-note">Previewing does not create or modify a mesocycle.</p>`;
  document.querySelector("#programPreviewDialog").showModal();document.querySelector("#closeProgramPreviewButton").focus();
}

function closeProgramPreview(){const dialog=document.querySelector("#programPreviewDialog");if(dialog.open)dialog.close();programPreviewReturnFocus?.focus();}
function closeActiveProgramOptions(){const dialog=document.querySelector("#activeProgramDialog");if(dialog.open)dialog.close();}
function buildProgramMesocycle(template){
  if(data.mesocycles?.active){pendingProgramTemplate=template;closeProgramPreview();document.querySelector("#activeProgramDialog").showModal();document.querySelector("#previewPendingProgramButton").focus();return;}
  closeProgramPreview();openMesocycleBuilder(mesocycleFromProgramTemplate(template));
}

function savePendingProgramAsDraft(){if(!pendingProgramTemplate)return;const mesocycle=mesocycleFromProgramTemplate(pendingProgramTemplate);data.mesocycles.drafts.unshift(mesocycle);closeActiveProgramOptions();pendingProgramTemplate=null;saveData();alert("The new program was saved as a draft. Your active mesocycle was not changed.");}

function workoutCard(workout, quick = false) {
  const totals = workoutPreviewTotals(workout);
  const el = document.createElement("article");
  el.className = "workout-card";
  el.innerHTML = `
    <div class="workout-card-top">
      <div>
        <h3>${escapeHtml(workout.name)}</h3>
        <p>${escapeHtml(workout.notes || "Custom workout")}</p>
        <p class="small-note">${totals.exerciseCount} exercises • ${totals.totalSets} working sets • ${totals.estimatedMinutes} min • ${totals.primaryMuscles.map(sorenessLabel).join(", ") || "Mixed"}</p>
      </div>
      ${data.selectedWorkoutId === workout.id ? '<span class="eyebrow">SELECTED</span>' : ""}
    </div>
    <div class="card-actions workout-card-actions horizontal-scroll-row">
      <button class="secondary-button compact preview-card" aria-label="Preview ${escapeHtml(workout.name)}">Preview</button>
      <button class="primary-button compact start-card">Start</button>
      ${quick ? '<button class="secondary-button compact select-card">Select</button>' :
        '<button class="secondary-button compact edit-card">Edit</button><button class="danger-button compact delete-card">Delete</button>'}
    </div>`;
  el.querySelector(".preview-card").onclick = event => openWorkoutPreview(workout, { trigger: event.currentTarget, selectable: quick, editable: !isPremadeWorkout(workout) });
  el.querySelector(".start-card").onclick = () => startWorkout(workout.id);
  if (!quick) el.querySelector(".start-card").textContent = "Start Once";
  const select = el.querySelector(".select-card");
  if (select) select.onclick = () => { data.selectedWorkoutId = workout.id; saveData(); };
  const edit = el.querySelector(".edit-card");
  if (edit) edit.onclick = () => openWorkoutEditor(workout);
  const del = el.querySelector(".delete-card");
  if (del) del.onclick = () => deleteWorkout(workout.id);
  if (!quick) {
    const actions = el.querySelector(".workout-card-actions");
    if (isPremadeWorkout(workout)) {
      edit?.remove();
      del?.remove();
    }
    const duplicate = document.createElement("button");
    duplicate.className = "secondary-button compact";
    duplicate.textContent = "Duplicate";
    duplicate.onclick = () => duplicateWorkoutTemplate(workout);
    const addToMeso = document.createElement("button");
    addToMeso.className = "secondary-button compact";
    addToMeso.textContent = "Add to Mesocycle";
    addToMeso.onclick = () => addWorkoutToMesocycle(workout);
    actions.append(duplicate, addToMeso);
  }
  return el;
}

function duplicateWorkoutTemplate(workout) {
  const copy = structuredClone(workout);
  copy.id = crypto.randomUUID();
  copy.name = `${workout.name} Copy`;
  copy.exercises = copy.exercises.map(exercise => ({ ...exercise, id: crypto.randomUUID() }));
  data.workouts.unshift(copy);
  saveData();
  setLibrarySection("workouts", { focus: false });
}

function addWorkoutToMesocycle(workout) {
  if (typeof newMesocycle !== "function" || typeof openMesocycleBuilder !== "function") return;
  const mesocycle = newMesocycle();
  mesocycle.name = `${workout.name} Mesocycle`;
  mesocycle.daysPerWeek = 1;
  mesocycle.schedule = [{ id: crypto.randomUUID(), dayIndex: 1, order: 0, workout: { ...structuredClone(workout), id: crypto.randomUUID(), exercises: workout.exercises.map(exercise => ({ ...structuredClone(exercise), id: crypto.randomUUID() })) } }];
  openMesocycleBuilder(mesocycle);
}

function libraryBrowseExerciseCard(exercise) {
  const card = document.createElement("article");
  card.className = "library-exercise-card compact-library-card";
  const favorite = data.exerciseLibraryUser.favorites.includes(exercise.id);
  const hasHistory = data.history.some(session => session.exercises?.some(item => item.libraryExerciseId === exercise.id || normalizedExerciseName(item.name) === normalizedExerciseName(exercise.name)));
  card.innerHTML = `<div><h3>${escapeHtml(exercise.name)}</h3><p>${escapeHtml(exercise.primaryMuscle)} | ${(exercise.equipment || []).map(escapeHtml).join(", ")}</p></div><div class="exercise-actions"><button class="secondary-button compact library-favorite" aria-pressed="${favorite}" aria-label="${favorite ? "Remove" : "Add"} ${escapeHtml(exercise.name)} ${favorite ? "from" : "to"} favorites">${favorite ? "Favorite" : "Favorite"}</button><button class="secondary-button compact library-preview">Preview</button>${hasHistory ? '<button class="secondary-button compact library-history">View History</button>' : ""}</div>`;
  card.querySelector(".library-favorite").onclick = () => toggleExerciseFavorite(exercise.id);
  card.querySelector(".library-preview").onclick = event => openExercisePreview(exercise, event.currentTarget);
  card.querySelector(".library-history")?.addEventListener("click", event => { if (typeof openActiveExerciseHistory === "function") openActiveExerciseHistory(exercise, event.currentTarget); });
  return card;
}

function renderLibrary() {
  const list = document.querySelector("#workoutLibrary");
  list.innerHTML = "";
  data.workouts.forEach(w => list.appendChild(workoutCard(w)));
  const programs = document.querySelector("#libraryProgramList");
  programs.innerHTML = "";
  PREMADE_PROGRAM_TEMPLATES.forEach(template => programs.appendChild(programTemplateCard(template, "library")));

  const definitions = allExerciseDefinitions();
  const favorites = definitions.filter(exercise => data.exerciseLibraryUser.favorites.includes(exercise.id));
  const favoritesHolder = document.querySelector("#libraryFavorites");
  favoritesHolder.innerHTML = "";
  if (favorites.length) favorites.forEach(exercise => favoritesHolder.appendChild(libraryBrowseExerciseCard(exercise)));
  else favoritesHolder.innerHTML = '<div class="panel"><p>No favorite exercises yet. Open the Exercise Library and mark exercises you want to keep here.</p></div>';

  const recentIds = [...data.exerciseLibraryUser.recent];
  data.history.forEach(session => session.exercises?.forEach(exercise => { if (exercise.libraryExerciseId && !recentIds.includes(exercise.libraryExerciseId)) recentIds.push(exercise.libraryExerciseId); }));
  const recent = recentIds.map(id => definitions.find(exercise => exercise.id === id)).filter(Boolean).slice(0, 12);
  const recentHolder = document.querySelector("#libraryRecent");
  recentHolder.innerHTML = "";
  if (recent.length) recent.forEach(exercise => recentHolder.appendChild(libraryBrowseExerciseCard(exercise)));
  else recentHolder.innerHTML = '<div class="panel"><p>Recently completed or added exercises will appear here.</p></div>';

  setLibrarySection(data.ui?.librarySection || "premade", { focus: false, persist: false });
}

function setLibrarySection(section, { focus = true, persist = true } = {}) {
  const valid = ["premade", "workouts", "exercises", "favorites", "recent"];
  const selected = valid.includes(section) ? section : "premade";
  data.ui = { ...defaultData.ui, ...(data.ui || {}), librarySection: selected };
  document.querySelectorAll(".library-section-tab").forEach(button => {
    const active = button.dataset.librarySection === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".library-section").forEach(panel => panel.classList.toggle("active", panel.dataset.libraryPanel === selected));
  if (persist) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  if (focus) {
    const heading = document.querySelector(`.library-section[data-library-panel="${selected}"] h3`);
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
}

function openExerciseLibrary(context={type:"browse"}) {
  exerciseLibraryContext=context;
  exerciseLibraryFilters={search:"",muscle:context.muscle||"",equipment:"",loadType:"",type:"",favorites:false,recent:false};
  document.querySelector("#exerciseLibrarySearch").value="";
  document.querySelector("#equipmentFilter").value="";
  document.querySelector("#loadTypeFilter").value="";
  document.querySelector("#exerciseTypeFilter").value="";
  renderExerciseLibrary();
  document.querySelector("#exerciseLibraryDialog").showModal();
  document.querySelector("#exerciseLibrarySearch").focus();
}

function closeExerciseLibrary(){document.querySelector("#exerciseLibraryDialog").close();exerciseLibraryContext={type:"browse"};}

function exerciseSearchText(exercise){return [exercise.name,exercise.primaryMuscle,...(exercise.secondaryMuscles||[]),...(exercise.muscleTags||[]),...(exercise.equipment||[]),exercise.movementPattern,...(exercise.searchKeywords||[])].join(" ").toLowerCase();}

function renderExerciseLibrary(){
  const user=data.exerciseLibraryUser;
  const all=allExerciseDefinitions();
  const categories=Object.keys(EXERCISE_CATALOG);
  const muscleRow=document.querySelector("#muscleFilterRow");
  muscleRow.innerHTML=`<button class="filter-button" data-muscle="" aria-pressed="${!exerciseLibraryFilters.muscle}">All</button>${categories.map(category=>`<button class="filter-button" data-muscle="${escapeHtml(category)}" aria-pressed="${exerciseLibraryFilters.muscle===category}">${escapeHtml(category)}</button>`).join("")}`;
  muscleRow.querySelectorAll(".filter-button").forEach(button=>button.onclick=()=>{exerciseLibraryFilters.muscle=button.dataset.muscle;renderExerciseLibrary();});
  const equipment=[...new Set(all.flatMap(exercise=>exercise.equipment||[]))].sort();
  const equipmentSelect=document.querySelector("#equipmentFilter");
  if(equipmentSelect.options.length===1) equipment.forEach(item=>equipmentSelect.add(new Option(item,item)));
  let results=all.filter(exercise=>{
    const query=exerciseLibraryFilters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const text=exerciseSearchText(exercise);
    const loadType=exercise.defaults?.weightEntryType||exercise.weightEntryType||"";const bodyweight=loadType==="Bodyweight"||loadType==="Bodyweight + Added Weight"||loadType==="Bodyweight Plus Added Weight"||loadType==="Assisted Bodyweight"||(exercise.equipment||[]).includes("Bodyweight");
    return query.every(term=>text.includes(term))&&(!exerciseLibraryFilters.muscle||exercise.primaryMuscle===exerciseLibraryFilters.muscle)&&(!exerciseLibraryFilters.equipment||(exercise.equipment||[]).includes(exerciseLibraryFilters.equipment))&&(!exerciseLibraryFilters.loadType||exerciseLibraryFilters.loadType!=="bodyweight"||bodyweight)&&(!exerciseLibraryFilters.type||exercise.exerciseType===exerciseLibraryFilters.type)&&(!exerciseLibraryFilters.favorites||user.favorites.includes(exercise.id))&&(!exerciseLibraryFilters.recent||user.recent.includes(exercise.id));
  });
  if(exerciseLibraryFilters.recent) results.sort((a,b)=>user.recent.indexOf(a.id)-user.recent.indexOf(b.id)); else results.sort((a,b)=>a.name.localeCompare(b.name));
  document.querySelector("#favoritesFilterButton").setAttribute("aria-pressed",String(exerciseLibraryFilters.favorites));
  document.querySelector("#recentFilterButton").setAttribute("aria-pressed",String(exerciseLibraryFilters.recent));
  document.querySelector("#exerciseResultCount").textContent=`${results.length} exercises`;
  const holder=document.querySelector("#exerciseLibraryResults");holder.innerHTML="";
  results.forEach(exercise=>holder.appendChild(exerciseLibraryCard(exercise)));
}

function exerciseLibraryCard(exercise){
  const card=document.createElement("article");card.className="library-exercise-card";
  const favorite=data.exerciseLibraryUser.favorites.includes(exercise.id);
  card.innerHTML=`<h3>${escapeHtml(exercise.name)}</h3><p>${escapeHtml(exercise.primaryMuscle)} • ${(exercise.equipment||[]).map(escapeHtml).join(", ")} • ${escapeHtml(exercise.exerciseType)}</p><p class="small-note">Default: ${exercise.defaults.sets} sets • ${exercise.defaults.minReps}–${exercise.defaults.maxReps} ${exerciseRepLabel(exercise)} • RIR ${exercise.defaults.targetRIR}</p><div class="exercise-actions"><button class="secondary-button favorite-button" aria-label="${favorite?"Remove":"Add"} ${escapeHtml(exercise.name)} ${favorite?"from":"to"} favorites" aria-pressed="${favorite}">${favorite?"★":"☆"}</button><button class="secondary-button preview-exercise-button">Preview</button>${exerciseLibraryContext.type!=="browse"?'<button class="primary-button compact add-library-exercise">Add</button>':""}${exercise.sourceType==="custom"?'<button class="danger-button compact delete-custom-exercise">Delete</button>':""}</div>`;
  card.querySelector(".favorite-button").onclick=()=>toggleExerciseFavorite(exercise.id);
  card.querySelector(".preview-exercise-button").onclick=event=>openExercisePreview(exercise,event.currentTarget);
  if (exerciseLibraryContext.type === "browse" && data.history.some(session => session.exercises?.some(item => item.libraryExerciseId === exercise.id || normalizedExerciseName(item.name) === normalizedExerciseName(exercise.name)))) {
    const historyButton = document.createElement("button");
    historyButton.className = "secondary-button compact";
    historyButton.textContent = "View History";
    historyButton.onclick = event => { if (typeof openActiveExerciseHistory === "function") openActiveExerciseHistory(exercise, event.currentTarget); };
    card.querySelector(".exercise-actions").appendChild(historyButton);
  }
  card.querySelector(".add-library-exercise")?.addEventListener("click",()=>addExerciseFromLibrary(exercise));
  card.querySelector(".delete-custom-exercise")?.addEventListener("click",()=>deleteCustomExercise(exercise));
  return card;
}

function toggleExerciseFavorite(id){const list=data.exerciseLibraryUser.favorites;data.exerciseLibraryUser.favorites=list.includes(id)?list.filter(item=>item!==id):[...list,id];saveData();renderExerciseLibrary();}
function markExerciseUsed(id){if(!id)return;data.exerciseLibraryUser.recent=[id,...data.exerciseLibraryUser.recent.filter(item=>item!==id)].slice(0,25);}

function addExerciseFromLibrary(definition){
  const prescription=exerciseDefinitionToPrescription(definition);const starting=startingWeightRecommendation(prescription);prescription.startWeight=starting.weight;prescription.startingWeightRecommendation=starting;data.profile.startingWeightRecommendations.push({date:new Date().toISOString(),exerciseId:prescription.id,libraryExerciseId:definition.id,exerciseName:definition.name,...structuredClone(starting)});markExerciseUsed(definition.id);
  if(exerciseLibraryContext.type==="workout") addExerciseEditor(prescription);
  if(exerciseLibraryContext.type==="mesocycle"&&exerciseLibraryContext.slot){exerciseLibraryContext.slot.workout.exercises.push(prescription);renderMesoBuilder();}
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));closeExercisePreview();closeExerciseLibrary();
}

function openExercisePreview(exercise,trigger){
  exercisePreviewReturnFocus=trigger;const favorite=data.exerciseLibraryUser.favorites.includes(exercise.id);const similar=allExerciseDefinitions().filter(item=>item.id!==exercise.id&&item.substitutionFamily===exercise.substitutionFamily).slice(0,6);const starting=startingWeightRecommendation(exerciseDefinitionToPrescription(exercise));
  document.querySelector("#exercisePreviewTitle").textContent=exercise.name;
  document.querySelector("#exercisePreviewContent").innerHTML=`<p>${escapeHtml(exercise.description)}</p><div class="exercise-detail-list"><p><strong>Primary:</strong> ${escapeHtml(exercise.primaryMuscle)}</p><p><strong>Secondary:</strong> ${(exercise.secondaryMuscles||[]).map(escapeHtml).join(", ")||"None"}</p><p><strong>Equipment:</strong> ${(exercise.equipment||[]).map(escapeHtml).join(", ")}</p><p><strong>Classification:</strong> ${escapeHtml(exercise.exerciseType)} • ${escapeHtml(exercise.movementPattern)} • ${escapeHtml(exercise.laterality)}</p><p><strong>Suggested plan:</strong> ${exercise.defaults.sets} sets • ${exercise.defaults.minReps}–${exercise.defaults.maxReps} ${exerciseRepLabel(exercise)} • RIR ${exercise.defaults.targetRIR} • ${exercise.defaults.restSeconds}s rest</p><p><strong>Increment:</strong> ${exercise.defaults.weightIncrement} lb • ${escapeHtml(exercise.defaults.weightEntryType)}</p><h3>Setup</h3><ul>${exercise.setup.map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>Performance cues</h3><ul>${exercise.cues.map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>${exercise.caution?`<p class="recovery-warning">${escapeHtml(exercise.caution)}</p>`:""}<h3>Similar exercises</h3><p>${similar.map(item=>escapeHtml(item.name)).join(" • ")||"No similar exercises listed."}</p></div>`;
  document.querySelector("#exercisePreviewContent").insertAdjacentHTML("afterbegin",`<div class="recommendation-panel"><strong>Suggested starting weight:</strong> ${starting.weight?`${displayWeightValue(starting.weight,data.profile?.units)} ${weightUnit(data.profile?.units)}`:escapeHtml(starting.label)}<p>${escapeHtml(weightEntryLabel(exercise.defaults?.weightEntryType))}</p><span class="confidence-label">${escapeHtml(starting.label)}</span><p>${escapeHtml(starting.reason)}${starting.calibrationRecommended?" This is an estimate. Confirm it during your first workout.":""}</p><details><summary>More information about this recommendation</summary><p>Fleeman Fitness uses exercise history first, then compatible baselines and conservative estimates. You can edit the weight or calibrate it before working sets.</p></details></div>`);
  document.querySelector("#exercisePreviewActions").innerHTML=`${exerciseLibraryContext.type!=="browse"?'<button id="addExerciseFromPreviewButton" class="primary-button">Add Exercise</button>':""}<button id="favoriteExerciseFromPreviewButton" class="secondary-button">${favorite?"★ Favorited":"☆ Favorite"}</button><button id="backExercisePreviewButton" class="secondary-button">Back</button>`;
  document.querySelector("#addExerciseFromPreviewButton")?.addEventListener("click",()=>addExerciseFromLibrary(exercise));
  document.querySelector("#favoriteExerciseFromPreviewButton").onclick=()=>{toggleExerciseFavorite(exercise.id);closeExercisePreview();};
  document.querySelector("#backExercisePreviewButton").onclick=closeExercisePreview;
  document.querySelector("#exercisePreviewDialog").showModal();document.querySelector("#closeExercisePreviewButton").focus();
}

function closeExercisePreview(){const dialog=document.querySelector("#exercisePreviewDialog");if(dialog.open)dialog.close();exercisePreviewReturnFocus?.focus();}

function createCustomExercise(){
  const name=prompt("Custom exercise name");if(!name?.trim())return;
  const primaryMuscle=prompt(`Primary muscle (${Object.keys(EXERCISE_CATALOG).join(", ")})`,"Chest")||"Chest";
  const equipment=prompt("Equipment","Commercial Gym Equipment")||"Commercial Gym Equipment";
  const movementCategory=prompt(`Movement category (${MOVEMENT_BASELINE_CATEGORIES.join(", ")}, Core, or Other isolation)`,"")||"";const weightEntryType=prompt("Weight-entry type (Total Weight, Per Dumbbell, Machine Stack, Plate-Loaded Total, Plate-Loaded Per Side, Bodyweight, Bodyweight Plus Added Weight, Assisted Bodyweight)","Total Weight")||"";const substitutionFamily=prompt("Substitution family (used only for related-exercise estimates)",movementCategory)||"";
  const definition=buildExerciseDefinition(name.trim(),primaryMuscle.trim());definition.id=`custom-${crypto.randomUUID()}`;definition.description=prompt("Short description",definition.description)||definition.description;definition.equipment=[equipment.trim()];definition.movementPattern=movementCategory.trim();definition.substitutionFamily=substitutionFamily.trim();definition.defaults.weightEntryType=weightEntryType.trim();definition.sourceType="custom";definition.searchKeywords=[name.toLowerCase(),primaryMuscle.toLowerCase(),equipment.toLowerCase(),movementCategory.toLowerCase()];
  data.exerciseLibraryUser.customExercises.push(definition);saveData();renderExerciseLibrary();
}

function deleteCustomExercise(exercise){if(!confirm(`Delete custom exercise ${exercise.name}? Existing workout prescriptions will remain.`))return;data.exerciseLibraryUser.customExercises=data.exerciseLibraryUser.customExercises.filter(item=>item.id!==exercise.id);data.exerciseLibraryUser.favorites=data.exerciseLibraryUser.favorites.filter(id=>id!==exercise.id);saveData();renderExerciseLibrary();}

function renderHistory() {
  const list = document.querySelector("#historyList");
  list.innerHTML = "";
  renderHistoryExerciseIndex();
  if (!data.history.length) {
    list.innerHTML = '<div class="panel"><p>No workouts logged yet. Finish your first session and it will appear here.</p></div>';
    return;
  }
  data.history.forEach(h => {
    const exercises = h.exercises || [];
    const sets = exercises.reduce((s, e) => s + (e.sets || []).filter(x => x.done).length, 0);
    const rollingContext = h.mesocycle?.scheduleType === "rolling"
      ? `<p class="small-note"><strong>Rolling Cycle</strong> • Cycle ${h.mesocycle.cycle || h.mesocycle.week} • Day ${h.mesocycle.cycleDay || Number(h.mesocycle.slot) + 1} of ${h.mesocycle.cycleLength} • ${h.mesocycle.phase === "deload" ? "Deload" : "Normal"}</p>`
      : h.mesocycle ? `<p class="small-note"><strong>Weekly Schedule</strong> • Week ${h.mesocycle.week}</p>` : "";
    const statusText = h.type === "rest-day" ? `Planned rest day • ${escapeHtml(h.scheduleStatus || "completed")}` : h.type === "extra-rest-day" ? "Extra rest day • Original cycle numbering unchanged" : h.type === "skipped-workout" ? `Skipped workout${h.skipReason ? ` • ${escapeHtml(h.skipReason)}` : ""}` : "";
    const el = document.createElement("article");
    el.className = "history-card";
    el.innerHTML = `
      <div class="workout-card-top">
        <div><h3>${escapeHtml(h.workoutName)}</h3><p>${new Date(h.date).toLocaleString()}</p></div>
        <strong>${sets} sets</strong>
      </div>
      ${rollingContext}
      ${statusText ? `<p>${statusText}</p>` : `<p>${exercises.map(exerciseHistorySummary).join(" • ")}</p>`}
      ${h.soreness?.ratings ? `<p class="small-note">Soreness: ${Object.entries(h.soreness.ratings).map(([muscle,rating]) => `${sorenessLabel(muscle)} — ${["Not sore","A little sore","I still feel it","I can barely move"][rating]}`).join(" • ")} • ${h.soreness.decision}</p>` : ""}
      ${exercises.some(e => Number(e.jointPain?.rating) > 1) ? `<p class="small-note">Joint pain: ${exercises.filter(e=>Number(e.jointPain?.rating)>1).map(e=>`${escapeHtml(e.name)} ${e.jointPain.rating}/5 (${(e.jointPain.joints||[]).map(escapeHtml).join(", ")})`).join(" • ")}</p>` : ""}`;
    list.appendChild(el);
  });
}

function renderHistoryExerciseIndex() {
  const holder = document.querySelector("#historyExerciseIndex");
  if (!holder) return;
  const seen = new Set();
  const exercises = [];
  data.history.forEach(session => session.exercises?.forEach(result => {
    const key = result.libraryExerciseId || normalizedExerciseName(result.name);
    if (seen.has(key)) return;
    seen.add(key);
    exercises.push(definitionForExercise(result) || result);
  }));
  holder.innerHTML = "";
  if (!exercises.length) { holder.innerHTML = '<div class="panel"><p>Exercise history will appear after a workout is completed.</p></div>'; return; }
  exercises.slice(0, 30).forEach(exercise => {
    const button = document.createElement("button");
    button.className = "secondary-button history-exercise-button";
    button.textContent = exercise.name;
    button.onclick = event => { if (typeof openActiveExerciseHistory === "function") openActiveExerciseHistory(exercise, event.currentTarget); };
    holder.appendChild(button);
  });
}

function openWorkoutEditor(workout = null) {
  document.querySelector("#workoutDialogTitle").textContent = workout ? "Edit workout" : "New workout";
  document.querySelector("#editingWorkoutId").value = workout?.id || "";
  document.querySelector("#workoutNameInput").value = workout?.name || "";
  document.querySelector("#workoutNotesInput").value = workout?.notes || "";
  const editor = document.querySelector("#exerciseEditor");
  FormValidation.clearAll(document.querySelector("#workoutForm"));
  FormValidation.bindLiveClear(document.querySelector("#workoutForm"), { isCorrected: isWorkoutEditorFieldCorrected });
  editor.innerHTML = "";
  (workout?.exercises || [{name:"", sets:3, minReps:8, maxReps:12, startWeight:0}]).forEach(addExerciseEditor);
  document.querySelector("#workoutDialog").showModal();
}

function cancelWorkoutEditor() {
  if (!confirm("Cancel workout editing? Any unsaved changes will be lost.")) return;
  document.querySelector("#workoutDialog").close();
}

function addExerciseEditor(exercise = {}) {
  const node = document.querySelector("#exerciseEditorTemplate").content.cloneNode(true);
  const card = node.querySelector(".exercise-editor-card");
  card.dataset.exerciseId = exercise.id || crypto.randomUUID();
  card.dataset.libraryExerciseId = exercise.libraryExerciseId || "";
  card.dataset.exerciseMetadata = JSON.stringify({description:exercise.description||"",muscle:exercise.muscle||exercise.primaryMuscle||"",primaryMuscle:exercise.primaryMuscle||exercise.muscle||"",secondaryMuscles:exercise.secondaryMuscles||[],muscleTags:exercise.muscleTags||[],equipment:exercise.equipment||[],exerciseType:exercise.exerciseType||"",movementPattern:exercise.movementPattern||"",laterality:exercise.laterality||"",substitutionFamily:exercise.substitutionFamily||"",weightEntryType:exercise.weightEntryType||"Total Weight",progressionMode:exercise.progressionMode||"manual",repUnit:exerciseRepUnit(exercise),sourceType:exercise.sourceType||"custom",startingWeightRecommendation:exercise.startingWeightRecommendation||null,setup:exercise.setup||[],cues:exercise.cues||[]});
  card.querySelector(".exercise-name").value = exercise.name || "";
  card.querySelector(".exercise-sets").value = exercise.sets ?? 3;
  card.querySelector(".exercise-min-reps").value = exercise.minReps ?? 8;
  card.querySelector(".exercise-max-reps").value = exercise.maxReps ?? 12;
  card.querySelector(".exercise-weight").value = displayWeightValue(exercise.startWeight ?? 0,data.profile?.units);
  card.querySelector(".exercise-target-rir").value = exercise.targetRir ?? 3;
  card.querySelector(".exercise-rest").value = exercise.rest ?? data.settings.rest;
  card.querySelector(".exercise-increment").value = exercise.increment ?? data.settings.increment;
  card.querySelector(".exercise-weight-label").textContent = `${weightEntryLabel(exercise.weightEntryType||"Total Weight")} (${weightUnit(data.profile?.units)})`;
  card.querySelector(".remove-exercise").onclick = () => card.remove();
  document.querySelector("#exerciseEditor").appendChild(node);
  FormValidation.clearKey(document.querySelector("#workoutForm"), "exercises");
}

function assignWorkoutValidationKeys() {
  const form = document.querySelector("#workoutForm");
  FormValidation.setKey(document.querySelector("#workoutNameInput"), "workoutName");
  FormValidation.setKey(document.querySelector("#exerciseEditor"), "exercises");
  [...form.querySelectorAll(".exercise-editor-card")].forEach((card, index) => {
    const prefix = `exercises.${index}`;
    FormValidation.setKey(card.querySelector(".exercise-name"), `${prefix}.name`);
    FormValidation.setKey(card.querySelector(".exercise-sets"), `${prefix}.sets`);
    FormValidation.setKey(card.querySelector(".exercise-min-reps"), `${prefix}.minReps`, [`${prefix}.maxReps`]);
    FormValidation.setKey(card.querySelector(".exercise-max-reps"), `${prefix}.maxReps`);
    FormValidation.setKey(card.querySelector(".exercise-weight"), `${prefix}.startWeight`);
    FormValidation.setKey(card.querySelector(".exercise-target-rir"), `${prefix}.targetRir`);
    FormValidation.setKey(card.querySelector(".exercise-rest"), `${prefix}.rest`);
    FormValidation.setKey(card.querySelector(".exercise-increment"), `${prefix}.increment`);
  });
}

function isWorkoutEditorFieldCorrected(field) {
  if (field.matches("input, select, textarea") && !field.checkValidity()) return false;
  if (field.classList.contains("exercise-name") || field.id === "workoutNameInput") return Boolean(field.value.trim());
  if (field.classList.contains("exercise-max-reps")) {
    const card = field.closest(".exercise-editor-card");
    return Number(field.value) >= Number(card.querySelector(".exercise-min-reps").value);
  }
  return field.value !== "";
}

function validateWorkoutEditor() {
  assignWorkoutValidationKeys();
  const result = FormValidation.createResult();
  const cards = [...document.querySelectorAll("#exerciseEditor .exercise-editor-card")];
  FormValidation.required(result, "workoutName", document.querySelector("#workoutNameInput").value, "Enter a workout name.");
  FormValidation.collection(result, "exercises", cards, { message: "Add at least one exercise." });
  cards.forEach((card, index) => {
    const prefix = `exercises.${index}`;
    const exerciseNumber = index + 1;
    const name = card.querySelector(".exercise-name").value;
    const minReps = card.querySelector(".exercise-min-reps").value;
    const maxReps = card.querySelector(".exercise-max-reps").value;
    FormValidation.required(result, `${prefix}.name`, name, "Enter an exercise name.");
    if (!name.trim()) result.summary.find(item => item.field === `${prefix}.name`).message = `Exercise ${exerciseNumber} needs a name.`;
    FormValidation.number(result, `${prefix}.sets`, card.querySelector(".exercise-sets").value, { label: "Sets", min: 1, max: 10, integer: true });
    FormValidation.number(result, `${prefix}.minReps`, minReps, { label: "Minimum reps or seconds", min: 1, max: 600, integer: true });
    FormValidation.number(result, `${prefix}.maxReps`, maxReps, { label: "Maximum reps or seconds", min: 1, max: 600, integer: true });
    if (minReps !== "" && maxReps !== "") FormValidation.related(result, `${prefix}.maxReps`, Number(maxReps) >= Number(minReps), "Maximum reps or seconds must be greater than or equal to the minimum.");
    FormValidation.number(result, `${prefix}.startWeight`, card.querySelector(".exercise-weight").value, { label: "Starting weight", min: 0 });
    FormValidation.number(result, `${prefix}.targetRir`, card.querySelector(".exercise-target-rir").value, { label: "Target RIR", min: 0, max: 10, integer: true });
    FormValidation.number(result, `${prefix}.rest`, card.querySelector(".exercise-rest").value, { label: "Rest seconds", min: 0, integer: true });
    FormValidation.number(result, `${prefix}.increment`, card.querySelector(".exercise-increment").value, { label: "Weight increase", min: 0 });
  });
  return result;
}

function deleteWorkout(id) {
  if (!confirm("Delete this workout?")) return;
  data.workouts = data.workouts.filter(w => w.id !== id);
  if (data.selectedWorkoutId === id) data.selectedWorkoutId = data.workouts[0]?.id || null;
  saveData();
}

function workoutMuscles(workout) {
  return [...new Set((workout?.exercises || []).map(exercise => {
    const targeted = exercise.targetMuscle || exercise.primaryMuscle || (exercise.muscle && exercise.muscle !== "Other" ? exercise.muscle : "");
    return String(targeted || exerciseMuscles(exercise)[0] || "").toLowerCase();
  }).filter(Boolean))];
}

function isPremadeWorkout(workout) {
  return ["push-a", "pull-a", "legs-a"].includes(workout?.id);
}

function workoutPreviewTotals(workout) {
  const exercises = workout?.exercises || [];
  const totalSets = exercises.reduce((sum, exercise) => sum + Number(exercise.sets || 0), 0);
  let seconds = 0;
  exercises.forEach((exercise, index) => {
    const sets = Number(exercise.sets || 0);
    const rest = Number(exercise.rest ?? data.settings.rest ?? 90);
    seconds += sets * 40 + Math.max(0, sets - 1) * rest;
    if (index < exercises.length - 1) seconds += 90;
  });
  const estimatedMinutes = Math.max(5, Math.round(seconds / 60 / 5) * 5);
  const primaryMuscles = [...new Set(exercises.map(exercise => exerciseMuscles(exercise)[0]).filter(Boolean))];
  const secondaryMuscles = [...new Set(exercises.flatMap(exercise => exerciseMuscles(exercise).slice(1)).filter(muscle => !primaryMuscles.includes(muscle)))];
  return { exerciseCount: exercises.length, totalSets, estimatedMinutes, primaryMuscles, secondaryMuscles };
}

function previewExerciseMarkup(exercise, index, originalExercise = null, adjustmentReason = "") {
  const muscles = exerciseMuscles(exercise);
  const rec = recommendationFor(exercise);
  const rest = Number(exercise.rest ?? data.settings.rest ?? 90);
  const weight = Number(rec.weight ?? exercise.startWeight ?? 0);
  const changed = originalExercise && ["sets", "startWeight", "targetRir", "minReps", "maxReps"].some(field => Number(originalExercise[field] ?? 0) !== Number(exercise[field] ?? 0));
  const originalWeight = Number(originalExercise?.startWeight ?? 0);
  return `<article class="preview-exercise">
    <h3>${index + 1}. ${escapeHtml(exercise.name)}</h3>
    <p><strong>Muscles:</strong> ${muscles.map(sorenessLabel).join(", ") || escapeHtml(exercise.muscle || "Other")}</p>
    <p><strong>Plan:</strong> ${Number(exercise.sets || 0)} working sets • ${Number(exercise.minReps || 0)}–${Number(exercise.maxReps || 0)} ${exerciseRepLabel(exercise)} • Target RIR ${Number(exercise.targetRir ?? 3)}</p>
    <p><strong>Rest:</strong> ${rest} seconds${weight ? ` • <strong>Recommended weight:</strong> ${weight} lb` : ""}</p>
    ${rec.note ? `<p><strong>Progression:</strong> ${escapeHtml(rec.note)}</p>` : ""}
    ${Number(rec.pain?.rating) >= 3 ? `<div class="preview-adjustment"><strong>Joint-pain recommendation:</strong> ${escapeHtml(rec.pain.note || `Pain rating ${rec.pain.rating}/5`)}${rec.pain.joints?.length ? `<br>Affected: ${rec.pain.joints.map(escapeHtml).join(", ")}` : ""}</div>` : ""}
    ${exercise.notes ? `<p><strong>Notes:</strong> ${escapeHtml(exercise.notes)}</p>` : ""}
    ${changed ? `<div class="preview-adjustment"><strong>Original:</strong> ${Number(originalExercise.sets || 0)} sets at ${originalWeight || "—"} lb, RIR ${Number(originalExercise.targetRir ?? 3)}<br><strong>Adjusted:</strong> ${Number(exercise.sets || 0)} sets at ${weight || "—"} lb, RIR ${Number(exercise.targetRir ?? 3)}${adjustmentReason ? `<br><span>${escapeHtml(adjustmentReason)}</span>` : ""}</div>` : ""}
  </article>`;
}

function closeWorkoutPreview() {
  const dialog = document.querySelector("#workoutPreviewDialog");
  if (dialog.open) dialog.close();
  window.scrollTo({ top: previewScrollPosition, behavior: "auto" });
  previewReturnFocus?.focus();
}

function savePremadeWorkoutCopy(workout) {
  const copy = structuredClone(workout);
  copy.id = crypto.randomUUID();
  copy.name = `${workout.name} Copy`;
  copy.exercises = copy.exercises.map(exercise => ({ ...exercise, id: crypto.randomUUID() }));
  data.workouts.push(copy);
  saveData();
  alert(`${copy.name} was saved to My Workouts.`);
}

function openWorkoutPreview(workout, options = {}) {
  if (!workout) return;
  previewReturnFocus = options.trigger || document.activeElement;
  previewScrollPosition = window.scrollY;
  const totals = workoutPreviewTotals(workout);
  const original = options.originalWorkout;
  document.querySelector("#workoutPreviewTitle").textContent = workout.name;
  document.querySelector("#workoutPreviewContent").innerHTML = `
    <p>${escapeHtml(workout.notes || "Review the complete planned workout before starting.")}</p>
    ${options.adjustmentReason ? `<p class="small-note"><strong>Current adjustment:</strong> ${escapeHtml(options.adjustmentReason)}</p>` : ""}
    <div class="preview-summary">
      <div class="summary-stat"><strong>${totals.estimatedMinutes} min</strong><span>Estimated time</span></div>
      <div class="summary-stat"><strong>${totals.exerciseCount}</strong><span>Exercises</span></div>
      <div class="summary-stat"><strong>${totals.totalSets}</strong><span>Working sets</span></div>
      <div class="summary-stat"><strong>${totals.primaryMuscles.map(sorenessLabel).join(", ") || "Mixed"}</strong><span>Primary muscles</span></div>
    </div>
    ${totals.secondaryMuscles.length ? `<p><strong>Secondary muscles:</strong> ${totals.secondaryMuscles.map(sorenessLabel).join(", ")}</p>` : ""}
    <p class="small-note">Estimated time uses 40 seconds per working set, the planned rest between sets, and 90 seconds between exercises, rounded to the nearest 5 minutes.</p>
    <h3>Exercise order</h3>
    <div>${workout.exercises.map((exercise, index) => previewExerciseMarkup(exercise, index, original?.exercises?.[index], options.adjustmentReason)).join("")}</div>`;
  const actions = document.querySelector("#workoutPreviewActions");
  actions.innerHTML = `${options.startAction === null ? "" : '<button id="startFromPreviewButton" class="primary-button">Start Workout</button>'}
    ${options.selectable ? '<button id="selectFromPreviewButton" class="secondary-button">Select This Workout</button>' : ""}
    ${isPremadeWorkout(workout) && !options.originalWorkout ? '<button id="savePreviewCopyButton" class="secondary-button">Save as My Workout</button>' : ""}
    ${options.editable ? '<button id="editFromPreviewButton" class="secondary-button">Edit Workout</button>' : ""}
    <button id="backFromPreviewButton" class="secondary-button">Back</button>`;
  document.querySelector("#startFromPreviewButton")?.addEventListener("click", () => {
    closeWorkoutPreview();
    if (options.startAction) options.startAction(); else startWorkout(workout.id, options.context || null);
  });
  document.querySelector("#selectFromPreviewButton")?.addEventListener("click", () => {
    if (options.selectAction) options.selectAction();
    else if (data.workouts.some(item => item.id === workout.id)) { data.selectedWorkoutId = workout.id; saveData(); }
    closeWorkoutPreview();
  });
  document.querySelector("#savePreviewCopyButton")?.addEventListener("click", () => savePremadeWorkoutCopy(workout));
  document.querySelector("#editFromPreviewButton")?.addEventListener("click", () => { closeWorkoutPreview(); openWorkoutEditor(workout); });
  document.querySelector("#backFromPreviewButton").addEventListener("click", closeWorkoutPreview);
  const dialog = document.querySelector("#workoutPreviewDialog");
  dialog.showModal();
  document.querySelector("#closeWorkoutPreviewButton").focus();
}

function exerciseMuscles(exercise) {
  if (exercise.primaryMuscle) return [...new Set([exercise.primaryMuscle,...(exercise.secondaryMuscles||[])].map(muscle=>String(muscle).toLowerCase()))];
  const text = `${exercise.name} ${exercise.muscle || ""}`.toLowerCase();
  const muscles = [];
  if (/chest|bench|pec|fly|push[- ]?up|incline.*press/.test(text)) muscles.push("chest");
  if (/shoulder|delt|overhead|bench|incline.*press|seated.*press/.test(text)) muscles.push("shoulders");
  if (/tricep|extension|pushdown|dip|bench|press/.test(text)) muscles.push("triceps");
  if (/back|row|pulldown|pull[- ]?up|lat|deadlift/.test(text)) muscles.push("back");
  if (/bicep|curl|pulldown|row|pull[- ]?up/.test(text)) muscles.push("biceps");
  if (/quad|squat|lunge|leg press|split squat|step[- ]?up/.test(text)) muscles.push("quads");
  if (/hamstring|deadlift|leg curl|romanian|hip hinge/.test(text)) muscles.push("hamstrings");
  if (/calf|calves/.test(text)) muscles.push("calves");
  if (/core|abdominal|\babs\b|plank|crunch|sit[- ]?up|carry/.test(text)) muscles.push("core");
  if (!muscles.length && exercise.muscle) muscles.push(String(exercise.muscle).toLowerCase());
  return [...new Set(muscles)];
}

function sorenessLabel(muscle) {
  return muscle.replace(/\b\w/g, letter => letter.toUpperCase());
}

function isIsolationExercise(exercise) {
  return /curl|extension|raise|fly|pushdown|calf|crunch|kickback/.test(exercise.name.toLowerCase());
}

function buildSorenessPlan(workout) {
  const changes = workout.exercises.map(exercise => {
    const muscles = exerciseMuscles(exercise);
    const severity = Math.max(0, ...muscles.map(muscle => sorenessAnswers[muscle] ?? 0));
    const cause = muscles.find(muscle => (sorenessAnswers[muscle] ?? 0) === severity) || muscles[0] || "muscle";
    const rec = recommendationFor(exercise);
    const original = { sets: Number(exercise.sets), weight: Number(rec.weight), minReps: Number(exercise.minReps), maxReps: Number(exercise.maxReps), targetRir: Number(exercise.targetRir ?? 3) };
    const adjusted = { ...original };
    if (severity === 2) {
      adjusted.sets = Math.max(1, Math.floor(original.sets * .75));
      adjusted.targetRir = original.targetRir + 1;
      const prior = latestExerciseResult(exercise.id);
      if (prior) adjusted.weight = Math.min(adjusted.weight, Number(prior.weight));
    }
    if (severity === 3) {
      adjusted.sets = isIsolationExercise(exercise) ? 0 : Math.max(1, Math.floor(original.sets * .5));
      adjusted.weight = Math.max(0, Math.round(original.weight * .85 / 2.5) * 2.5);
      adjusted.targetRir = Math.max(4, original.targetRir + 1);
    }
    return { exerciseId: exercise.id, exerciseName: exercise.name, muscles, severity, causedBy: cause, original, adjusted };
  });
  return { changes, hasHigh: changes.some(change => change.severity === 3), hasAdjustment: changes.some(change => change.severity >= 2) };
}

function updateRecoveryRecommendation() {
  const workout = data.workouts.find(item => item.id === pendingWorkoutId);
  pendingSorenessPlan = buildSorenessPlan(workout);
  const unanswered = workoutMuscles(workout).filter(muscle => sorenessAnswers[muscle] == null);
  const panel = document.querySelector("#recoveryRecommendation");
  const accept = document.querySelector("#startRecommendedButton");
  const skip = document.querySelector("#skipSoreMusclesButton");
  const previewAdjusted = document.querySelector("#previewAdjustedWorkoutButton");
  if (unanswered.length) {
    panel.innerHTML = `<h3>Complete the check-in</h3><p>Rate ${unanswered.map(sorenessLabel).join(", ")} to review today's prescription.</p>`;
    accept.disabled = true; skip.classList.add("hidden"); previewAdjusted.classList.add("hidden"); return;
  }
  accept.disabled = false;
  skip.classList.toggle("hidden", !pendingSorenessPlan.hasHigh);
  previewAdjusted.classList.toggle("hidden", !pendingSorenessPlan.hasAdjustment);
  const notes = [];
  Object.entries(sorenessAnswers).forEach(([muscle, rating]) => {
    if (rating === 1) notes.push(`<p><strong>${sorenessLabel(muscle)}:</strong> Mild soreness detected. Continue as planned and reassess during warm-up sets.</p>`);
    if (rating === 3) notes.push(`<p class="recovery-warning">${sorenessLabel(muscle)}: High soreness detected. Consider skipping direct work for this muscle group or using a light recovery session.</p>`);
  });
  pendingSorenessPlan.changes.filter(change => change.severity >= 2).forEach(change => notes.push(`<div class="prescription-change"><strong>${escapeHtml(change.exerciseName)}</strong><p>Adjusted because of ${sorenessLabel(change.causedBy)}: ${change.original.sets} sets at ${change.original.weight} lb, RIR ${change.original.targetRir} → ${change.adjusted.sets || "skip"} sets at ${change.adjusted.weight} lb, RIR ${change.adjusted.targetRir}</p></div>`));
  panel.innerHTML = `<h3>${pendingSorenessPlan.hasAdjustment ? "Review adjusted workout" : "Continue as planned"}</h3>${notes.join("") || "<p>No soreness adjustments are recommended.</p>"}`;
}

function validateSorenessCheckIn() {
  const result = FormValidation.createResult();
  const workout = data.workouts.find(item => item.id === pendingWorkoutId);
  workoutMuscles(workout).forEach(muscle => {
    if (sorenessAnswers[muscle] == null) FormValidation.addError(result, `soreness.${muscle}`, `Choose a soreness rating for ${sorenessLabel(muscle)}.`);
  });
  return FormValidation.apply(document.querySelector("#recoveryDialog .dialog-card"), result, {
    summaryTitle: "Complete the soreness check-in before starting:"
  });
}

function previewAdjustedWorkout(trigger) {
  if (!pendingWorkoutId || !pendingSorenessPlan) return;
  const original = data.workouts.find(workout => workout.id === pendingWorkoutId);
  const adjusted = structuredClone(original);
  adjusted.exercises = adjusted.exercises.map(exercise => {
    const change = pendingSorenessPlan.changes.find(item => item.exerciseId === exercise.id);
    return change ? { ...exercise, sets: change.adjusted.sets, startWeight: change.adjusted.weight, targetRir: change.adjusted.targetRir } : exercise;
  });
  const workoutId = pendingWorkoutId, workoutContext = pendingWorkoutContext;
  openWorkoutPreview(adjusted, {
    trigger,
    originalWorkout: original,
    adjustmentReason: "Adjusted from today's completed muscle-soreness check-in.",
    startAction: () => {
      const soreness = { ratings: structuredClone(sorenessAnswers), changes: structuredClone(pendingSorenessPlan.changes), decision: "accepted", date: new Date().toISOString(), week: workoutContext?.week, cycle: workoutContext?.cycle, cycleDay: workoutContext?.cycleDay, scheduleType: workoutContext?.scheduleType, workoutName: original.name };
      document.querySelector("#recoveryDialog").close();
      pendingWorkoutId = null; pendingWorkoutContext = null; pendingSorenessPlan = null;
      beginWorkout(workoutId, soreness, workoutContext, "adjusted");
    }
  });
}

function startWorkout(id, context = null) {
  const workout = data.workouts.find(item => item.id === id);
  if (!workout) return;
  const recoveryPeriod = context?.scheduleType === "rolling" ? Number(context.cycle) : Number(context?.week);
  if (!context || recoveryPeriod < 2) {
    beginWorkout(id, null, context, "original");
    return;
  }
  pendingWorkoutId = id; pendingWorkoutContext = context; sorenessAnswers = {}; pendingSorenessPlan = null;
  FormValidation.clearAll(document.querySelector("#recoveryDialog .dialog-card"));
  const grid = document.querySelector("#sorenessGrid");
  grid.innerHTML = "";
  workoutMuscles(workout).forEach(muscle => {
    const control = document.createElement("section"); control.className = "soreness-control";
    FormValidation.setKey(control, `soreness.${muscle}`);
    control.innerHTML = `<strong>${sorenessLabel(muscle)} soreness</strong><div class="soreness-options">${["Not sore", "A little sore", "I still feel it", "I can barely move"].map((label,index)=>`<button class="soreness-option" data-rating="${index}">${label}</button>`).join("")}</div>`;
    control.querySelectorAll(".soreness-option").forEach(button => button.onclick = () => {
      sorenessAnswers[muscle] = Number(button.dataset.rating);
      FormValidation.clearKey(document.querySelector("#recoveryDialog .dialog-card"), `soreness.${muscle}`);
      control.querySelectorAll(".soreness-option").forEach(option => option.classList.toggle("active", option === button));
      updateRecoveryRecommendation();
    });
    grid.appendChild(control);
  });
  updateRecoveryRecommendation();
  document.querySelector("#recoveryDialog").showModal();
}

function beginWorkout(id, sorenessRecord, context = pendingWorkoutContext, decision = "original") {
  const workout = data.workouts.find(w => w.id === id);
  if (!workout) return;
  data.selectedWorkoutId = id;
  currentSession = {
    workoutId: id,
    workoutName: workout.name,
    date: new Date().toISOString(),
    soreness: sorenessRecord ? structuredClone(sorenessRecord) : null,
    mesocycle: context ? structuredClone(context) : null,
    exercises: workout.exercises.map(e => {
      const rec = recommendationFor(e);
      const starting = structuredClone(rec.starting || e.startingWeightRecommendation || startingWeightRecommendation(e));
      const calibrationAllowed = Boolean(starting.calibrationRecommended) && startingWeightCalibrationEligible(e, context);
      starting.calibrationRecommended = calibrationAllowed;
      const change = sorenessRecord?.changes?.find(item => item.exerciseId === e.id);
      const prescription = decision === "original" || !change ? change?.original : change.adjusted;
      if (decision === "skip-high" && change?.severity === 3) prescription.sets = 0;
      const pain = rec.pain || { rating: 1, joints: [] };
      let plannedSets = prescription?.sets ?? e.sets;
      let plannedRir = prescription?.targetRir ?? Number(e.targetRir ?? 3);
      if (pain.rating === 3) plannedRir += 1;
      const reducedPainSets = pain.rating >= 4 ? Math.max(1, Math.floor(plannedSets * .5)) : plannedSets;
      if (pain.rating === 4) plannedRir = Math.max(4, plannedRir);
      if (pain.rating >= 4) plannedSets = 0;
      return {
        exerciseId: e.id,
        libraryExerciseId: e.libraryExerciseId || null,
        name: e.name,
        weightEntryType: e.weightEntryType || definitionForExercise(e)?.defaults?.weightEntryType || "Total Weight",
        progressionMode: e.progressionMode || definitionForExercise(e)?.progressionMode || "manual",
        repUnit: exerciseRepUnit(e),
        weight: prescription?.weight ?? rec.weight,
        recommendation: rec.note,
        startingWeightRecommendation: structuredClone(starting),
        calibrationAttempts: [],
        calibrationComplete: !calibrationAllowed,
        calibrationStarted: false,
        calibrationMaxed: false,
        calibrationDecision: calibrationAllowed ? "pending" : "not-needed",
        feedback: "about-right",
        targetRir: plannedRir,
        jointPain: { rating: null, joints: [] },
        priorPainPlan: pain,
        painRecommendationDecision: pain.rating >= 4 ? "pending" : pain.rating === 3 ? "accepted" : "none",
        reducedPainSets,
        originalPrescription: { sets: Number(e.sets), weight: Number(rec.pain?.rating >= 3 ? latestExerciseResult(e.id)?.weight ?? e.startWeight : rec.weight), targetRir: Number(e.targetRir ?? 3) },
        sets: Array.from({ length: plannedSets }, () => ({ reps: e.minReps, done: false }))
      };
    }).filter(exercise => exercise.sets.length > 0 || exercise.priorPainPlan.rating >= 4)
  };
  renderSession();
  document.querySelector("#sessionDialog").showModal();
  saveData();
}

function renderSession() {
  renderUpdateNotice();
  document.querySelector("#sessionWorkoutName").textContent = currentSession.workoutName;
  const list = document.querySelector("#sessionExerciseList");
  list.innerHTML = "";
  const workout = data.workouts.find(w => w.id === currentSession.workoutId);

  currentSession.exercises.forEach((ex, exIndex) => {
    const definition = ex.sessionPrescription || workout.exercises.find(e => e.id === ex.exerciseId) || data.workouts.flatMap(item => item.exercises).find(e => e.id === ex.exerciseId);
    const painDescriptions = ["", "No joint pain", "Minor discomfort", "Noticeable pain", "Significant pain", "Severe pain or unable to perform normally"];
    const joints = ["Shoulder","Elbow","Wrist","Hand","Hip","Knee","Ankle","Foot","Lower back","Upper back","Neck","Other"];
    const painPlan = ex.priorPainPlan || { rating: 1, joints: [] };
    const starting = ex.startingWeightRecommendation || { label: "Saved starting weight", reason: "Saved with this workout.", calibrationRecommended: false };
    const substitutions = data.workouts.flatMap(w => w.exercises).filter(candidate => candidate.id !== ex.exerciseId && candidate.name !== ex.name && exerciseMuscles(candidate).some(muscle => exerciseMuscles(definition).includes(muscle))).filter((candidate,index,array)=>array.findIndex(item=>item.name===candidate.name)===index).slice(0,8);
    const sessionUnit=weightUnit(data.profile?.units);const entryLabel=weightEntryLabel(definition.weightEntryType||definition.defaults?.weightEntryType||"Total Weight");
    const calibrationPanel = !ex.calibrationComplete && starting.calibrationRecommended ? `<div class="calibration-panel"><h4>Find Your Starting Weight</h4><p>${escapeHtml(starting.reason)}</p><p><strong>Suggested test weight:</strong> ${displayWeightValue(ex.weight,data.profile?.units)} ${sessionUnit} • ${definition.minReps}–${definition.maxReps} ${exerciseRepLabel(ex)} • target RIR ${ex.targetRir} • ${escapeHtml(entryLabel)}</p><div class="exercise-actions"><button class="secondary-button calibration-minus" type="button" aria-label="Decrease test weight">−</button><button class="primary-button start-calibration" type="button">${ex.calibrationStarted?"Calibration set started":"Start Calibration Set"}</button><button class="secondary-button calibration-plus" type="button" aria-label="Increase test weight">+</button></div>${ex.calibrationStarted&&!ex.calibrationMaxed?`<label>Repetitions completed<input class="calibration-reps" type="number" min="0" max="100" value="${definition.minReps}"></label><label>How many more good repetitions could you have completed?<select class="calibration-result"><option value="">Choose a result</option><option value="0-1">0 to 1</option><option value="2-3">2 to 3</option><option value="4-5">4 to 5</option><option value="6-plus">6 or more</option><option value="unsure">I am not sure</option><option value="unsafe">The weight felt unsafe</option><option value="joint-pain">I experienced joint pain</option></select></label><button class="secondary-button apply-calibration" type="button">Apply calibration result</button>`:""}${ex.calibrationMaxed?`<p class="recovery-warning">Three calibration attempts are complete. Use the current weight, enter a different weight manually, skip, or replace the exercise.</p><div class="exercise-actions"><button class="secondary-button accept-calibration" type="button">Use current weight</button><button class="secondary-button skip-calibration-exercise" type="button">Skip exercise</button></div>${substitutions.length?`<label>Replace exercise<select class="calibration-substitute"><option value="">Choose replacement</option>${substitutions.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label>`:""}`:""}<button class="secondary-button skip-calibration" type="button">Use weight without calibration</button><p class="small-note">Attempt ${Math.min((ex.calibrationAttempts?.length||0)+1,3)} of 3. Calibration is an estimate, not a strength test.</p></div>` : "";
    const futureWarning = painPlan.rating >= 3 ? `<div class="future-warning"><strong>${painPlan.rating >= 5 ? "Severe" : painPlan.rating === 4 ? "Significant" : "Noticeable"} joint pain was previously reported.</strong><p>${painPlan.rating >= 5 ? "Stop using this exercise if it reproduces the pain. Consider seeking evaluation from a qualified medical professional." : painPlan.rating === 4 ? "Consider replacing this exercise and avoiding movements that reproduce the pain." : "The next-workout load and RIR were adjusted. Review technique and consider a substitution."}</p>${painPlan.joints?.length ? `<p>Affected: ${painPlan.joints.map(escapeHtml).join(", ")}</p>` : ""}<div class="exercise-actions">${painPlan.rating===4?'<button class="secondary-button pain-use-reduced">Use reduced prescription</button>':""}<button class="secondary-button pain-keep-original">Keep original</button><button class="secondary-button pain-skip">Skip exercise</button></div>${substitutions.length ? `<label>Replacement<select class="pain-substitute"><option value="">Choose replacement</option>${substitutions.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label>` : ""}</div>` : "";
    const card = document.createElement("article");
    card.className = "exercise-card";
    card.innerHTML = `
      <h3>${escapeHtml(ex.name)}</h3>
      ${futureWarning}
      <p class="exercise-meta">${definition.minReps}-${definition.maxReps} ${exerciseRepLabel(ex)} • Target RIR ${ex.targetRir} • ${escapeHtml(ex.recommendation)}</p>
      <label>${escapeHtml(entryLabel)} (${sessionUnit})<input class="session-weight" type="number" step="${data.profile?.units==="metric"?.5:2.5}" min="0" value="${displayWeightValue(ex.weight,data.profile?.units)}"></label>
      ${calibrationPanel}
      <div class="set-list"></div>
      <p class="small-note">How difficult was this exercise?</p>
      <div class="feedback-grid">
        <button class="feedback-button" data-feedback="easy">Too easy</button>
        <button class="feedback-button active" data-feedback="about-right">About right</button>
        <button class="feedback-button" data-feedback="very-hard">Very hard</button>
        <button class="feedback-button" data-feedback="failed">Failed target</button>
      </div>
      <p class="small-note">Did you experience joint pain during this exercise?</p>
      <div class="pain-scale">${[1,2,3,4,5].map(rating=>`<button class="pain-button ${ex.jointPainAnswered&&ex.jointPain.rating===rating?"active":""}" data-pain="${rating}" aria-pressed="${ex.jointPainAnswered&&ex.jointPain.rating===rating}" aria-label="Joint pain ${rating}: ${painDescriptions[rating]}"><span>${rating}</span><small>${painDescriptions[rating]}</small></button>`).join("")}</div>
      <p class="pain-description ${ex.jointPain.rating>=4?"recovery-warning":""}">${!ex.jointPainAnswered?"Choose the joint-pain rating that applies.":ex.jointPain.rating===4?"Significant joint pain was reported. Consider replacing this exercise and avoiding movements that reproduce the pain.":ex.jointPain.rating===5?"Severe joint pain was reported. Stop using this exercise if it reproduces the pain. Consider seeking evaluation from a qualified medical professional.":painDescriptions[ex.jointPain.rating]}</p>
      <div class="joint-grid">${joints.map(joint=>`<label class="joint-choice"><input type="checkbox" value="${joint}" ${ex.jointPain.joints.includes(joint)?"checked":""}>${joint}</label>`).join("")}</div>`;
    card.querySelector(".session-weight").oninput = e => ex.weight = internalWeightValue(e.target.value,data.profile?.units);
    card.querySelector(".calibration-minus")?.addEventListener("click",()=>{const increment=definition.increment||definition.defaults?.weightIncrement||data.settings.increment;ex.weight=Math.max(0,roundStartingWeight(ex.weight-increment,increment));renderSession();});
    card.querySelector(".calibration-plus")?.addEventListener("click",()=>{const increment=definition.increment||definition.defaults?.weightIncrement||data.settings.increment;ex.weight=roundStartingWeight(ex.weight+increment,increment);renderSession();});
    card.querySelector(".start-calibration")?.addEventListener("click",()=>{ex.calibrationStarted=true;renderSession();});
    card.querySelector(".apply-calibration")?.addEventListener("click", () => {
      const result = card.querySelector(".calibration-result").value;
      if (!result) return alert("Choose the result of your test set.");
      const definitionIncrement = definition.increment || definition.defaults?.weightIncrement || data.settings.increment;
      const enteredWeight = internalWeightValue(card.querySelector(".session-weight").value,data.profile?.units);
      const repetitionsCompleted = Number(card.querySelector(".calibration-reps")?.value||0);
      if (!enteredWeight && !["unsafe","joint-pain"].includes(result)) return alert("Enter the weight used for the test set.");
      let nextWeight = enteredWeight;
      let complete = result === "2-3";
      let note = "Calibration accepted in the target range.";
      if (result === "0-1") { nextWeight = Math.max(0,Math.min(roundStartingWeight(enteredWeight * .875, definitionIncrement),enteredWeight-definitionIncrement)); note = "Reduced after a difficult test set."; }
      if (result === "4-5") { nextWeight = Math.max(roundStartingWeight(enteredWeight * 1.075, definitionIncrement),enteredWeight+definitionIncrement); note = "Increased slightly after a light test set."; }
      if (result === "6-plus") { nextWeight = Math.max(roundStartingWeight(enteredWeight * 1.125, definitionIncrement),enteredWeight+definitionIncrement); note = "Increased after a very light test set."; }
      if (result === "unsure") { complete = false; note = "Result uncertain — repeat the same weight, enter another weight, or accept it conservatively."; }
      if (result === "unsafe" || result === "joint-pain") { nextWeight = Math.max(0,Math.min(roundStartingWeight(enteredWeight * .75, definitionIncrement),enteredWeight-definitionIncrement)); complete = true; note = result === "unsafe" ? "Calibration stopped because the movement felt unsafe." : "Calibration stopped because joint discomfort or pain was reported."; }
      const attempt = { date:new Date().toISOString(), exerciseId:ex.exerciseId, libraryExerciseId:ex.libraryExerciseId, exerciseName:ex.name, workoutId:currentSession.workoutId, mesocycleId:currentSession.mesocycle?.mesocycleId||null, repetitionsCompleted, repetitionsRemaining:result, testWeight:enteredWeight, result, recommendedNextWeight:nextWeight, finalAcceptedWeight:complete?nextWeight:null, note };
      ex.calibrationAttempts = [...(ex.calibrationAttempts || []), attempt];
      ex.weight = nextWeight;
      if (!complete && ex.calibrationAttempts.length >= 3) { ex.calibrationMaxed=true; note = "Three calibration attempts completed. Choose the current weight, enter one manually, skip, or replace the exercise."; }
      ex.calibrationComplete = complete;
      ex.calibrationDecision = complete ? (["unsafe","joint-pain"].includes(result) ? "stopped" : "completed") : "repeat";
      ex.recommendation = note;
      data.profile.calibrationHistory.push(structuredClone(attempt));
      data.profile.startingWeightRecommendations.push({date:attempt.date,exerciseId:ex.exerciseId,libraryExerciseId:ex.libraryExerciseId,exerciseName:ex.name,weight:nextWeight,label:complete?"Based on your exercise history":"Calibration in progress",reason:note,confidence:complete?"high":"calibration",calibrationRecommended:!complete});
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (["unsafe","joint-pain"].includes(result)) alert("Calibration stopped. Do not increase the load. You may skip or replace the exercise, and joint pain can be recorded below.");
      renderSession();
    });
    card.querySelector(".skip-calibration")?.addEventListener("click", () => {
      ex.calibrationComplete = true;
      ex.calibrationDecision = "manual-override";
      ex.recommendation = "Calibration skipped — manual starting weight used";
      const manualWeight=internalWeightValue(card.querySelector(".session-weight").value,data.profile?.units);ex.weight=manualWeight;
      const attempt = { date:new Date().toISOString(), exerciseId:ex.exerciseId, libraryExerciseId:ex.libraryExerciseId, exerciseName:ex.name, workoutId:currentSession.workoutId, mesocycleId:currentSession.mesocycle?.mesocycleId||null, repetitionsCompleted:null,repetitionsRemaining:null,testWeight:manualWeight, result:"manual-override", recommendedNextWeight:manualWeight, finalAcceptedWeight:manualWeight, note:"User chose to use a manual starting weight without calibration." };
      ex.calibrationAttempts = [...(ex.calibrationAttempts || []), attempt];
      data.profile.calibrationHistory.push(structuredClone(attempt));
      data.profile.startingWeightRecommendations.push({date:attempt.date,exerciseId:ex.exerciseId,libraryExerciseId:ex.libraryExerciseId,exerciseName:ex.name,weight:manualWeight,label:"Manual starting weight",reason:attempt.note,confidence:"manual",calibrationRecommended:false});
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      renderSession();
    });
    card.querySelector(".accept-calibration")?.addEventListener("click",()=>{ex.calibrationComplete=true;ex.calibrationDecision="completed-after-three-attempts";const accepted={date:new Date().toISOString(),exerciseId:ex.exerciseId,libraryExerciseId:ex.libraryExerciseId,exerciseName:ex.name,workoutId:currentSession.workoutId,mesocycleId:currentSession.mesocycle?.mesocycleId||null,result:"accepted-after-three-attempts",testWeight:ex.weight,recommendedNextWeight:ex.weight,finalAcceptedWeight:ex.weight,note:"Current weight accepted after three calibration attempts."};ex.calibrationAttempts.push(accepted);data.profile.calibrationHistory.push(structuredClone(accepted));localStorage.setItem(STORAGE_KEY,JSON.stringify(data));renderSession();});
    card.querySelector(".skip-calibration-exercise")?.addEventListener("click",()=>{ex.sets=[];ex.calibrationComplete=true;ex.calibrationDecision="skipped-exercise";renderSession();});
    card.querySelector(".calibration-substitute")?.addEventListener("change",event=>{const replacement=data.workouts.flatMap(item=>item.exercises).find(item=>item.id===event.target.value);if(!replacement)return;const recommendation=recommendationFor(replacement);ex.exerciseId=replacement.id;ex.libraryExerciseId=replacement.libraryExerciseId||null;ex.name=replacement.name;ex.weight=recommendation.weight;ex.targetRir=Number(replacement.targetRir??3);ex.sets=Array.from({length:replacement.sets},()=>({reps:replacement.minReps,done:false}));ex.startingWeightRecommendation=recommendation.starting||startingWeightRecommendation(replacement);ex.calibrationAttempts=[];ex.calibrationStarted=false;ex.calibrationMaxed=false;ex.calibrationComplete=!ex.startingWeightRecommendation.calibrationRecommended;ex.calibrationDecision="replaced";renderSession();});
    const setList = card.querySelector(".set-list");
    ex.sets.forEach((set, setIndex) => {
      const row = document.createElement("div");
      row.className = "set-row";
      row.innerHTML = `
        <span>Set ${setIndex + 1}</span>
        <input type="number" min="0" max="100" value="${set.reps}" aria-label="Reps for set ${setIndex + 1}">
        <button class="complete-set ${set.done ? "done" : ""}" aria-label="Complete set">${set.done ? "✓" : "○"}</button>`;
      row.querySelector("input").oninput = e => set.reps = Number(e.target.value);
      row.querySelector(".complete-set").onclick = () => {
        set.done = !set.done;
        renderSession();
      };
      setList.appendChild(row);
    });
    card.querySelectorAll(".feedback-button").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.feedback === ex.feedback);
      btn.onclick = () => { ex.feedback = btn.dataset.feedback; renderSession(); };
    });
    card.querySelectorAll(".pain-button").forEach(btn => btn.onclick = () => { ex.jointPain.rating = Number(btn.dataset.pain); ex.jointPainAnswered = ex.jointPain.rating === 1; renderSession(); });
    card.querySelectorAll(".joint-choice input").forEach(input => input.onchange = () => {
      ex.jointPain.joints = [...card.querySelectorAll(".joint-choice input:checked")].map(item => item.value);
    });
    card.querySelector(".pain-keep-original")?.addEventListener("click", () => {
      ex.weight = ex.originalPrescription.weight; ex.targetRir = ex.originalPrescription.targetRir;
      ex.sets = Array.from({length: ex.originalPrescription.sets}, () => ({reps: definition.minReps, done:false}));
      ex.painRecommendationDecision = "overridden"; renderSession();
    });
    card.querySelector(".pain-use-reduced")?.addEventListener("click", () => {
      ex.sets = Array.from({length: ex.reducedPainSets}, () => ({reps: definition.minReps, done:false}));
      ex.painRecommendationDecision = "accepted reduced prescription"; renderSession();
    });
    card.querySelector(".pain-skip")?.addEventListener("click", () => { ex.sets = []; ex.painRecommendationDecision = "skipped"; renderSession(); });
    card.querySelector(".pain-substitute")?.addEventListener("change", event => {
      const replacement = data.workouts.flatMap(w=>w.exercises).find(item=>item.id===event.target.value); if(!replacement)return;
      ex.exerciseId=replacement.id; ex.name=replacement.name; ex.weight=recommendationFor(replacement).weight; ex.targetRir=Number(replacement.targetRir??3);
      ex.sets=Array.from({length:replacement.sets},()=>({reps:replacement.minReps,done:false})); ex.painRecommendationDecision="replaced"; ex.substitution={from:definition.name,to:replacement.name}; renderSession();
    });
    list.appendChild(card);
  });
}

function finishWorkout() {
  const unresolvedCalibration=currentSession.exercises.find(exercise=>!exercise.calibrationComplete&&exercise.startingWeightRecommendation?.calibrationRecommended);if(unresolvedCalibration)return alert(`Finish, skip, replace, or manually override starting-weight calibration for ${unresolvedCalibration.name}.`);
  const unresolvedPain = currentSession.exercises.find(exercise => exercise.painRecommendationDecision === "pending");
  if (unresolvedPain) return alert(`Choose replace, skip, reduced, or manual override for ${unresolvedPain.name}.`);
  const missingJoint = currentSession.exercises.find(exercise => Number(exercise.jointPain?.rating) > 1 && !exercise.jointPain.joints?.length);
  if (missingJoint) return alert(`Select the affected joint for ${missingJoint.name}.`);
  const completedCount = currentSession.exercises.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0);
  if (!completedCount && !confirm("No sets are marked complete. Save anyway?")) return;
  const finishedSession = structuredClone(currentSession);
  finishedSession.exercises.forEach(exercise => markExerciseUsed(exercise.libraryExerciseId));
  data.history.unshift(finishedSession);
  if (typeof onMesocycleWorkoutFinished === "function") onMesocycleWorkoutFinished(finishedSession);
  currentSession = null;
  renderUpdateNotice();
  document.querySelector("#sessionDialog").close();
  saveData();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function applyMissingWeightRecommendations(exercises){let count=0;exercises.forEach(exercise=>{if(latestExerciseResult(exercise.id)||Number(exercise.startWeight)>0)return;const recommendation=startingWeightRecommendation(exercise);exercise.startingWeightRecommendation=recommendation;if(recommendation.weight>0){exercise.startWeight=recommendation.weight;count++;}});data.profile.recalculationHistory.push({date:new Date().toISOString(),updatedExercises:count});saveData();return count;}
function standardRecalculationExercises(){return[...data.workouts.flatMap(workout=>workout.exercises),...data.mesocycles.drafts.flatMap(meso=>meso.schedule.flatMap(slot=>slot.workout.exercises))];}
function activeMesocycleExercises(){return data.mesocycles?.active?.schedule?.flatMap(slot=>slot.workout.exercises)||[];}

function canonicalViewId(viewId) {
  return ({ home: "homeView", library: "builderView", programs: "builderView", build: "programsView", workouts: "programsView", history: "historyView", profile: "profileView" })[viewId] || viewId;
}

function activateAppView(requestedViewId, options = {}) {
  const viewId = canonicalViewId(requestedViewId);
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".dock-tab").forEach(button => {
    const active = button.dataset.dockView === viewId;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  const tab = document.querySelector(`.tab[data-view="${viewId}"]`);
  const view = document.querySelector(`#${viewId}`);
  if (!tab || !view) return;
  tab.classList.add("active");
  view.classList.add("active");
  if (viewId === "homeView") renderHome();
  if (viewId === "programsView" && typeof renderPrograms === "function") renderPrograms();
  if (viewId === "builderView") {
    renderLibrary();
    if (options.librarySection) setLibrarySection(options.librarySection, { focus: false });
  }
  data.ui = { ...defaultData.ui, ...(data.ui || {}), activeView: viewId };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  if (options.scroll !== false) window.scrollTo({ top: 0, behavior: "smooth" });
  if (options.focus !== false) {
    const heading = view.querySelector("h2");
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
}

function restoreNavigationState() {
  data.ui = migrateNavigationState(data.ui || {});
  activateAppView(data.ui.activeView, { focus: false, scroll: false });
}

document.querySelectorAll(".tab").forEach(tab => tab.onclick = () => activateAppView(tab.dataset.view));
document.querySelectorAll(".dock-tab").forEach(button => button.onclick = () => activateAppView(button.dataset.dockView));
document.querySelectorAll(".library-section-tab").forEach(button => button.onclick = () => setLibrarySection(button.dataset.librarySection));
document.querySelector("#buildFromPremadeButton").onclick = () => activateAppView("builderView", { librarySection: "premade" });
document.querySelector("#buildCustomMesoButton").onclick = () => { if (typeof openMesocycleBuilder === "function") openMesocycleBuilder(); };

document.querySelector("#startWorkoutButton").onclick = () => {
  if (data.selectedWorkoutId) startWorkout(data.selectedWorkoutId);
  else document.querySelector('[data-view="builderView"]').click();
};
document.querySelector("#newWorkoutButton").onclick = () => openWorkoutEditor();
document.querySelector("#closeWorkoutEditorButton").onclick = cancelWorkoutEditor;
document.querySelector("#workoutDialog").addEventListener("cancel", event => { event.preventDefault(); cancelWorkoutEditor(); });
document.querySelector("#addExerciseButton").onclick = () => addExerciseEditor();
document.querySelector("#openExerciseLibraryButton").onclick = () => openExerciseLibrary({type:"browse"});
document.querySelector("#browseExercisesForWorkoutButton").onclick = () => openExerciseLibrary({type:"workout"});
document.querySelector("#closeExerciseLibraryButton").onclick = closeExerciseLibrary;
document.querySelector("#exerciseLibraryDialog").addEventListener("cancel",event=>{event.preventDefault();closeExerciseLibrary();});
document.querySelector("#closeExercisePreviewButton").onclick = closeExercisePreview;
document.querySelector("#exercisePreviewDialog").addEventListener("cancel",event=>{event.preventDefault();closeExercisePreview();});
document.querySelector("#exerciseLibrarySearch").oninput = event => {exerciseLibraryFilters.search=event.target.value;renderExerciseLibrary();};
document.querySelector("#equipmentFilter").onchange = event => {exerciseLibraryFilters.equipment=event.target.value;renderExerciseLibrary();};
document.querySelector("#loadTypeFilter").onchange = event => {exerciseLibraryFilters.loadType=event.target.value;renderExerciseLibrary();};
document.querySelector("#exerciseTypeFilter").onchange = event => {exerciseLibraryFilters.type=event.target.value;renderExerciseLibrary();};
document.querySelector("#favoritesFilterButton").onclick = () => {exerciseLibraryFilters.favorites=!exerciseLibraryFilters.favorites;renderExerciseLibrary();};
document.querySelector("#recentFilterButton").onclick = () => {exerciseLibraryFilters.recent=!exerciseLibraryFilters.recent;renderExerciseLibrary();};
document.querySelector("#clearExerciseFiltersButton").onclick = () => {exerciseLibraryFilters={search:"",muscle:"",equipment:"",loadType:"",type:"",favorites:false,recent:false};document.querySelector("#exerciseLibrarySearch").value="";document.querySelector("#equipmentFilter").value="";document.querySelector("#loadTypeFilter").value="";document.querySelector("#exerciseTypeFilter").value="";renderExerciseLibrary();};
document.querySelector("#createCustomExerciseButton").onclick = createCustomExercise;
document.querySelector("#closeProgramPreviewButton").onclick = closeProgramPreview;
document.querySelector("#backProgramPreviewButton").onclick = closeProgramPreview;
document.querySelector("#buildPreviewedProgramButton").onclick = () => { if(previewedProgramTemplate)buildProgramMesocycle(previewedProgramTemplate); };
document.querySelector("#programPreviewDialog").addEventListener("cancel",event=>{event.preventDefault();closeProgramPreview();});
document.querySelector("#closeActiveProgramButton").onclick=closeActiveProgramOptions;
document.querySelector("#activeProgramDialog").addEventListener("cancel",event=>{event.preventDefault();closeActiveProgramOptions();});
document.querySelector("#previewPendingProgramButton").onclick=()=>{const template=pendingProgramTemplate;closeActiveProgramOptions();if(template)openProgramPreview(template,document.querySelector("#quickStartHeading"));};
document.querySelector("#savePendingProgramDraftButton").onclick=savePendingProgramAsDraft;
document.querySelector("#returnActiveMesocycleButton").onclick=()=>{closeActiveProgramOptions();document.querySelector('[data-view="programsView"]').click();};
document.querySelector("#endActiveForProgramButton").onclick=()=>{const template=pendingProgramTemplate,active=data.mesocycles?.active;closeActiveProgramOptions();if(!active||!template)return;endMesocycle(active);if(!data.mesocycles.active){pendingProgramTemplate=null;openMesocycleBuilder(mesocycleFromProgramTemplate(template));}};
document.querySelector("#onboardingContinueButton").onclick=()=>{if(onboardingStep===4)return finishOnboarding();saveOnboardingStep();onboardingStep++;onboardingDraft.onboardingStatus.currentStep=onboardingStep;renderOnboardingStep();};
document.querySelector("#onboardingBackButton").onclick=()=>{if(onboardingStep<=1)return;saveOnboardingStep();onboardingStep--;renderOnboardingStep();};
document.querySelector("#onboardingSkipButton").onclick=dismissOnboarding;
document.querySelector("#dismissOnboardingButton").onclick=dismissOnboarding;
document.querySelector("#onboardingDialog").addEventListener("cancel",event=>{event.preventDefault();dismissOnboarding();});
document.querySelector("#editProfileButton").onclick=()=>openOnboarding(1);
document.querySelector("#editBaselinesButton").onclick=()=>openOnboarding(4);
document.querySelector("#restartProfileButton").onclick=()=>{if(confirm("Restart profile setup? Your workouts, mesocycles, and history will not be changed."))openOnboarding(1);};
document.querySelector("#recalculateWeightsButton").onclick=()=>{const count=applyMissingWeightRecommendations(standardRecalculationExercises());alert(`${count} missing starting weights were recalculated. Your active mesocycle was not changed automatically.`);};
document.querySelector("#keepActiveWeightsButton").onclick=()=>alert("Current active-mesocycle weights were kept. Future recommendations can still use your updated profile.");
document.querySelector("#recalculateActiveMissingButton").onclick=()=>{if(!data.mesocycles?.active)return;const count=applyMissingWeightRecommendations(activeMesocycleExercises());alert(`${count} active-mesocycle exercises without usable history received a starting-weight recommendation. Completed history was not changed.`);};
document.querySelector("#reviewActiveWeightChangesButton").onclick=()=>{const suggestions=activeMesocycleExercises().filter(exercise=>!latestExerciseResult(exercise.id)).map(exercise=>({exercise,recommendation:startingWeightRecommendation(exercise)}));document.querySelector("#activeWeightChangeReview").innerHTML=suggestions.length?`<strong>Suggested review</strong>${suggestions.slice(0,20).map(item=>`<p>${escapeHtml(item.exercise.name)}: ${item.recommendation.weight?`${displayWeightValue(item.recommendation.weight,data.profile.units)} ${weightUnit(data.profile.units)}`:escapeHtml(item.recommendation.label)} — ${escapeHtml(item.recommendation.label)}</p>`).join("")}`:"No active exercises need a profile-based review.";};
document.querySelector("#exportProfileButton").onclick=()=>{const blob=new Blob([JSON.stringify({profile:data.profile},null,2)],{type:"application/json"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`fleeman-fitness-profile-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(link.href);};
document.querySelector("#closeWorkoutPreviewButton").onclick = closeWorkoutPreview;
document.querySelector("#workoutPreviewDialog").addEventListener("cancel", event => { event.preventDefault(); closeWorkoutPreview(); });
document.querySelector("#previewAdjustedWorkoutButton").onclick = event => previewAdjustedWorkout(event.currentTarget);
document.querySelector("#closeRecoveryButton").onclick = () => {
  pendingWorkoutId = null;
  recommendedWorkoutId = null;
  pendingWorkoutContext = null;
  document.querySelector("#recoveryDialog").close();
};
document.querySelector("#startRecommendedButton").onclick = () => {
  if (!pendingSorenessPlan || !pendingWorkoutId) return;
  const workoutId = pendingWorkoutId;
  const workoutContext = pendingWorkoutContext;
  const soreness = { ratings: structuredClone(sorenessAnswers), changes: structuredClone(pendingSorenessPlan.changes), decision: "accepted", date: new Date().toISOString(), week: workoutContext?.week, cycle: workoutContext?.cycle, cycleDay: workoutContext?.cycleDay, scheduleType: workoutContext?.scheduleType, workoutName: data.workouts.find(w=>w.id===workoutId)?.name };
  document.querySelector("#recoveryDialog").close();
  pendingWorkoutId = null;
  recommendedWorkoutId = null;
  pendingWorkoutContext = null;
  beginWorkout(workoutId, soreness, workoutContext, "adjusted");
};
document.querySelector("#skipSoreMusclesButton").onclick = () => {
  if (!pendingSorenessPlan || !pendingWorkoutId) return;
  const workoutId = pendingWorkoutId, workoutContext = pendingWorkoutContext;
  const soreness = { ratings: structuredClone(sorenessAnswers), changes: structuredClone(pendingSorenessPlan.changes), decision: "skipped high-soreness muscles", date: new Date().toISOString(), week: workoutContext?.week, cycle: workoutContext?.cycle, cycleDay: workoutContext?.cycleDay, scheduleType: workoutContext?.scheduleType, workoutName: data.workouts.find(w=>w.id===workoutId)?.name };
  document.querySelector("#recoveryDialog").close(); pendingWorkoutId=null; pendingWorkoutContext=null; pendingSorenessPlan=null;
  beginWorkout(workoutId, soreness, workoutContext, "skip-high");
};
document.querySelector("#startOriginalButton").onclick = () => {
  if (!pendingWorkoutId) return;
  const workoutId = pendingWorkoutId;
  const workoutContext = pendingWorkoutContext;
  if (!validateSorenessCheckIn()) return;
  const soreness = { ratings: structuredClone(sorenessAnswers), changes: structuredClone(pendingSorenessPlan?.changes || []), decision: "ignored", date: new Date().toISOString(), week: workoutContext?.week, cycle: workoutContext?.cycle, cycleDay: workoutContext?.cycleDay, scheduleType: workoutContext?.scheduleType, workoutName: data.workouts.find(w=>w.id===workoutId)?.name };
  document.querySelector("#recoveryDialog").close();
  pendingWorkoutId = null;
  recommendedWorkoutId = null;
  pendingWorkoutContext = null;
  pendingSorenessPlan = null;
  beginWorkout(workoutId, soreness, workoutContext, "original");
};
document.querySelector("#closeSessionButton").onclick = () => {
  if (confirm("Close this workout? Unsaved progress will be lost.")) {
    currentSession = null;
    renderUpdateNotice();
    document.querySelector("#sessionDialog").close();
  }
};
document.querySelector("#finishWorkoutButton").onclick = finishWorkout;

document.querySelector("#workoutForm").onsubmit = event => {
  event.preventDefault();
  const validation = validateWorkoutEditor();
  if (!FormValidation.apply(document.querySelector("#workoutForm"), validation, {
    summaryTitle: "The workout could not be saved. Fix these fields:"
  })) return;
  const cards = [...document.querySelectorAll("#exerciseEditor .exercise-editor-card")];
  const exercises = cards.map(card => ({
    ...JSON.parse(card.dataset.exerciseMetadata || "{}"),
    id: card.dataset.exerciseId,
    libraryExerciseId: card.dataset.libraryExerciseId || null,
    name: card.querySelector(".exercise-name").value.trim(),
    sets: Number(card.querySelector(".exercise-sets").value),
    minReps: Number(card.querySelector(".exercise-min-reps").value),
    maxReps: Number(card.querySelector(".exercise-max-reps").value),
    startWeight: internalWeightValue(card.querySelector(".exercise-weight").value,data.profile?.units),
    targetRir: Number(card.querySelector(".exercise-target-rir").value),
    rest: Number(card.querySelector(".exercise-rest").value),
    increment: Number(card.querySelector(".exercise-increment").value)
  }));
  const id = document.querySelector("#editingWorkoutId").value || crypto.randomUUID();
  const workout = {
    id,
    name: document.querySelector("#workoutNameInput").value.trim(),
    notes: document.querySelector("#workoutNotesInput").value.trim(),
    exercises
  };
  const existing = data.workouts.findIndex(w => w.id === id);
  if (existing >= 0) data.workouts[existing] = workout;
  else data.workouts.push(workout);
  data.selectedWorkoutId = id;
  document.querySelector("#workoutDialog").close();
  saveData();
};

document.querySelector("#defaultIncrement").onchange = e => {
  data.settings.increment = Number(e.target.value); saveData();
};
document.querySelector("#defaultRest").onchange = e => {
  data.settings.rest = Number(e.target.value); saveData();
};
document.querySelector("#exportButton").onclick = () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `fleeman-fitness-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
document.querySelector("#importInput").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!isValidBackup(imported)) throw new Error("Invalid backup structure");
    data = mergeWithDefaults(imported);
    saveData();
    alert("Backup imported.");
  } catch {
    alert("That file is not a valid Fleeman Fitness backup.");
  } finally {
    e.target.value = "";
  }
};
document.querySelector("#resetButton").onclick = () => {
  if (!confirm("Erase all workouts and history?")) return;
  data = structuredClone(defaultData);
  saveData();
};

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  document.querySelector("#installButton").classList.remove("hidden");
});
document.querySelector("#installButton").onclick = async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.querySelector("#installButton").classList.add("hidden");
};

document.querySelector("#updateNowButton").onclick = () => {
  if (currentSession) {
    renderUpdateNotice();
    return;
  }
  if (!waitingServiceWorker || updateReloading) return;
  updateReloading = true;
  sessionStorage.setItem("fleemanFitnessUpdating", "1");
  document.querySelector("#updateNowButton").disabled = true;
  waitingServiceWorker.postMessage({ type: "SKIP_WAITING" });
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updateReloading) return;
    window.location.reload();
  });
  window.addEventListener("load", async () => {
    const registration = await navigator.serviceWorker.register("service-worker.js?v=63");
    if (registration.waiting && navigator.serviceWorker.controller) {
      waitingServiceWorker = registration.waiting;
      renderUpdateNotice();
    }
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          waitingServiceWorker = installing;
          renderUpdateNotice();
        }
      });
    });
    sessionStorage.removeItem("fleemanFitnessUpdating");
  });
}

renderAll();
const onboardingStatus=data.profile?.onboardingStatus||{};
if(!onboardingStatus.completed&&!onboardingStatus.declined&&(!onboardingStatus.dismissedUntil||new Date(onboardingStatus.dismissedUntil)<=new Date()))setTimeout(()=>openOnboarding(Number(onboardingStatus.currentStep)||1),0);
