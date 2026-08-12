const ACTIVE_WORKOUT_KEY = "fleemanFitnessActiveWorkoutV2";
const LIVE_WORKOUT_VERSION = 2;
let liveWorkoutSaveTimer = null;
let liveWorkoutClock = null;
let pendingLiveWorkoutStart = null;
let exerciseHistoryReturnFocus = null;

const baseBeginWorkout = beginWorkout;
const baseRenderSession = renderSession;
const baseFinishWorkout = finishWorkout;
const baseStartWorkout = startWorkout;

function activeExercisePreferenceKey(exercise) {
  return exercise.libraryExerciseId || `name:${normalizedExerciseName(exercise.name)}`;
}

function activeExercisePreferences(exercise) {
  data.exerciseLibraryUser.exercisePreferences ||= {};
  const key = activeExercisePreferenceKey(exercise);
  data.exerciseLibraryUser.exercisePreferences[key] ||= { permanentNote: "" };
  return data.exerciseLibraryUser.exercisePreferences[key];
}

function normalizeActiveWorkoutSession(session) {
  if (!session || !Array.isArray(session.exercises)) return null;
  const previousVersion = Number(session.liveWorkoutVersion) || 0;
  session.liveWorkoutVersion = LIVE_WORKOUT_VERSION;
  session.startTime ||= session.date || new Date().toISOString();
  session.elapsedMs = Math.max(0, Number(session.elapsedMs) || 0);
  session.currentExerciseIndex = Math.min(Math.max(0, Number(session.currentExerciseIndex) || 0), Math.max(0, session.exercises.length - 1));
  session.exercises.forEach((exercise, index) => {
    exercise.sets = Array.isArray(exercise.sets) ? exercise.sets : [];
    exercise.expanded = exercise.expanded == null ? index === session.currentExerciseIndex : Boolean(exercise.expanded);
    exercise.skipped = Boolean(exercise.skipped);
    exercise.skipReason ||= "";
    exercise.sessionNote ||= "";
    exercise.feedbackVisible = Boolean(exercise.feedbackVisible);
    exercise.feedbackDeferred = Boolean(exercise.feedbackDeferred);
    exercise.feedbackAnswered = Boolean(exercise.feedbackAnswered);
    exercise.jointPain ||= { rating: null, joints: [] };
    if (!Object.hasOwn(exercise.jointPain, "rating")) exercise.jointPain.rating = null;
    exercise.jointPain.joints ||= [];
    exercise.jointPainAnswered = Boolean(exercise.jointPainAnswered);
    const continuingCalibration = Boolean(exercise.calibrationStarted || exercise.calibrationAttempts?.length);
    const calibrationAllowed = Boolean(exercise.startingWeightRecommendation?.calibrationRecommended) &&
      (continuingCalibration || startingWeightCalibrationEligible(exercise, session.mesocycle));
    if (exercise.startingWeightRecommendation) exercise.startingWeightRecommendation.calibrationRecommended = calibrationAllowed;
    if (!calibrationAllowed) {
      exercise.calibrationComplete = true;
      if (exercise.calibrationDecision === "pending") exercise.calibrationDecision = "not-needed";
    }
    if (!exercise.feedbackAnswered && exercise.feedback === "about-right" && previousVersion < LIVE_WORKOUT_VERSION) exercise.feedback = null;
    exercise.sets.forEach(set => {
      set.id ||= crypto.randomUUID();
      set.weight = Number.isFinite(Number(set.weight)) ? Number(set.weight) : Number(exercise.weight) || 0;
      set.reps = Number.isFinite(Number(set.reps)) ? Number(set.reps) : 0;
      set.done = Boolean(set.done);
      set.manuallyEditedWeight = Boolean(set.manuallyEditedWeight);
      set.manuallyEditedReps = Boolean(set.manuallyEditedReps);
      set.restored = Boolean(set.restored);
    });
  });
  return session;
}

function currentElapsedMilliseconds(session = currentSession) {
  if (!session) return 0;
  if (session.pausedAt) return Math.max(0, Number(session.elapsedMs) || 0);
  return Math.max(0, Date.now() - new Date(session.startTime || session.date).getTime());
}

function formatElapsed(milliseconds) {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}` : `${minutes}:${String(seconds).padStart(2,"0")}`;
}

function syncExerciseWorkingWeight(exercise) {
  const representative = exercise.sets.find(set => set.done) || exercise.sets[0];
  if (representative) exercise.weight = Number(representative.weight) || 0;
}

function persistActiveWorkout(immediate = false) {
  if (liveWorkoutSaveTimer) clearTimeout(liveWorkoutSaveTimer);
  const write = () => {
    liveWorkoutSaveTimer = null;
    if (!currentSession) return;
    currentSession.elapsedMs = currentElapsedMilliseconds(currentSession);
    currentSession.exercises.forEach(syncExerciseWorkingWeight);
    data.activeWorkoutSession = structuredClone(currentSession);
    localStorage.setItem(ACTIVE_WORKOUT_KEY, JSON.stringify(currentSession));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };
  if (immediate) write();
  else liveWorkoutSaveTimer = setTimeout(write, 300);
}

function loadSavedActiveWorkout() {
  try {
    return normalizeActiveWorkoutSession(JSON.parse(localStorage.getItem(ACTIVE_WORKOUT_KEY)) || data.activeWorkoutSession);
  } catch {
    return null;
  }
}

function clearSavedActiveWorkout() {
  if (liveWorkoutSaveTimer) clearTimeout(liveWorkoutSaveTimer);
  liveWorkoutSaveTimer = null;
  localStorage.removeItem(ACTIVE_WORKOUT_KEY);
  data.activeWorkoutSession = null;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function prepareLiveWorkoutHeader() {
  const dialog = document.querySelector("#sessionDialog");
  const header = dialog.querySelector(".dialog-header.sticky");
  if (header.dataset.enhanced) return;
  header.dataset.enhanced = "true";
  header.className = "live-workout-header";
  header.querySelector(".eyebrow").id = "sessionMesoContext";
  const close = document.querySelector("#closeSessionButton");
  const finish = document.querySelector("#finishWorkoutButton");
  close.textContent = "Pause / Exit";
  close.setAttribute("aria-label", "Pause or exit workout");
  close.className = "secondary-button compact";
  finish.textContent = "Finish Workout";
  finish.className = "primary-button compact";
  const titleRow = document.createElement("div");
  titleRow.className = "live-workout-title-row";
  const title = header.firstElementChild;
  title.classList.add("live-workout-title");
  const actions = document.createElement("div");
  actions.className = "live-workout-header-actions";
  actions.append(close, finish);
  titleRow.append(title, actions);
  header.replaceChildren(titleRow);
  header.insertAdjacentHTML("beforeend", `<div class="live-workout-stats"><span id="sessionExercisePosition"></span><span id="sessionSetProgress"></span><span id="sessionElapsed"></span></div><div id="sessionProgressTrack" class="progress-track live-workout-progress" role="progressbar" aria-label="Workout progress" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"><div id="sessionProgressFill" class="progress-fill"></div></div><p id="sessionExerciseProgress" class="small-note"></p>`);
}

function activeWorkoutProgress() {
  const activeExercises = currentSession.exercises.filter(exercise => !exercise.skipped);
  const totalSets = activeExercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const completedSets = activeExercises.reduce((sum, exercise) => sum + exercise.sets.filter(set => set.done).length, 0);
  const completedExercises = activeExercises.filter(exercise => exercise.sets.length && exercise.sets.every(set => set.done)).length;
  const skippedExercises = currentSession.exercises.filter(exercise => exercise.skipped).length;
  return { totalSets, completedSets, completedExercises, skippedExercises, totalExercises: currentSession.exercises.length };
}

function mesocycleSessionLabel(session) {
  if (!session.mesocycle) return "LIVE WORKOUT";
  const mesocycleId = session.mesocycle.mesocycleId;
  const mesocycle = [data.mesocycles?.active, ...(data.mesocycles?.drafts || []), ...(data.mesocycles?.completed || [])].find(item => item?.id === mesocycleId);
  return `${mesocycle?.name || "Mesocycle"} - Week ${session.mesocycle.week || 1}`;
}

function updateLiveWorkoutHeader() {
  if (!currentSession) return;
  const progress = activeWorkoutProgress();
  const position = Math.min(currentSession.currentExerciseIndex + 1, currentSession.exercises.length);
  document.querySelector("#sessionMesoContext").textContent = mesocycleSessionLabel(currentSession);
  document.querySelector("#sessionExercisePosition").textContent = `Exercise ${position} of ${currentSession.exercises.length}`;
  document.querySelector("#sessionSetProgress").textContent = `${progress.completedSets} of ${progress.totalSets} working sets`;
  document.querySelector("#sessionElapsed").textContent = `Elapsed ${formatElapsed(currentElapsedMilliseconds())}`;
  document.querySelector("#sessionExerciseProgress").textContent = `${progress.completedExercises} of ${progress.totalExercises} exercises completed${progress.skippedExercises ? ` - ${progress.skippedExercises} skipped` : ""}`;
  const track = document.querySelector("#sessionProgressTrack");
  track.setAttribute("aria-valuemax", String(progress.totalSets));
  track.setAttribute("aria-valuenow", String(progress.completedSets));
  document.querySelector("#sessionProgressFill").style.width = `${progress.totalSets ? progress.completedSets / progress.totalSets * 100 : 0}%`;
}

function startLiveWorkoutClock() {
  if (liveWorkoutClock) clearInterval(liveWorkoutClock);
  updateLiveWorkoutHeader();
  liveWorkoutClock = setInterval(() => {
    if (!currentSession || !document.querySelector("#sessionDialog").open) return;
    updateLiveWorkoutHeader();
  }, 1000);
}

function matchesExerciseResult(result, exercise) {
  return Boolean(result && ((exercise.libraryExerciseId && result.libraryExerciseId === exercise.libraryExerciseId) || normalizedExerciseName(result.name) === normalizedExerciseName(exercise.name)));
}

function exactExerciseHistory(exercise) {
  return data.history.flatMap(session => (session.exercises || []).filter(result => matchesExerciseResult(result, exercise)).map(result => ({ session, result })));
}

function latestSuccessfulExercisePerformance(exercise) {
  return exactExerciseHistory(exercise).find(({ result }) => !result.skipped && result.feedback !== "failed" && result.sets?.length && result.sets.every(set => set.done));
}

function feedbackLabel(value) {
  return ({ easy:"Too easy", "about-right":"About right", "very-hard":"Very hard", failed:"Failed target" })[value] || "Not answered";
}

function workoutLoadText(exercise, weight, units = data.profile?.units) {
  const definition = definitionForExercise(exercise);
  const entry = exercise.weightEntryType || definition?.defaults?.weightEntryType || "Total Weight";
  if (entry === "Bodyweight") return "Bodyweight";
  const amount = `${displayWeightValue(weight ?? exercise.weight ?? 0, units)} ${weightUnit(units)}`;
  if (entry === "Bodyweight + Added Weight" || entry === "Bodyweight Plus Added Weight") return `Bodyweight + ${amount}`;
  if (entry === "Assisted Bodyweight") return `${amount} assistance`;
  return amount;
}

function previousPerformanceMarkup(exercise, unit) {
  const prior = latestSuccessfulExercisePerformance(exercise);
  if (!prior) return `<section class="previous-performance"><h4>Last time</h4><p>No previous performance recorded</p></section>`;
  const completed = prior.result.sets.filter(set => set.done);
  return `<section class="previous-performance"><div class="workout-card-top"><h4>Last time</h4><span>${new Date(prior.session.date).toLocaleDateString()}</span></div>${completed.map((set,index)=>`<p>Set ${index+1}: ${escapeHtml(workoutLoadText(prior.result,set.weight ?? prior.result.weight))} × ${set.reps} ${exerciseRepLabel(prior.result)}</p>`).join("")}<p class="small-note">Target RIR ${prior.result.targetRir ?? "-"} - ${feedbackLabel(prior.result.feedback)}${Number(prior.result.jointPain?.rating)>1?` - Joint pain ${prior.result.jointPain.rating}/5`:""}</p></section>`;
}

function exerciseAdjustmentMarkup(exercise) {
  const original = exercise.originalPrescription;
  if (!original) return "";
  const adjusted = original.sets !== exercise.sets.length || Number(original.weight) !== Number(exercise.weight) || Number(original.targetRir) !== Number(exercise.targetRir);
  if (!adjusted) return "";
  const sorenessChange = currentSession.soreness?.changes?.find(change => change.exerciseId === exercise.exerciseId);
  const reason = sorenessChange ? `Adjusted for ${sorenessLabel(sorenessChange.causedBy)} soreness` : exercise.priorPainPlan?.rating >= 3 ? "Adjusted for previous joint pain" : currentSession.mesocycle?.isDeload ? "Adjusted for deload week" : "Adjusted prescription";
  return `<section class="adjustment-summary"><strong>${escapeHtml(reason)}</strong><div class="adjustment-columns"><p><span>Original</span>${original.sets} sets at ${displayWeightValue(original.weight,data.profile?.units)} ${weightUnit(data.profile?.units)}<br>Target RIR ${original.targetRir}</p><p><span>Today</span>${exercise.sets.length} sets at ${displayWeightValue(exercise.weight,data.profile?.units)} ${weightUnit(data.profile?.units)}<br>Target RIR ${exercise.targetRir}</p></div><p class="small-note">${escapeHtml(exercise.recommendation || "Prescription adjusted for this session.")}</p></section>`;
}

function collapsedExerciseSummary(exercise) {
  const done = exercise.sets.filter(set => set.done);
  const completed = exercise.sets.length > 0 && done.length === exercise.sets.length;
  const weights = [...new Set(done.map(set => workoutLoadText(exercise,set.weight)))];
  const totalReps = done.reduce((sum,set)=>sum + (Number(set.reps)||0),0);
  const warning = exercise.priorPainPlan?.rating >= 3 || Number(exercise.jointPain?.rating) > 1;
  return `<span class="exercise-summary-copy"><strong>${escapeHtml(exercise.name)}${completed ? " ✓" : ""}</strong><span>${exercise.skipped ? `Skipped${exercise.skipReason ? ` - ${escapeHtml(exercise.skipReason)}` : ""}` : completed ? `${done.length} sets - ${weights.join(" / ") || workoutLoadText(exercise,exercise.weight)} - ${totalReps} total ${exerciseRepLabel(exercise)}` : `${done.length} of ${exercise.sets.length} sets - ${workoutLoadText(exercise,exercise.weight)}`}</span>${warning?'<span class="exercise-warning-label">Joint-pain adjustment</span>':""}${completed?`<span>Difficulty: ${exercise.feedbackAnswered?feedbackLabel(exercise.feedback):"Pending"} - Joint pain: ${exercise.jointPainAnswered?(exercise.jointPain?.rating??1):"Pending"}</span>`:""}</span><span class="exercise-summary-chevron" aria-hidden="true">${exercise.expanded?"−":"+"}</span>`;
}

function setCardMarkup(exercise, set, setIndex, previous, unit, entryLabel) {
  const previousSet = previous?.result.sets?.filter(item=>item.done)?.[setIndex];
  const priorText = previousSet ? `${workoutLoadText(previous.result,previousSet.weight ?? previous.result.weight)} × ${previousSet.reps} ${exerciseRepLabel(previous.result)}` : "No matching previous set";
  const effortLabel = exerciseRepUnit(exercise) === "seconds" ? "Duration (seconds)" : "Repetitions";
  return `<article class="live-set-card ${set.done?"completed":""}" data-set-index="${setIndex}"><div class="live-set-card-heading"><strong>Set ${setIndex+1}${set.done?" ✓":""}</strong><span>Previous: ${priorText}</span></div><div class="set-input-grid"><label>${escapeHtml(entryLabel)} (${unit})<input class="set-weight-input" type="number" inputmode="decimal" min="0" step="${data.profile?.units==="metric"?.5:2.5}" value="${displayWeightValue(set.weight,data.profile?.units)}"></label><label>${effortLabel}<input class="set-reps-input" type="number" inputmode="numeric" min="0" max="600" value="${set.reps}"></label></div><button class="${set.done?"secondary-button":"primary-button"} complete-set-card" type="button" aria-label="${set.done?"Undo":"Complete"} set ${setIndex+1}">${set.done?"Undo completed set":"Complete Set"}</button></article>`;
}

function sessionExerciseDefinition(exercise) {
  const workout = data.workouts.find(item => item.id === currentSession.workoutId);
  const prescription = exercise.sessionPrescription || workout?.exercises.find(item => item.id === exercise.exerciseId) || data.workouts.flatMap(item=>item.exercises).find(item=>item.id===exercise.exerciseId) || exercise;
  return { prescription, definition: definitionForExercise(prescription) || prescription };
}

function swapExerciseInSession(exerciseIndex, replacementDefinition, scope) {
  const exercise = currentSession.exercises[exerciseIndex];
  if (exercise.sets.some(set=>set.done) && !confirm("This exercise has completed sets. Keep those logged sets and replace the remaining work?")) return;
  const oldId = exercise.exerciseId;
  const oldLibraryId = exercise.libraryExerciseId;
  const oldName = exercise.name;
  const replacement = exerciseDefinitionToPrescription(replacementDefinition);
  const recommendation = recommendationFor(replacement);
  exercise.exerciseId = replacement.id;
  exercise.libraryExerciseId = replacement.libraryExerciseId;
  exercise.sessionPrescription = structuredClone(replacement);
  exercise.name = replacement.name;
  exercise.targetRir = replacement.targetRir;
  exercise.weight = recommendation.weight;
  exercise.recommendation = recommendation.note;
  exercise.substitution = { from: oldName, to: replacement.name, scope, date: new Date().toISOString() };
  exercise.sets.forEach(set => { if (!set.done) { set.weight = recommendation.weight; set.reps = replacement.minReps; set.manuallyEditedWeight=false; set.manuallyEditedReps=false; } });
  if (scope === "permanent") {
    const sourceWorkout = data.workouts.find(item=>item.id===currentSession.workoutId);
    const position = sourceWorkout?.exercises.findIndex(item=>item.id===oldId);
    if (position >= 0) sourceWorkout.exercises[position] = replacement;
  }
  if (scope === "mesocycle" && data.mesocycles?.active) {
    data.mesocycles.active.schedule.forEach(slot => slot.workout.exercises.forEach((item,index) => {
      if (item.id === oldId || (oldLibraryId && item.libraryExerciseId === oldLibraryId)) slot.workout.exercises[index] = { ...structuredClone(replacement), id:item.id };
    }));
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  persistActiveWorkout(true);
  renderSession();
}

function enhanceExerciseCard(card, exercise, exerciseIndex) {
  const { prescription, definition } = sessionExerciseDefinition(exercise);
  const unit = weightUnit(data.profile?.units);
  const entryLabel = weightEntryLabel(prescription.weightEntryType || definition.defaults?.weightEntryType || "Total Weight");
  const previous = latestSuccessfulExercisePerformance(exercise);
  const completed = exercise.sets.length > 0 && exercise.sets.every(set=>set.done);
  const content = document.createElement("div");
  content.className = "live-exercise-content";
  [...card.childNodes].forEach(node=>content.appendChild(node));
  const summary = document.createElement("button");
  summary.type = "button";
  summary.className = "live-exercise-summary";
  summary.setAttribute("aria-expanded", String(exercise.expanded));
  summary.innerHTML = collapsedExerciseSummary(exercise);
  card.replaceChildren(summary, content);
  card.classList.toggle("collapsed", !exercise.expanded);
  card.classList.toggle("current-exercise", exerciseIndex === currentSession.currentExerciseIndex);
  card.classList.toggle("skipped-exercise", exercise.skipped);
  content.hidden = !exercise.expanded;
  summary.onclick = () => {
    currentSession.currentExerciseIndex = exerciseIndex;
    currentSession.exercises.forEach((item,index)=>item.expanded=index===exerciseIndex ? !item.expanded : false);
    if (!currentSession.exercises[exerciseIndex].expanded) currentSession.exercises[exerciseIndex].expanded = true;
    persistActiveWorkout(true);
    renderSession();
  };

  const originalHeading = content.querySelector("h3");
  originalHeading?.classList.add("expanded-exercise-name");
  const primary = definition.primaryMuscle || prescription.primaryMuscle || prescription.muscle || "Other";
  const secondary = definition.secondaryMuscles || prescription.secondaryMuscles || [];
  const equipment = definition.equipment || prescription.equipment || [];
  originalHeading?.insertAdjacentHTML("afterend", `<p class="exercise-identity"><strong>${escapeHtml(primary)}</strong> - ${escapeHtml(definition.exerciseType || prescription.exerciseType || "Exercise")}${secondary.length?`<br><span>Secondary: ${secondary.map(escapeHtml).join(", ")}</span>`:""}${equipment.length?`<br><span>Equipment: ${equipment.map(escapeHtml).join(", ")}</span>`:""}</p><div class="exercise-progress-copy"><span>${exercise.sets.filter(set=>set.done).length} of ${exercise.sets.length} sets completed</span><div class="progress-track" role="progressbar" aria-label="${escapeHtml(exercise.name)} progress" aria-valuemin="0" aria-valuemax="${exercise.sets.length}" aria-valuenow="${exercise.sets.filter(set=>set.done).length}"><div class="progress-fill" style="width:${exercise.sets.length?exercise.sets.filter(set=>set.done).length/exercise.sets.length*100:0}%"></div></div></div>${exerciseAdjustmentMarkup(exercise)}${previousPerformanceMarkup(exercise,unit)}`);

  const recommendedField = content.querySelector(".session-weight")?.closest("label");
  if (recommendedField) recommendedField.classList.add("recommended-weight-field");
  const recommendedInput = content.querySelector(".session-weight");
  if (recommendedInput) recommendedInput.oninput = event => {
    exercise.weight=internalWeightValue(event.target.value,data.profile?.units);
    exercise.sets.forEach(set=>{if(!set.done&&!set.manuallyEditedWeight&&!set.restored)set.weight=exercise.weight;});
    persistActiveWorkout();
  };
  const starting = exercise.startingWeightRecommendation;
  recommendedField?.insertAdjacentHTML("beforebegin", `<section class="today-prescription"><h4>Today</h4><p><strong>${displayWeightValue(exercise.weight,data.profile?.units)} ${unit}</strong> - ${exercise.sets.length} sets - ${prescription.minReps ?? definition.defaults?.minReps ?? 0} to ${prescription.maxReps ?? definition.defaults?.maxReps ?? 0} ${exerciseRepLabel(exercise)} - Target RIR ${exercise.targetRir}</p>${starting?`<span class="confidence-label">${escapeHtml(starting.label || starting.confidence || "Starting weight")}</span>`:""}<p class="small-note">${escapeHtml(exercise.recommendation || "Use the planned prescription.")}</p></section>`);

  const substitutions = allExerciseDefinitions().filter(item=>item.id!==exercise.libraryExerciseId && (item.substitutionFamily===definition.substitutionFamily || item.primaryMuscle===primary)).slice(0,30);
  const actionMenu = document.createElement("details");
  actionMenu.className = "exercise-action-menu";
  actionMenu.innerHTML = `<summary>Exercise actions</summary><div class="exercise-action-menu-grid"><button class="secondary-button action-preview" type="button">Preview Exercise</button><button class="secondary-button action-history" type="button">View Exercise History</button><button class="secondary-button action-add-set" type="button">Add Set</button><button class="secondary-button action-remove-set" type="button">Remove Set</button><button class="secondary-button action-note" type="button">Add Note</button><button class="secondary-button action-skip" type="button">${exercise.skipped?"Undo Skip":"Skip Exercise"}</button><button class="secondary-button action-up" type="button" ${exerciseIndex===0?"disabled":""}>Move Up</button><button class="secondary-button action-down" type="button" ${exerciseIndex===currentSession.exercises.length-1?"disabled":""}>Move Down</button>${starting?.calibrationRecommended?'<button class="secondary-button action-recalibrate" type="button">Recalibrate Starting Weight</button>':""}</div><label class="skip-reason-control">Skip reason (optional)<select class="skip-reason"><option value="">No reason</option>${["Equipment unavailable","Time limit","Soreness","Joint pain","Exercise unavailable","Other"].map(reason=>`<option value="${reason}" ${exercise.skipReason===reason?"selected":""}>${reason}</option>`).join("")}</select></label>${substitutions.length?`<div class="swap-control"><label>Swap Exercise<select class="action-swap"><option value="">Choose replacement</option>${substitutions.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("")}</select></label><label>Replacement scope<select class="swap-scope"><option value="today">Today only</option><option value="permanent">Permanent saved workout change</option>${currentSession.mesocycle?'<option value="mesocycle">Rest of active mesocycle</option>':""}</select></label></div>`:""}`;
  originalHeading?.insertAdjacentElement("afterend", actionMenu);

  const notes = document.createElement("section");
  notes.className = "exercise-notes";
  const preference = activeExercisePreferences(exercise);
  notes.innerHTML = `<h4>Exercise notes</h4><label>Permanent exercise note<textarea class="permanent-note" rows="2" placeholder="Appears every time you perform this exercise">${escapeHtml(preference.permanentNote || "")}</textarea></label><label>Session note<textarea class="session-note" rows="2" placeholder="Saved only with this workout">${escapeHtml(exercise.sessionNote || "")}</textarea></label>`;
  content.querySelector(".feedback-grid")?.insertAdjacentElement("beforebegin", notes);

  const setList = content.querySelector(".set-list");
  setList.innerHTML = exercise.sets.map((set,index)=>setCardMarkup(exercise,set,index,previous,unit,entryLabel)).join("");
  setList.querySelectorAll(".live-set-card").forEach(setCard => {
    const index = Number(setCard.dataset.setIndex);
    const set = exercise.sets[index];
    const weightInput = setCard.querySelector(".set-weight-input");
    const repsInput = setCard.querySelector(".set-reps-input");
    weightInput.oninput = () => { set.weight=internalWeightValue(weightInput.value,data.profile?.units);set.manuallyEditedWeight=true;syncExerciseWorkingWeight(exercise);persistActiveWorkout();updateLiveWorkoutHeader(); };
    repsInput.oninput = () => { set.reps=Math.max(0,Number(repsInput.value)||0);set.manuallyEditedReps=true;persistActiveWorkout(); };
    setCard.querySelector(".complete-set-card").onclick = () => {
      if (!set.done) {
        set.weight=internalWeightValue(weightInput.value,data.profile?.units);set.reps=Math.max(0,Number(repsInput.value)||0);set.done=true;
        const next = exercise.sets.slice(index+1).find(item=>!item.done);
        if (next && !next.restored) {
          if (!next.manuallyEditedWeight) next.weight=set.weight;
          if (!next.manuallyEditedReps) next.reps=set.reps;
        }
      } else set.done=false;
      syncExerciseWorkingWeight(exercise);
      if (exercise.sets.length && exercise.sets.every(item=>item.done)) { exercise.feedbackVisible=true;exercise.expanded=true;currentSession.currentExerciseIndex=exerciseIndex; }
      persistActiveWorkout(true);renderSession();
    };
  });

  const showFeedback = completed && (exercise.feedbackVisible || !exercise.feedbackAnswered || !exercise.jointPainAnswered || exercise.feedbackDeferred);
  const feedbackGrid = content.querySelector(".feedback-grid");
  const difficultyPrompt = [...content.querySelectorAll("p.small-note")].find(item=>item.textContent.trim().startsWith("How difficult was this exercise"));
  const painScale = content.querySelector(".pain-scale");
  const painPrompt = [...content.querySelectorAll("p.small-note")].find(item=>item.textContent.trim().startsWith("Did you experience joint pain"));
  const painDescription = content.querySelector(".pain-description");
  const jointGrid = content.querySelector(".joint-grid");
  [difficultyPrompt,feedbackGrid,painPrompt,painScale,painDescription].forEach(item=>item?.classList.toggle("hidden",!showFeedback));
  jointGrid?.classList.toggle("hidden",!showFeedback || Number(exercise.jointPain?.rating) <= 1);
  if (showFeedback && jointGrid) {
    const later = document.createElement("button");later.type="button";later.className="secondary-button answer-later";later.textContent="Answer Later";jointGrid.insertAdjacentElement("afterend",later);
    if(Number(exercise.jointPain?.rating)>1){const saveFeedback=document.createElement("button");saveFeedback.type="button";saveFeedback.className="primary-button save-exercise-feedback";saveFeedback.textContent="Save Exercise Feedback";jointGrid.insertAdjacentElement("afterend",saveFeedback);saveFeedback.onclick=()=>{if(!exercise.feedbackAnswered)return alert("Choose an exercise difficulty response.");if(!exercise.jointPain.joints.length)return alert("Select at least one affected joint.");exercise.jointPainAnswered=true;exercise.feedbackDeferred=false;exercise.feedbackVisible=false;if(data.settings.autoCollapseExercises!==false)exercise.expanded=false;persistActiveWorkout(true);renderSession();};}
    later.onclick=()=>{exercise.feedbackDeferred=true;exercise.feedbackVisible=false;if(data.settings.autoCollapseExercises!==false)exercise.expanded=false;persistActiveWorkout(true);renderSession();};
  }
  feedbackGrid?.querySelectorAll(".feedback-button").forEach(button=>button.onclick=()=>{exercise.feedback=button.dataset.feedback;exercise.feedbackAnswered=true;exercise.feedbackDeferred=false;if(exercise.jointPainAnswered&&data.settings.autoCollapseExercises!==false)exercise.expanded=false;persistActiveWorkout(true);renderSession();});
  painScale?.querySelectorAll(".pain-button").forEach(button=>button.onclick=()=>{exercise.jointPain.rating=Number(button.dataset.pain);if(exercise.jointPain.rating===1){exercise.jointPain.joints=[];exercise.jointPainAnswered=true;}else exercise.jointPainAnswered=exercise.jointPain.joints.length>0;exercise.feedbackDeferred=false;if(exercise.feedbackAnswered&&exercise.jointPainAnswered&&data.settings.autoCollapseExercises!==false)exercise.expanded=false;persistActiveWorkout(true);renderSession();});
  jointGrid?.querySelectorAll("input").forEach(input=>input.onchange=()=>{exercise.jointPain.joints=[...jointGrid.querySelectorAll("input:checked")].map(item=>item.value);exercise.jointPainAnswered=exercise.jointPain.rating===1;persistActiveWorkout(true);});

  notes.querySelector(".permanent-note").oninput = event => {preference.permanentNote=event.target.value;localStorage.setItem(STORAGE_KEY,JSON.stringify(data));persistActiveWorkout();};
  notes.querySelector(".session-note").oninput = event => {exercise.sessionNote=event.target.value;persistActiveWorkout();};
  actionMenu.querySelector(".action-note").onclick=()=>notes.querySelector(".permanent-note").focus();
  actionMenu.querySelector(".action-preview").onclick=event=>{const previewDefinition=definitionForExercise(exercise)||definition;if(previewDefinition?.defaults){const priorContext=exerciseLibraryContext;exerciseLibraryContext={type:"browse"};openExercisePreview(previewDefinition,event.currentTarget);exerciseLibraryContext=priorContext;}};
  actionMenu.querySelector(".action-history").onclick=event=>openActiveExerciseHistory(exercise,event.currentTarget);
  actionMenu.querySelector(".action-add-set").onclick=()=>{const last=exercise.sets.at(-1);exercise.sets.push({id:crypto.randomUUID(),weight:last?.weight??exercise.weight,reps:last?.reps??(prescription.minReps||0),done:false,manuallyEditedWeight:false,manuallyEditedReps:false,restored:false});persistActiveWorkout(true);renderSession();};
  actionMenu.querySelector(".action-remove-set").onclick=()=>{const last=exercise.sets.at(-1);if(!last){return;}if(exercise.sets.length===1){if(!confirm("Remove the final set and mark this exercise skipped?"))return;exercise.skipped=true;exercise.skipReason="All sets removed";}else{if(last.done&&!confirm("This set is completed. Remove it anyway?"))return;exercise.sets.pop();}persistActiveWorkout(true);renderSession();};
  actionMenu.querySelector(".action-skip").onclick=()=>{if(exercise.skipped){exercise.skipped=false;exercise.skipReason="";exercise.calibrationComplete=exercise.preSkipCalibrationComplete??exercise.calibrationComplete;}else{exercise.preSkipCalibrationComplete=exercise.calibrationComplete;exercise.calibrationComplete=true;exercise.skipped=true;exercise.skipReason=actionMenu.querySelector(".skip-reason").value;}persistActiveWorkout(true);renderSession();};
  actionMenu.querySelector(".action-up").onclick=()=>moveSessionExercise(exerciseIndex,-1);
  actionMenu.querySelector(".action-down").onclick=()=>moveSessionExercise(exerciseIndex,1);
  actionMenu.querySelector(".action-recalibrate")?.addEventListener("click",()=>{exercise.calibrationComplete=false;exercise.calibrationStarted=false;exercise.calibrationMaxed=false;exercise.calibrationAttempts=[];exercise.expanded=true;persistActiveWorkout(true);renderSession();});
  actionMenu.querySelector(".action-swap")?.addEventListener("change",event=>{const replacement=allExerciseDefinitions().find(item=>item.id===event.target.value);if(replacement)swapExerciseInSession(exerciseIndex,replacement,actionMenu.querySelector(".swap-scope").value);});
}

function moveSessionExercise(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= currentSession.exercises.length) return;
  const [exercise] = currentSession.exercises.splice(index,1);
  currentSession.exercises.splice(target,0,exercise);
  currentSession.currentExerciseIndex=target;
  currentSession.exercises.forEach((item,itemIndex)=>item.expanded=itemIndex===target);
  persistActiveWorkout(true);renderSession();
}

function openActiveExerciseHistory(exercise, trigger) {
  exerciseHistoryReturnFocus=trigger;
  const history=exactExerciseHistory(exercise);
  document.querySelector("#exerciseHistoryTitle").textContent=exercise.name;
  document.querySelector("#exerciseHistoryContent").innerHTML=history.length?history.map(({session,result},index)=>`<details class="exercise-history-entry" ${index===0?"open":""}><summary><span><strong>${new Date(session.date).toLocaleDateString()}</strong> - ${escapeHtml(session.workoutName)}</span><span>${result.skipped?"Skipped":result.sets?.filter(set=>set.done).length?"Completed":"Stopped"}</span></summary><p>${session.mesocycle?`${escapeHtml([data.mesocycles?.active,...(data.mesocycles?.completed||[])].find(item=>item?.id===session.mesocycle.mesocycleId)?.name||"Mesocycle")} - Week ${session.mesocycle.week}`:"Saved workout"}</p><p><strong>${escapeHtml(result.weightEntryType||weightEntryLabel(definitionForExercise(result)?.defaults?.weightEntryType||"Total Weight"))}</strong></p>${(result.sets||[]).map((set,setIndex)=>`<p>Set ${setIndex+1}: ${escapeHtml(workoutLoadText(result,set.weight??result.weight))} × ${set.reps}${set.done?" ✓":""}</p>`).join("")}<p>Target RIR ${result.targetRir??"-"} - Difficulty: ${feedbackLabel(result.feedback)}</p><p>Joint pain: ${result.jointPain?.rating??1}/5${result.jointPain?.joints?.length?` - ${result.jointPain.joints.map(escapeHtml).join(", ")}`:""}</p><p><strong>Permanent note:</strong> ${escapeHtml(activeExercisePreferences(result).permanentNote||"None")}</p><p><strong>Session note:</strong> ${escapeHtml(result.sessionNote||"None")}</p>${result.substitution?`<p>Substituted: ${escapeHtml(result.substitution.from)} to ${escapeHtml(result.substitution.to)}</p>`:""}${result.skipReason?`<p>Skip reason: ${escapeHtml(result.skipReason)}</p>`:""}</details>`).join(""):'<div class="panel"><p>No exercise history recorded.</p></div>';
  const dialog=document.querySelector("#exerciseHistoryDialog");dialog.showModal();document.querySelector("#closeExerciseHistoryButton").focus();
}

function closeActiveExerciseHistory() {
  const dialog=document.querySelector("#exerciseHistoryDialog");if(dialog.open)dialog.close();exerciseHistoryReturnFocus?.focus();
}

renderSession = function() {
  if (!currentSession) return;
  normalizeActiveWorkoutSession(currentSession);
  baseRenderSession();
  currentSession.exercises.forEach((exercise,index)=>enhanceExerciseCard(document.querySelectorAll("#sessionExerciseList > .exercise-card")[index],exercise,index));
  updateLiveWorkoutHeader();
  startLiveWorkoutClock();
};

beginWorkout = function(...args) {
  clearSavedActiveWorkout();
  baseBeginWorkout(...args);
  if (!currentSession) return;
  currentSession.startTime=currentSession.date;
  currentSession.elapsedMs=0;
  normalizeActiveWorkoutSession(currentSession);
  persistActiveWorkout(true);
  renderSession();
};

startWorkout = function(id, context = null) {
  const saved=loadSavedActiveWorkout();
  if(saved&&!currentSession){pendingLiveWorkoutStart={id,context};showResumeWorkoutPrompt(saved);return;}
  baseStartWorkout(id,context);
};

finishWorkout = function() {
  normalizeActiveWorkoutSession(currentSession);
  const unresolved=currentSession.exercises.find(exercise=>!exercise.skipped&&exercise.sets.length&&exercise.sets.every(set=>set.done)&&(!exercise.feedbackAnswered||!exercise.jointPainAnswered));
  if(unresolved){currentSession.currentExerciseIndex=currentSession.exercises.indexOf(unresolved);currentSession.exercises.forEach(exercise=>exercise.expanded=exercise===unresolved);unresolved.feedbackVisible=true;renderSession();return alert(`Complete the deferred difficulty and joint-pain feedback for ${unresolved.name} before saving the workout.`);}
  currentSession.exercises.forEach(exercise=>{exercise.weightEntryType=sessionExerciseDefinition(exercise).prescription.weightEntryType||sessionExerciseDefinition(exercise).definition.defaults?.weightEntryType||"Total Weight";syncExerciseWorkingWeight(exercise);});
  baseFinishWorkout();
  if(!currentSession){clearSavedActiveWorkout();if(liveWorkoutClock)clearInterval(liveWorkoutClock);renderHome();if(typeof renderPrograms==="function")renderPrograms();}
};

function showResumeWorkoutPrompt(saved = loadSavedActiveWorkout()) {
  if(!saved)return;
  const completed=saved.exercises.reduce((sum,exercise)=>sum+exercise.sets.filter(set=>set.done).length,0);
  document.querySelector("#resumeSessionSummary").textContent=`${saved.workoutName} - ${completed} completed sets - ${formatElapsed(saved.elapsedMs||currentElapsedMilliseconds(saved))} elapsed`;
  const dialog=document.querySelector("#resumeSessionDialog");if(!dialog.open)dialog.showModal();document.querySelector("#resumeSessionButton").focus();
}

function resumeSavedWorkout() {
  const saved=loadSavedActiveWorkout();if(!saved)return;
  saved.pausedAt=null;saved.startTime=new Date(Date.now()-(Number(saved.elapsedMs)||0)).toISOString();currentSession=saved;
  document.querySelector("#resumeSessionDialog").close();renderSession();document.querySelector("#sessionDialog").showModal();persistActiveWorkout(true);
}

function pauseCurrentWorkout() {
  currentSession.elapsedMs=currentElapsedMilliseconds();currentSession.pausedAt=new Date().toISOString();persistActiveWorkout(true);
  document.querySelector("#sessionExitDialog").close();document.querySelector("#sessionDialog").close();currentSession=null;renderUpdateNotice();renderHome();if(typeof renderPrograms==="function")renderPrograms();
}

function discardActiveWorkout() {
  if(!confirm("Discard this workout and all unsaved session progress?"))return false;
  currentSession=null;clearSavedActiveWorkout();if(liveWorkoutClock)clearInterval(liveWorkoutClock);
  document.querySelector("#sessionExitDialog").close();document.querySelector("#resumeSessionDialog").close();document.querySelector("#sessionDialog").close();renderUpdateNotice();renderHome();if(typeof renderPrograms==="function")renderPrograms();
  if(pendingLiveWorkoutStart){const next=pendingLiveWorkoutStart;pendingLiveWorkoutStart=null;baseStartWorkout(next.id,next.context);}
  return true;
}

prepareLiveWorkoutHeader();
document.querySelector("#closeSessionButton").onclick=()=>{persistActiveWorkout(true);const dialog=document.querySelector("#sessionExitDialog");dialog.showModal();document.querySelector("#continueSessionButton").focus();};
document.querySelector("#finishWorkoutButton").onclick=finishWorkout;
document.querySelector("#sessionDialog").addEventListener("cancel",event=>{event.preventDefault();document.querySelector("#closeSessionButton").click();});
document.querySelector("#continueSessionButton").onclick=()=>document.querySelector("#sessionExitDialog").close();
document.querySelector("#saveSessionButton").onclick=pauseCurrentWorkout;
document.querySelector("#discardSessionButton").onclick=discardActiveWorkout;
document.querySelector("#resumeSessionButton").onclick=()=>{pendingLiveWorkoutStart=null;resumeSavedWorkout();};
document.querySelector("#discardSavedSessionButton").onclick=discardActiveWorkout;
document.querySelector("#resumeSessionDialog").addEventListener("cancel",event=>event.preventDefault());
document.querySelector("#closeExerciseHistoryButton").onclick=closeActiveExerciseHistory;
document.querySelector("#exerciseHistoryDialog").addEventListener("cancel",event=>{event.preventDefault();closeActiveExerciseHistory();});
document.querySelector("#autoCollapseExercises").onchange=event=>{data.settings.autoCollapseExercises=event.target.checked;saveData();};
window.addEventListener("pagehide",()=>persistActiveWorkout(true));
document.addEventListener("visibilitychange",()=>{if(document.hidden)persistActiveWorkout(true);});

setTimeout(()=>{const saved=loadSavedActiveWorkout();if(saved&&!currentSession)showResumeWorkoutPrompt(saved);},50);
