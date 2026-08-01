
const STORAGE_KEY = "fleemanFitnessDataV1";
const APP_VERSION = "0.5.4-beta";
let previewReturnFocus = null;
let previewScrollPosition = 0;
const defaultData = {
  settings: { increment: 5, rest: 90 },
  selectedWorkoutId: "push-a",
  mesocycles: { drafts: [], active: null, completed: [] },
  exerciseLibraryUser: { favorites: [], recent: [], customExercises: [] },
  workouts: [
    {
      id: "push-a",
      name: "Push A",
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
      name: "Pull A",
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
      name: "Legs A",
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
let exerciseLibraryFilters = { search: "", muscle: "", equipment: "", type: "", favorites: false, recent: false };
let exercisePreviewReturnFocus = null;

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
    settings: { ...defaultData.settings, ...saved.settings },
    exerciseLibraryUser: { ...structuredClone(defaultData.exerciseLibraryUser), ...(saved.exerciseLibraryUser || {}) }
  };
  migrateExerciseReferences(merged);
  return merged;
}

function normalizedExerciseName(name="") { return name.toLowerCase().replace(/[^a-z0-9]+/g,"").trim(); }
function allExerciseDefinitions() { return [...COMMERCIAL_GYM_EXERCISES, ...(data.exerciseLibraryUser?.customExercises || [])]; }
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

function recommendationFor(exercise) {
  const prior = latestExerciseResult(exercise.id);
  if (!prior) return { weight: exercise.startWeight, note: "Starting target" };

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
  document.querySelector("#appVersion").textContent = APP_VERSION;
  renderUpdateNotice();
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
  data.workouts.slice(0, 4).forEach(w => quick.appendChild(workoutCard(w, true)));

  const completedSets = data.history.reduce((sum, h) =>
    sum + h.exercises.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0), 0);
  const thisWeek = data.history.filter(h => Date.now() - new Date(h.date).getTime() < 7 * 86400000).length;
  const prs = calculatePRs();
  document.querySelector("#progressSummary").innerHTML = `
    <div class="stat"><strong>${thisWeek}</strong><span>Workouts this week</span></div>
    <div class="stat"><strong>${completedSets}</strong><span>Total sets logged</span></div>
    <div class="stat"><strong>${prs}</strong><span>Exercise bests</span></div>`;
  if (typeof renderMesocycleToday === "function") renderMesocycleToday();
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
  const select = el.querySelector(".select-card");
  if (select) select.onclick = () => { data.selectedWorkoutId = workout.id; saveData(); };
  const edit = el.querySelector(".edit-card");
  if (edit) edit.onclick = () => openWorkoutEditor(workout);
  const del = el.querySelector(".delete-card");
  if (del) del.onclick = () => deleteWorkout(workout.id);
  return el;
}

function renderLibrary() {
  const list = document.querySelector("#workoutLibrary");
  list.innerHTML = "";
  data.workouts.forEach(w => list.appendChild(workoutCard(w)));
}

function openExerciseLibrary(context={type:"browse"}) {
  exerciseLibraryContext=context;
  exerciseLibraryFilters={search:"",muscle:context.muscle||"",equipment:"",type:"",favorites:false,recent:false};
  document.querySelector("#exerciseLibrarySearch").value="";
  document.querySelector("#equipmentFilter").value="";
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
    return query.every(term=>text.includes(term))&&(!exerciseLibraryFilters.muscle||exercise.primaryMuscle===exerciseLibraryFilters.muscle)&&(!exerciseLibraryFilters.equipment||(exercise.equipment||[]).includes(exerciseLibraryFilters.equipment))&&(!exerciseLibraryFilters.type||exercise.exerciseType===exerciseLibraryFilters.type)&&(!exerciseLibraryFilters.favorites||user.favorites.includes(exercise.id))&&(!exerciseLibraryFilters.recent||user.recent.includes(exercise.id));
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
  card.innerHTML=`<h3>${escapeHtml(exercise.name)}</h3><p>${escapeHtml(exercise.primaryMuscle)} • ${(exercise.equipment||[]).map(escapeHtml).join(", ")} • ${escapeHtml(exercise.exerciseType)}</p><p class="small-note">Default: ${exercise.defaults.sets} sets • ${exercise.defaults.minReps}–${exercise.defaults.maxReps} reps • RIR ${exercise.defaults.targetRIR}</p><div class="exercise-actions"><button class="secondary-button favorite-button" aria-label="${favorite?"Remove":"Add"} ${escapeHtml(exercise.name)} ${favorite?"from":"to"} favorites" aria-pressed="${favorite}">${favorite?"★":"☆"}</button><button class="secondary-button preview-exercise-button">Preview</button>${exerciseLibraryContext.type!=="browse"?'<button class="primary-button compact add-library-exercise">Add</button>':""}${exercise.sourceType==="custom"?'<button class="danger-button compact delete-custom-exercise">Delete</button>':""}</div>`;
  card.querySelector(".favorite-button").onclick=()=>toggleExerciseFavorite(exercise.id);
  card.querySelector(".preview-exercise-button").onclick=event=>openExercisePreview(exercise,event.currentTarget);
  card.querySelector(".add-library-exercise")?.addEventListener("click",()=>addExerciseFromLibrary(exercise));
  card.querySelector(".delete-custom-exercise")?.addEventListener("click",()=>deleteCustomExercise(exercise));
  return card;
}

function toggleExerciseFavorite(id){const list=data.exerciseLibraryUser.favorites;data.exerciseLibraryUser.favorites=list.includes(id)?list.filter(item=>item!==id):[...list,id];saveData();renderExerciseLibrary();}
function markExerciseUsed(id){if(!id)return;data.exerciseLibraryUser.recent=[id,...data.exerciseLibraryUser.recent.filter(item=>item!==id)].slice(0,25);}

function addExerciseFromLibrary(definition){
  const prescription=exerciseDefinitionToPrescription(definition);markExerciseUsed(definition.id);
  if(exerciseLibraryContext.type==="workout") addExerciseEditor(prescription);
  if(exerciseLibraryContext.type==="mesocycle"&&exerciseLibraryContext.slot){exerciseLibraryContext.slot.workout.exercises.push(prescription);renderMesoBuilder();}
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));closeExercisePreview();closeExerciseLibrary();
}

function openExercisePreview(exercise,trigger){
  exercisePreviewReturnFocus=trigger;const favorite=data.exerciseLibraryUser.favorites.includes(exercise.id);const similar=allExerciseDefinitions().filter(item=>item.id!==exercise.id&&item.substitutionFamily===exercise.substitutionFamily).slice(0,6);
  document.querySelector("#exercisePreviewTitle").textContent=exercise.name;
  document.querySelector("#exercisePreviewContent").innerHTML=`<p>${escapeHtml(exercise.description)}</p><div class="exercise-detail-list"><p><strong>Primary:</strong> ${escapeHtml(exercise.primaryMuscle)}</p><p><strong>Secondary:</strong> ${(exercise.secondaryMuscles||[]).map(escapeHtml).join(", ")||"None"}</p><p><strong>Equipment:</strong> ${(exercise.equipment||[]).map(escapeHtml).join(", ")}</p><p><strong>Classification:</strong> ${escapeHtml(exercise.exerciseType)} • ${escapeHtml(exercise.movementPattern)} • ${escapeHtml(exercise.laterality)}</p><p><strong>Suggested plan:</strong> ${exercise.defaults.sets} sets • ${exercise.defaults.minReps}–${exercise.defaults.maxReps} reps • RIR ${exercise.defaults.targetRIR} • ${exercise.defaults.restSeconds}s rest</p><p><strong>Increment:</strong> ${exercise.defaults.weightIncrement} lb • ${escapeHtml(exercise.defaults.weightEntryType)}</p><h3>Setup</h3><ul>${exercise.setup.map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>Performance cues</h3><ul>${exercise.cues.map(item=>`<li>${escapeHtml(item)}</li>`).join("")}</ul>${exercise.caution?`<p class="recovery-warning">${escapeHtml(exercise.caution)}</p>`:""}<h3>Similar exercises</h3><p>${similar.map(item=>escapeHtml(item.name)).join(" • ")||"No similar exercises listed."}</p></div>`;
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
  const definition=buildExerciseDefinition(name.trim(),primaryMuscle.trim());definition.id=`custom-${crypto.randomUUID()}`;definition.description=prompt("Short description",definition.description)||definition.description;definition.equipment=[equipment.trim()];definition.sourceType="custom";definition.searchKeywords=[name.toLowerCase(),primaryMuscle.toLowerCase(),equipment.toLowerCase()];
  data.exerciseLibraryUser.customExercises.push(definition);saveData();renderExerciseLibrary();
}

function deleteCustomExercise(exercise){if(!confirm(`Delete custom exercise ${exercise.name}? Existing workout prescriptions will remain.`))return;data.exerciseLibraryUser.customExercises=data.exerciseLibraryUser.customExercises.filter(item=>item.id!==exercise.id);data.exerciseLibraryUser.favorites=data.exerciseLibraryUser.favorites.filter(id=>id!==exercise.id);saveData();renderExerciseLibrary();}

function renderHistory() {
  const list = document.querySelector("#historyList");
  list.innerHTML = "";
  if (!data.history.length) {
    list.innerHTML = '<div class="panel"><p>No workouts logged yet. Finish your first session and it will appear here.</p></div>';
    return;
  }
  data.history.forEach(h => {
    const sets = h.exercises.reduce((s, e) => s + e.sets.filter(x => x.done).length, 0);
    const el = document.createElement("article");
    el.className = "history-card";
    el.innerHTML = `
      <div class="workout-card-top">
        <div><h3>${escapeHtml(h.workoutName)}</h3><p>${new Date(h.date).toLocaleString()}</p></div>
        <strong>${sets} sets</strong>
      </div>
      <p>${h.exercises.map(e => `${escapeHtml(e.name)}: ${e.weight} lb`).join(" • ")}</p>
      ${h.soreness?.ratings ? `<p class="small-note">Soreness: ${Object.entries(h.soreness.ratings).map(([muscle,rating]) => `${sorenessLabel(muscle)} — ${["Not sore","A little sore","I still feel it","I can barely move"][rating]}`).join(" • ")} • ${h.soreness.decision}</p>` : ""}
      ${h.exercises.some(e => Number(e.jointPain?.rating) > 1) ? `<p class="small-note">Joint pain: ${h.exercises.filter(e=>Number(e.jointPain?.rating)>1).map(e=>`${escapeHtml(e.name)} ${e.jointPain.rating}/5 (${(e.jointPain.joints||[]).map(escapeHtml).join(", ")})`).join(" • ")}</p>` : ""}`;
    list.appendChild(el);
  });
}

function openWorkoutEditor(workout = null) {
  document.querySelector("#workoutDialogTitle").textContent = workout ? "Edit workout" : "New workout";
  document.querySelector("#editingWorkoutId").value = workout?.id || "";
  document.querySelector("#workoutNameInput").value = workout?.name || "";
  document.querySelector("#workoutNotesInput").value = workout?.notes || "";
  const editor = document.querySelector("#exerciseEditor");
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
  card.dataset.exerciseMetadata = JSON.stringify({description:exercise.description||"",muscle:exercise.muscle||exercise.primaryMuscle||"",primaryMuscle:exercise.primaryMuscle||exercise.muscle||"",secondaryMuscles:exercise.secondaryMuscles||[],muscleTags:exercise.muscleTags||[],equipment:exercise.equipment||[],exerciseType:exercise.exerciseType||"",movementPattern:exercise.movementPattern||"",laterality:exercise.laterality||"",substitutionFamily:exercise.substitutionFamily||"",weightEntryType:exercise.weightEntryType||"Total Weight",sourceType:exercise.sourceType||"custom",setup:exercise.setup||[],cues:exercise.cues||[]});
  card.querySelector(".exercise-name").value = exercise.name || "";
  card.querySelector(".exercise-sets").value = exercise.sets ?? 3;
  card.querySelector(".exercise-min-reps").value = exercise.minReps ?? 8;
  card.querySelector(".exercise-max-reps").value = exercise.maxReps ?? 12;
  card.querySelector(".exercise-weight").value = exercise.startWeight ?? 0;
  card.querySelector(".exercise-target-rir").value = exercise.targetRir ?? 3;
  card.querySelector(".exercise-rest").value = exercise.rest ?? data.settings.rest;
  card.querySelector(".exercise-increment").value = exercise.increment ?? data.settings.increment;
  card.querySelector(".exercise-weight-label").textContent = exercise.weightEntryType === "Per Dumbbell" ? "Weight per dumbbell" : exercise.weightEntryType === "Assisted Bodyweight" ? "Assistance weight" : "Start weight";
  card.querySelector(".remove-exercise").onclick = () => card.remove();
  document.querySelector("#exerciseEditor").appendChild(node);
}

function deleteWorkout(id) {
  if (!confirm("Delete this workout?")) return;
  data.workouts = data.workouts.filter(w => w.id !== id);
  if (data.selectedWorkoutId === id) data.selectedWorkoutId = data.workouts[0]?.id || null;
  saveData();
}

function workoutMuscles(workout) {
  return [...new Set(workout.exercises.flatMap(exerciseMuscles))];
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
    <p><strong>Plan:</strong> ${Number(exercise.sets || 0)} working sets • ${Number(exercise.minReps || 0)}–${Number(exercise.maxReps || 0)} reps • Target RIR ${Number(exercise.targetRir ?? 3)}</p>
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
      const soreness = { ratings: structuredClone(sorenessAnswers), changes: structuredClone(pendingSorenessPlan.changes), decision: "accepted", date: new Date().toISOString(), week: workoutContext?.week, workoutName: original.name };
      document.querySelector("#recoveryDialog").close();
      pendingWorkoutId = null; pendingWorkoutContext = null; pendingSorenessPlan = null;
      beginWorkout(workoutId, soreness, workoutContext, "adjusted");
    }
  });
}

function startWorkout(id, context = null) {
  const workout = data.workouts.find(item => item.id === id);
  if (!workout) return;
  if (!context || Number(context.week) < 2) {
    beginWorkout(id, null, context, "original");
    return;
  }
  pendingWorkoutId = id; pendingWorkoutContext = context; sorenessAnswers = {}; pendingSorenessPlan = null;
  const grid = document.querySelector("#sorenessGrid");
  grid.innerHTML = "";
  workoutMuscles(workout).forEach(muscle => {
    const control = document.createElement("section"); control.className = "soreness-control";
    control.innerHTML = `<strong>${sorenessLabel(muscle)} soreness</strong><div class="soreness-options">${["Not sore", "A little sore", "I still feel it", "I can barely move"].map((label,index)=>`<button class="soreness-option" data-rating="${index}">${label}</button>`).join("")}</div>`;
    control.querySelectorAll(".soreness-option").forEach(button => button.onclick = () => {
      sorenessAnswers[muscle] = Number(button.dataset.rating);
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
        weight: prescription?.weight ?? rec.weight,
        recommendation: rec.note,
        feedback: "about-right",
        targetRir: plannedRir,
        jointPain: { rating: 1, joints: [] },
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
    const definition = workout.exercises.find(e => e.id === ex.exerciseId) || data.workouts.flatMap(item => item.exercises).find(e => e.id === ex.exerciseId);
    const painDescriptions = ["", "No joint pain", "Minor discomfort", "Noticeable pain", "Significant pain", "Severe pain or unable to perform normally"];
    const joints = ["Shoulder","Elbow","Wrist","Hand","Hip","Knee","Ankle","Foot","Lower back","Upper back","Neck","Other"];
    const painPlan = ex.priorPainPlan || { rating: 1, joints: [] };
    const substitutions = data.workouts.flatMap(w => w.exercises).filter(candidate => candidate.id !== ex.exerciseId && candidate.name !== ex.name && exerciseMuscles(candidate).some(muscle => exerciseMuscles(definition).includes(muscle))).filter((candidate,index,array)=>array.findIndex(item=>item.name===candidate.name)===index).slice(0,8);
    const futureWarning = painPlan.rating >= 3 ? `<div class="future-warning"><strong>${painPlan.rating >= 5 ? "Severe" : painPlan.rating === 4 ? "Significant" : "Noticeable"} joint pain was previously reported.</strong><p>${painPlan.rating >= 5 ? "Stop using this exercise if it reproduces the pain. Consider seeking evaluation from a qualified medical professional." : painPlan.rating === 4 ? "Consider replacing this exercise and avoiding movements that reproduce the pain." : "The next-workout load and RIR were adjusted. Review technique and consider a substitution."}</p>${painPlan.joints?.length ? `<p>Affected: ${painPlan.joints.map(escapeHtml).join(", ")}</p>` : ""}<div class="exercise-actions">${painPlan.rating===4?'<button class="secondary-button pain-use-reduced">Use reduced prescription</button>':""}<button class="secondary-button pain-keep-original">Keep original</button><button class="secondary-button pain-skip">Skip exercise</button></div>${substitutions.length ? `<label>Replacement<select class="pain-substitute"><option value="">Choose replacement</option>${substitutions.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label>` : ""}</div>` : "";
    const card = document.createElement("article");
    card.className = "exercise-card";
    card.innerHTML = `
      <h3>${escapeHtml(ex.name)}</h3>
      ${futureWarning}
      <p class="exercise-meta">${definition.minReps}-${definition.maxReps} reps • Target RIR ${ex.targetRir} • ${escapeHtml(ex.recommendation)}</p>
      <label>Working weight<input class="session-weight" type="number" step="2.5" min="0" value="${ex.weight}"></label>
      <div class="set-list"></div>
      <p class="small-note">How difficult was this exercise?</p>
      <div class="feedback-grid">
        <button class="feedback-button" data-feedback="easy">Too easy</button>
        <button class="feedback-button active" data-feedback="about-right">About right</button>
        <button class="feedback-button" data-feedback="very-hard">Very hard</button>
        <button class="feedback-button" data-feedback="failed">Failed target</button>
      </div>
      <p class="small-note">Did you experience joint pain during this exercise?</p>
      <div class="pain-scale">${[1,2,3,4,5].map(rating=>`<button class="pain-button ${ex.jointPain.rating===rating?"active":""}" data-pain="${rating}" aria-label="Joint pain ${rating}: ${painDescriptions[rating]}"><span>${rating}</span><small>${painDescriptions[rating]}</small></button>`).join("")}</div>
      <p class="pain-description ${ex.jointPain.rating>=4?"recovery-warning":""}">${ex.jointPain.rating===4?"Significant joint pain was reported. Consider replacing this exercise and avoiding movements that reproduce the pain.":ex.jointPain.rating===5?"Severe joint pain was reported. Stop using this exercise if it reproduces the pain. Consider seeking evaluation from a qualified medical professional.":painDescriptions[ex.jointPain.rating]}</p>
      <div class="joint-grid">${joints.map(joint=>`<label class="joint-choice"><input type="checkbox" value="${joint}" ${ex.jointPain.joints.includes(joint)?"checked":""}>${joint}</label>`).join("")}</div>`;
    card.querySelector(".session-weight").oninput = e => ex.weight = Number(e.target.value);
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
    card.querySelectorAll(".pain-button").forEach(btn => btn.onclick = () => { ex.jointPain.rating = Number(btn.dataset.pain); renderSession(); });
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

document.querySelectorAll(".tab").forEach(tab => tab.onclick = () => {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  tab.classList.add("active");
  document.querySelector(`#${tab.dataset.view}`).classList.add("active");
  tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
});

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
document.querySelector("#exerciseTypeFilter").onchange = event => {exerciseLibraryFilters.type=event.target.value;renderExerciseLibrary();};
document.querySelector("#favoritesFilterButton").onclick = () => {exerciseLibraryFilters.favorites=!exerciseLibraryFilters.favorites;renderExerciseLibrary();};
document.querySelector("#recentFilterButton").onclick = () => {exerciseLibraryFilters.recent=!exerciseLibraryFilters.recent;renderExerciseLibrary();};
document.querySelector("#clearExerciseFiltersButton").onclick = () => {exerciseLibraryFilters={search:"",muscle:"",equipment:"",type:"",favorites:false,recent:false};document.querySelector("#exerciseLibrarySearch").value="";document.querySelector("#equipmentFilter").value="";document.querySelector("#exerciseTypeFilter").value="";renderExerciseLibrary();};
document.querySelector("#createCustomExerciseButton").onclick = createCustomExercise;
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
  const soreness = { ratings: structuredClone(sorenessAnswers), changes: structuredClone(pendingSorenessPlan.changes), decision: "accepted", date: new Date().toISOString(), week: workoutContext?.week, workoutName: data.workouts.find(w=>w.id===workoutId)?.name };
  document.querySelector("#recoveryDialog").close();
  pendingWorkoutId = null;
  recommendedWorkoutId = null;
  pendingWorkoutContext = null;
  beginWorkout(workoutId, soreness, workoutContext, "adjusted");
};
document.querySelector("#skipSoreMusclesButton").onclick = () => {
  if (!pendingSorenessPlan || !pendingWorkoutId) return;
  const workoutId = pendingWorkoutId, workoutContext = pendingWorkoutContext;
  const soreness = { ratings: structuredClone(sorenessAnswers), changes: structuredClone(pendingSorenessPlan.changes), decision: "skipped high-soreness muscles", date: new Date().toISOString(), week: workoutContext?.week, workoutName: data.workouts.find(w=>w.id===workoutId)?.name };
  document.querySelector("#recoveryDialog").close(); pendingWorkoutId=null; pendingWorkoutContext=null; pendingSorenessPlan=null;
  beginWorkout(workoutId, soreness, workoutContext, "skip-high");
};
document.querySelector("#startOriginalButton").onclick = () => {
  if (!pendingWorkoutId) return;
  const workoutId = pendingWorkoutId;
  const workoutContext = pendingWorkoutContext;
  if (workoutMuscles(data.workouts.find(w=>w.id===workoutId)).some(m=>sorenessAnswers[m]==null)) return alert("Rate each trained muscle before continuing.");
  const soreness = { ratings: structuredClone(sorenessAnswers), changes: structuredClone(pendingSorenessPlan?.changes || []), decision: "ignored", date: new Date().toISOString(), week: workoutContext?.week, workoutName: data.workouts.find(w=>w.id===workoutId)?.name };
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
  const cards = [...document.querySelectorAll("#exerciseEditor .exercise-editor-card")];
  const exercises = cards.map(card => ({
    ...JSON.parse(card.dataset.exerciseMetadata || "{}"),
    id: card.dataset.exerciseId,
    libraryExerciseId: card.dataset.libraryExerciseId || null,
    name: card.querySelector(".exercise-name").value.trim(),
    sets: Number(card.querySelector(".exercise-sets").value),
    minReps: Number(card.querySelector(".exercise-min-reps").value),
    maxReps: Number(card.querySelector(".exercise-max-reps").value),
    startWeight: Number(card.querySelector(".exercise-weight").value),
    targetRir: Number(card.querySelector(".exercise-target-rir").value),
    rest: Number(card.querySelector(".exercise-rest").value),
    increment: Number(card.querySelector(".exercise-increment").value)
  })).filter(e => e.name);

  if (!exercises.length) return alert("Add at least one exercise.");
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
    const registration = await navigator.serviceWorker.register("service-worker.js");
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
