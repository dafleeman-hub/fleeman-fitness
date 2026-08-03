const mesoWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const mesoMuscles = ["Chest", "Back", "Shoulders", "Arms", "Quads", "Hamstrings", "Calves", "Core", "Other"];
let mesoBuilder = null;
let mesoStep = 1;

function ensureMesocycleData() {
  if (!data.mesocycles || typeof data.mesocycles !== "object") data.mesocycles = {};
  if (!Array.isArray(data.mesocycles.drafts)) data.mesocycles.drafts = [];
  if (!Array.isArray(data.mesocycles.completed)) data.mesocycles.completed = [];
  if (!("active" in data.mesocycles)) data.mesocycles.active = null;
}

function blankMesoExercise(name = "") {
  return { id: crypto.randomUUID(), name, muscle: "Other", sets: 3, minReps: 8, maxReps: 12, startWeight: 0, targetRir: 3, rest: 90, increment: 5 };
}

function copyExercise(exercise) {
  return {
    ...structuredClone(exercise), id: crypto.randomUUID(), name: exercise.name || "", muscle: exercise.muscle || exercise.primaryMuscle || inferExerciseMuscle(exercise.name),
    sets: Number(exercise.sets || 3), minReps: Number(exercise.minReps || 8), maxReps: Number(exercise.maxReps || 12),
    startWeight: Number(exercise.startWeight || 0), targetRir: Number(exercise.targetRir ?? 3),
    rest: Number(exercise.rest ?? data.settings.rest), increment: Number(exercise.increment ?? data.settings.increment)
  };
}

function inferExerciseMuscle(name = "") {
  const text = name.toLowerCase();
  if (/bench|chest|pec|fly/.test(text)) return "Chest";
  if (/row|pulldown|pull-up|lat|deadlift/.test(text)) return "Back";
  if (/shoulder|overhead|delt/.test(text)) return "Shoulders";
  if (/curl|tricep|bicep|extension|pushdown/.test(text)) return "Arms";
  if (/quad|squat|lunge|leg press|split squat/.test(text)) return "Quads";
  if (/hamstring|leg curl|romanian/.test(text)) return "Hamstrings";
  if (/calf/.test(text)) return "Calves";
  if (/core|ab|plank|crunch/.test(text)) return "Core";
  return "Other";
}

function newMesocycle() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: crypto.randomUUID(), name: "", startDate: today, trainingWeeks: 4, includeDeload: false,
    totalWeeks: 4, daysPerWeek: 3, schedule: defaultSchedule(3), status: "draft", createdAt: new Date().toISOString(),
    progress: { week: 1, slot: 0, completed: [], skipped: [], needsWeekReview: false }
  };
}

function defaultSchedule(count) {
  const preferred = [1, 3, 5, 2, 4, 6, 0];
  return preferred.slice(0, count).map((dayIndex, index) => ({
    id: crypto.randomUUID(), dayIndex, order: index,
    workout: { id: crypto.randomUUID(), name: `Training Day ${index + 1}`, notes: "", exercises: [blankMesoExercise()] }
  }));
}

function openMesocycleBuilder(mesocycle = null) {
  mesoBuilder = structuredClone(mesocycle || newMesocycle());
  mesoStep = 1;
  document.querySelector("#mesocycleDialogTitle").textContent = mesocycle?.sourceTemplateId ? "Build mesocycle" : mesocycle ? "Edit mesocycle" : "Create mesocycle";
  renderMesoBuilder();
  document.querySelector("#mesocycleDialog").showModal();
}

function renderMesoBuilder() {
  document.querySelector("#mesocycleStepIndicator").innerHTML = [1,2,3,4]
    .map(step => `<div class="step-pill ${step <= mesoStep ? "active" : ""}"></div>`).join("");
  const body = document.querySelector("#mesocycleBuilderBody");
  if (mesoStep === 1) renderMesoBasics(body);
  if (mesoStep === 2) renderMesoSchedule(body);
  if (mesoStep === 3) renderMesoWorkouts(body);
  if (mesoStep === 4) renderMesoReview(body);
  const actions = document.querySelector("#mesocycleBuilderActions");
  actions.innerHTML = `${mesoStep > 1 ? '<button class="secondary-button" id="mesoBack">Back</button>' : ""}
    ${mesoStep < 4 ? '<button class="primary-button" id="mesoContinue">Continue</button>' : `
      <button class="secondary-button" id="mesoEdit">Edit</button>
      <button class="secondary-button" id="mesoDraft">Save draft</button>
      <button class="primary-button" id="mesoStart">Start mesocycle</button>`}`;
  document.querySelector("#mesoBack")?.addEventListener("click", () => { saveMesoStep(); mesoStep--; renderMesoBuilder(); });
  document.querySelector("#mesoContinue")?.addEventListener("click", () => { if (saveMesoStep()) { mesoStep++; renderMesoBuilder(); } });
  document.querySelector("#mesoEdit")?.addEventListener("click", () => { mesoStep = 1; renderMesoBuilder(); });
  document.querySelector("#mesoDraft")?.addEventListener("click", saveMesocycleDraft);
  document.querySelector("#mesoStart")?.addEventListener("click", () => activateMesocycle(mesoBuilder));
}

function renderMesoBasics(body) {
  body.innerHTML = `<h3>Step 1: Basic information</h3>
    <div class="panel">
      <label>Mesocycle name<input id="mesoName" value="${escapeHtml(mesoBuilder.name)}" placeholder="Summer Hypertrophy Block" required></label>
      <p class="small-note">You can edit this plan before starting.</p>
      <div class="exercise-actions"><button type="button" class="secondary-button meso-date-choice" data-date-choice="today">Start today</button><button type="button" class="secondary-button meso-date-choice" data-date-choice="monday">Start next Monday</button></div>
      <label>Start date<input id="mesoStartDate" type="date" value="${mesoBuilder.startDate}"></label>
      <label>Training weeks<select id="mesoWeeks">${[2,3,4,5,6,7,8,9,10,11,12].map(n => `<option value="${n}" ${n===mesoBuilder.trainingWeeks?"selected":""}>${n} weeks${n>8||n<4?" (custom)":""}</option>`).join("")}</select></label>
      <label><span>Include a deload week</span><select id="mesoDeload"><option value="no">No</option><option value="yes" ${mesoBuilder.includeDeload?"selected":""}>Yes — final week</option></select></label>
      <div class="summary-stat"><strong id="mesoTotalPreview">${mesoBuilder.trainingWeeks + (mesoBuilder.includeDeload?1:0)} weeks total</strong><span>The deload is added after the training weeks.</span></div>
    </div>`;
  ["#mesoWeeks", "#mesoDeload"].forEach(selector => document.querySelector(selector).onchange = () => {
    const total = Number(document.querySelector("#mesoWeeks").value) + (document.querySelector("#mesoDeload").value === "yes" ? 1 : 0);
    document.querySelector("#mesoTotalPreview").textContent = `${total} weeks total`;
  });
  document.querySelectorAll(".meso-date-choice").forEach(button=>button.onclick=()=>{const date=new Date();if(button.dataset.dateChoice==="monday"){const days=(8-date.getDay())%7||7;date.setDate(date.getDate()+days);}document.querySelector("#mesoStartDate").value=date.toISOString().slice(0,10);});
}

function renderMesoSchedule(body) {
  body.innerHTML = `<h3>Step 2: Choose training days</h3>
    <div class="panel"><label>Days per week<select id="mesoDaysPerWeek">${[2,3,4,5,6,7].map(n => `<option value="${n}" ${n===mesoBuilder.daysPerWeek?"selected":""}>${n} days</option>`).join("")}</select></label></div>
    <div id="mesoDayList"></div>`;
  document.querySelector("#mesoDaysPerWeek").onchange = event => {
    resizeSchedule(Number(event.target.value)); renderMesoSchedule(body);
  };
  const list = document.querySelector("#mesoDayList");
  mesoBuilder.schedule.forEach((slot, index) => {
    const card = document.createElement("div"); card.className = "day-builder";
    card.innerHTML = `<label>Training day ${index+1}<select class="meso-day-select">${mesoWeekdays.map((day,i)=>`<option value="${i}" ${i===slot.dayIndex?"selected":""}>${day}</option>`).join("")}</select></label>
      <div class="exercise-actions"><button class="secondary-button move-up" ${index===0?"disabled":""}>Move up</button><button class="secondary-button move-down" ${index===mesoBuilder.schedule.length-1?"disabled":""}>Move down</button></div>`;
    card.querySelector("select").onchange = e => slot.dayIndex = Number(e.target.value);
    card.querySelector(".move-up").onclick = () => moveSchedule(index,-1);
    card.querySelector(".move-down").onclick = () => moveSchedule(index,1);
    list.appendChild(card);
  });
}

function resizeSchedule(count) {
  mesoBuilder.daysPerWeek = count;
  while (mesoBuilder.schedule.length < count) mesoBuilder.schedule.push(defaultSchedule(1)[0]);
  mesoBuilder.schedule = mesoBuilder.schedule.slice(0, count);
}
function moveSchedule(index, delta) {
  const target = index + delta; if (target < 0 || target >= mesoBuilder.schedule.length) return;
  [mesoBuilder.schedule[index], mesoBuilder.schedule[target]] = [mesoBuilder.schedule[target], mesoBuilder.schedule[index]];
  renderMesoBuilder();
}

function renderMesoWorkouts(body) {
  body.innerHTML = `<h3>Step 3: Build workout days</h3><p class="small-note">Start from a saved workout or build each day here.</p><div id="mesoWorkoutDays"></div>`;
  const holder = document.querySelector("#mesoWorkoutDays");
  mesoBuilder.schedule.forEach((slot, dayIndex) => {
    const card = document.createElement("div"); card.className = "meso-workout-card";
    card.innerHTML = `<p class="eyebrow">${mesoWeekdays[slot.dayIndex]}</p>
      <label>Notes<input class="day-notes" value="${escapeHtml(slot.workout.notes||"")}"></label>
      <div class="meso-exercises"></div><div class="exercise-actions"><button class="secondary-button preview-meso-day" aria-label="Preview ${escapeHtml(slot.workout.name)}">Preview</button><button class="secondary-button browse-meso-library">Browse Exercise Library</button><button class="secondary-button add-meso-exercise">Create Custom</button></div>`;
    card.querySelector(".day-notes").oninput = e => slot.workout.notes=e.target.value;
    card.querySelector(".add-meso-exercise").onclick = () => { slot.workout.exercises.push(blankMesoExercise()); renderMesoBuilder(); };
    card.querySelector(".browse-meso-library").onclick = () => openExerciseLibrary({ type:"mesocycle", slot });
    card.querySelector(".preview-meso-day").onclick = event => openWorkoutPreview(slot.workout, { trigger: event.currentTarget, startAction: null });
    const exHolder=card.querySelector(".meso-exercises");
    slot.workout.exercises.forEach((exercise, exerciseIndex)=>exHolder.appendChild(mesoExerciseEditor(exercise,slot,exerciseIndex)));
    holder.appendChild(card);
  });
}

function mesoExerciseEditor(exercise, slot, index) {
  const card=document.createElement("div"); card.className="exercise-meso-card";
  const targetMuscle=exercise.targetMuscle||exercise.primaryMuscle||(exercise.muscle!=="Other"?exercise.muscle:"")||"";
  const availableExercises=allExerciseDefinitions().filter(definition=>!targetMuscle||definition.primaryMuscle===targetMuscle);
  const currentIsListed=availableExercises.some(definition=>definition.id===exercise.libraryExerciseId);
  const starting=exercise.startingWeightRecommendation||startingWeightRecommendation(exercise);
  card.innerHTML=`<label>Target muscle group<select class="exercise-target-muscle"><option value="">Choose muscle group</option>${Object.keys(EXERCISE_CATALOG).map(muscle=>`<option value="${escapeHtml(muscle)}" ${muscle===targetMuscle?"selected":""}>${escapeHtml(muscle)}</option>`).join("")}</select></label>
    <label>Exercise<select class="library-exercise-select"><option value="">Choose an exercise${targetMuscle?` for ${escapeHtml(targetMuscle)}`:""}</option>${exercise.name&&!currentIsListed?`<option value="__current__" selected>${escapeHtml(exercise.name)} (current custom exercise)</option>`:""}${availableExercises.map(definition=>`<option value="${escapeHtml(definition.id)}" ${definition.id===exercise.libraryExerciseId?"selected":""}>${escapeHtml(definition.name)}</option>`).join("")}</select></label>
    <div class="form-grid"><label>Muscle<select data-field="muscle">${mesoMuscles.map(m=>`<option ${m===exercise.muscle?"selected":""}>${m}</option>`).join("")}</select></label>
    <label>Starting sets<input data-field="sets" type="number" min="1" max="10" value="${exercise.sets}"></label>
    <label>Min reps<input data-field="minReps" type="number" min="1" value="${exercise.minReps}"></label>
    <label>Max reps<input data-field="maxReps" type="number" min="1" value="${exercise.maxReps}"></label>
    <label>${starting.weight?weightEntryLabel(exercise.weightEntryType||"Total Weight"):"Starting weight needed"} (${weightUnit(data.profile?.units)})<input data-field="startWeight" type="number" min="0" step="${data.profile?.units==="metric"?.5:2.5}" value="${displayWeightValue(exercise.startWeight,data.profile?.units)}"></label>
    <label>Target RIR<input data-field="targetRir" type="number" min="0" max="10" value="${exercise.targetRir}"></label>
    <label>Rest seconds<input data-field="rest" type="number" min="0" value="${exercise.rest}"></label>
    <label>Weight increase<input data-field="increment" type="number" min="0" step="2.5" value="${exercise.increment}"></label></div>
    <div class="exercise-actions"><button class="secondary-button up" ${index===0?"disabled":""}>↑</button><button class="secondary-button down" ${index===slot.workout.exercises.length-1?"disabled":""}>↓</button><button class="secondary-button duplicate">Duplicate</button><button class="secondary-button swap">Swap</button><button class="danger-button remove">Remove</button></div>`;
  card.querySelector(".form-grid").insertAdjacentHTML("afterend",`<p class="small-note"><span class="confidence-label">${escapeHtml(starting.label)}</span> ${escapeHtml(starting.reason)}</p>`);
  card.querySelector(".exercise-target-muscle").onchange=event=>{const muscle=event.target.value;exercise.targetMuscle=muscle;exercise.primaryMuscle=muscle;exercise.muscle=muscle||"Other";if(exercise.libraryExerciseId&&muscle!==allExerciseDefinitions().find(item=>item.id===exercise.libraryExerciseId)?.primaryMuscle){exercise.libraryExerciseId=null;exercise.name="";}renderMesoBuilder();};
  card.querySelector(".library-exercise-select").onchange=event=>{if(!event.target.value||event.target.value==="__current__")return;const definition=allExerciseDefinitions().find(item=>item.id===event.target.value);if(!definition)return;const prescription=exerciseDefinitionToPrescription(definition);const recommendation=startingWeightRecommendation(prescription);prescription.startWeight=recommendation.weight;prescription.startingWeightRecommendation=recommendation;slot.workout.exercises[index]={...prescription,targetMuscle:definition.primaryMuscle};markExerciseUsed(definition.id);renderMesoBuilder();};
  card.querySelectorAll("[data-field]").forEach(input=>input.oninput=e=>{const f=e.target.dataset.field;if(f==="startWeight"){exercise[f]=internalWeightValue(e.target.value,data.profile?.units);if(exercise.startingWeightRecommendation&&Math.abs(exercise[f]-exercise.startingWeightRecommendation.weight)>.1)exercise.startingWeightRecommendation=recommendationResult(exercise[f],"Manual starting weight","Entered manually in the mesocycle builder.","manual",false);return;}exercise[f]=["name","muscle"].includes(f)?e.target.value:Number(e.target.value);});
  card.querySelector(".up").onclick=()=>moveExercise(slot,index,-1); card.querySelector(".down").onclick=()=>moveExercise(slot,index,1);
  card.querySelector(".duplicate").onclick=()=>{slot.workout.exercises.splice(index+1,0,copyExercise(exercise));renderMesoBuilder();};
  card.querySelector(".swap").onclick=()=>{exercise.name="";exercise.muscle="Other";renderMesoBuilder();};
  card.querySelector(".remove").onclick=()=>{if(confirm("Remove this exercise?")){slot.workout.exercises.splice(index,1);renderMesoBuilder();}};
  return card;
}
function moveExercise(slot,index,delta){const t=index+delta;if(t<0||t>=slot.workout.exercises.length)return;[slot.workout.exercises[index],slot.workout.exercises[t]]=[slot.workout.exercises[t],slot.workout.exercises[index]];renderMesoBuilder();}

function renderMesoReview(body) {
  const totals={}; mesoBuilder.schedule.forEach(s=>s.workout.exercises.forEach(e=>totals[e.muscle]=(totals[e.muscle]||0)+Number(e.sets)));
  const readiness={history:0,similar:0,profile:0,calibration:0};mesoBuilder.schedule.flatMap(slot=>slot.workout.exercises).forEach(exercise=>{const recommendation=exercise.startingWeightRecommendation||startingWeightRecommendation(exercise);if(/history|previous mesocycle|strength baseline/.test(recommendation.label.toLowerCase()))readiness.history++;else if(/similar|movement baseline/.test(recommendation.label.toLowerCase()))readiness.similar++;else if(recommendation.confidence==="low")readiness.profile++;else readiness.calibration++;});
  body.innerHTML=`<h3>Step 4: Review</h3><div class="review-card"><h2>${escapeHtml(mesoBuilder.name)}</h2><p>Starts ${new Date(mesoBuilder.startDate+"T12:00:00").toLocaleDateString()} • ${mesoBuilder.totalWeeks} weeks • ${mesoBuilder.daysPerWeek} training days</p>${mesoBuilder.includeDeload?`<p>Week ${mesoBuilder.totalWeeks} is a deload.</p>`:""}</div>
    ${mesoBuilder.schedule.map(s=>`<div class="review-card"><h3>${mesoWeekdays[s.dayIndex]}: ${escapeHtml(s.workout.name)}</h3><p>${s.workout.exercises.map(e=>`${escapeHtml(e.name)} (${e.sets} × ${e.minReps}-${e.maxReps}, RIR ${e.targetRir})`).join(" • ")}</p></div>`).join("")}
    <div class="review-card"><h3>Weight readiness</h3><p>${readiness.history} based on history or exact baselines • ${readiness.similar} estimated from similar movements • ${readiness.profile} conservative profile estimates • ${readiness.calibration} need calibration</p><p class="small-note">You may start now, review weights, enter weights manually, or edit strength baselines. Calibration is not required before starting.</p></div>
    <div class="review-card"><h3>Estimated weekly sets</h3><p>${Object.entries(totals).map(([m,n])=>`${escapeHtml(m)}: ${n}`).join(" • ")||"No exercises yet"}</p></div>`;
}

function saveMesoStep() {
  if (mesoStep===1) {
    const name=document.querySelector("#mesoName").value.trim(); if(!name){alert("Enter a mesocycle name.");return false;}
    mesoBuilder.name=name; mesoBuilder.startDate=document.querySelector("#mesoStartDate").value; mesoBuilder.trainingWeeks=Number(document.querySelector("#mesoWeeks").value);
    mesoBuilder.includeDeload=document.querySelector("#mesoDeload").value==="yes"; mesoBuilder.totalWeeks=mesoBuilder.trainingWeeks+(mesoBuilder.includeDeload?1:0);
  }
  if (mesoStep===2) {
    const unique=new Set(mesoBuilder.schedule.map(s=>s.dayIndex)); if(unique.size!==mesoBuilder.schedule.length){alert("Choose a different weekday for each training day.");return false;}
  }
  if (mesoStep===3 && mesoBuilder.schedule.some(s=>!s.workout.name.trim()||!s.workout.exercises.length||s.workout.exercises.some(e=>!e.name.trim()))){alert("Name every workout and exercise before continuing.");return false;}
  return true;
}

function saveMesocycleDraft() {
  ensureMesocycleData(); mesoBuilder.status="draft";
  const i=data.mesocycles.drafts.findIndex(m=>m.id===mesoBuilder.id); if(i>=0)data.mesocycles.drafts[i]=structuredClone(mesoBuilder);else data.mesocycles.drafts.push(structuredClone(mesoBuilder));
  document.querySelector("#mesocycleDialog").close(); saveData();
}

function activateMesocycle(meso) {
  if(data.mesocycles.active && data.mesocycles.active.id!==meso.id){alert("End, complete, or return the active mesocycle to drafts before starting another.");return;}
  meso.status="active"; meso.activatedAt=new Date().toISOString(); meso.progress=meso.progress||{week:1,slot:0,completed:[],skipped:[],needsWeekReview:false};
  meso.schedule.forEach(slot=>ensureWorkoutTemplate(slot.workout)); data.mesocycles.active=structuredClone(meso); data.mesocycles.drafts=data.mesocycles.drafts.filter(m=>m.id!==meso.id);
  document.querySelector("#mesocycleDialog").close(); saveData();
}

function ensureWorkoutTemplate(workout) {
  const existing=data.workouts.findIndex(w=>w.id===workout.id); const copy=structuredClone(workout);
  if(existing>=0)data.workouts[existing]=copy;else data.workouts.push(copy);
}

function mesoTotalWorkouts(meso){return meso.totalWeeks*meso.schedule.length;}
function mesoDoneCount(meso){return meso.progress.completed.length+meso.progress.skipped.length;}
function mesoSlotResolved(meso,week,slot){return meso.progress.completed.some(item=>item.week===week&&item.slot===slot)||meso.progress.skipped.some(item=>item.week===week&&item.slot===slot);}
function nextMesoSlot(meso){for(let week=1;week<=meso.totalWeeks;week++){for(let slot=0;slot<meso.schedule.length;slot++){if(!mesoSlotResolved(meso,week,slot))return{week,slot,plan:meso.schedule[slot]};}}return null;}
function currentMesoPosition(meso){const next=nextMesoSlot(meso);return next?{week:next.week,slot:next.slot}:{week:meso.totalWeeks+1,slot:0};}
function isDeloadWeek(meso,week){return meso.includeDeload&&week===meso.totalWeeks;}

function renderPrograms() {
  ensureMesocycleData(); const active=data.mesocycles.active; const activeBox=document.querySelector("#activeMesocycle");
  if(!active) activeBox.innerHTML='<div class="panel"><h3>No active mesocycle</h3><p>Create one or reopen a draft to begin.</p></div>';
  else activeBox.innerHTML=activeMesocycleMarkup(active);
  wireActiveMesoButtons(active);
  document.querySelector("#previewNextMeso")?.addEventListener("click", event => previewNextMesoWorkout(active, event.currentTarget));
  renderMesoCollection("#draftMesocycles",data.mesocycles.drafts,"draft"); renderMesoCollection("#completedMesocycles",data.mesocycles.completed,"completed");
}

function savedWorkoutInProgress(){return typeof loadSavedActiveWorkout==="function"?loadSavedActiveWorkout():null;}

function activeMesocycleMarkupBase(meso){const next=nextMesoSlot(meso),done=mesoDoneCount(meso),total=mesoTotalWorkouts(meso),pct=Math.min(100,Math.round(done/total*100));const pos=currentMesoPosition(meso),paused=savedWorkoutInProgress();
  if(!next)return `<div class="mesocycle-card"><p class="eyebrow">READY TO COMPLETE</p><h2>${escapeHtml(meso.name)}</h2><p>${done} of ${total} workouts resolved.</p><div class="progress-track"><div class="progress-fill" style="width:100%"></div></div><button id="completeMeso" class="primary-button">View summary and complete</button></div>`;
  const workoutHeading=paused?`Workout in progress: ${escapeHtml(paused.workoutName)}`:`Next: ${isDeloadWeek(meso,pos.week)?"Deload — ":""}${escapeHtml(next.plan.workout.name)}`;
  const mainAction=paused?'<button id="startNextMeso" class="primary-button">Resume workout</button>':meso.progress.needsWeekReview?weekReviewMarkup(meso,pos.week):'<button id="startNextMeso" class="primary-button">Start next workout</button>';
  return `<div class="mesocycle-card"><p class="eyebrow">ACTIVE MESOCYCLE</p><h2>${escapeHtml(meso.name)}</h2><p>Week ${pos.week} of ${meso.totalWeeks} • Training day ${pos.slot+1} of ${meso.schedule.length}</p><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><p>${done} completed or skipped • ${total-done} remaining</p><h3>${workoutHeading}</h3>${mainAction}<div class="card-actions mesocycle-actions" aria-label="Mesocycle actions"><button id="previewNextMeso" class="secondary-button">Preview workout</button><button id="viewMeso" class="secondary-button">View full</button><button id="editFutureMeso" class="secondary-button">Edit future</button><button id="rescheduleMesoWorkout" class="secondary-button">Move next to tomorrow</button><button id="skipMesoWorkout" class="secondary-button">Skip</button><button id="moveMesoForward" class="secondary-button">Move schedule forward</button><button id="draftActiveMeso" class="secondary-button">Return to draft</button><button id="endMeso" class="danger-button">End</button></div></div>`;}

function weekReviewMarkup(meso,week){const prior=meso.progress.completed.filter(x=>x.week===week-1);const sessions=data.history.filter(h=>h.mesocycle?.mesocycleId===meso.id&&h.mesocycle.week===week-1);const sets=sessions.reduce((n,h)=>n+h.exercises.reduce((s,e)=>s+e.sets.filter(x=>x.done).length,0),0);const sore=sessions.flatMap(h=>Object.entries(h.soreness?.ratings||{}).filter(([,rating])=>rating>=2).map(([muscle,rating])=>({muscle,rating,decision:h.soreness.decision})));const pain=sessions.flatMap(h=>h.exercises.filter(e=>Number(e.jointPain?.rating)>=3).map(e=>({exercise:e.name,rating:e.jointPain.rating,joints:e.jointPain.joints||[],decision:e.painRecommendationDecision})));const highJoints={};pain.filter(p=>p.rating>=4).forEach(p=>p.joints.forEach(j=>highJoints[j]=(highJoints[j]||0)+1));return `<div class="review-card"><h3>Week ${week} review</h3><p>Previous week: ${prior.length} completed • ${meso.schedule.length-prior.length} missed • ${sets} sets</p><div class="prescription-change"><h3>Soreness response</h3>${sore.length?sore.map(s=>`<p>${sorenessLabel(s.muscle)}: ${s.rating===3?"I can barely move":"I still feel it"} • ${escapeHtml(s.decision)}</p>`).join(""):"<p>No significant muscle soreness reported.</p>"}</div><div class="prescription-change"><h3>Joint pain response</h3>${pain.length?pain.map(p=>`<p>${escapeHtml(p.exercise)}: ${p.rating}/5 • ${p.joints.map(escapeHtml).join(", ")} • ${p.rating>=4?"Replacement recommended":"Reduced load and technique review"} • ${escapeHtml(p.decision||"pending")}</p>`).join(""):"<p>No exercises rated 3 or higher.</p>"}${Object.entries(highJoints).filter(([,count])=>count>1).map(([joint])=>`<p class="recovery-warning">Multiple exercises reported high pain at the ${escapeHtml(joint)}. Review each affected exercise individually.</p>`).join("")}</div><button id="beginMesoWeek" class="primary-button">Approve and begin week ${week}</button><button id="repeatMesoWeek" class="secondary-button">Repeat previous week</button></div>`;}

function wireActiveMesoButtons(active){if(!active)return;document.querySelector("#startNextMeso")?.addEventListener("click",()=>{const paused=savedWorkoutInProgress();if(paused)resumeSavedWorkout();else startNextMesoWorkout(active);});document.querySelector("#viewMeso")?.addEventListener("click",()=>openMesocycleBuilder(active));document.querySelector("#editFutureMeso")?.addEventListener("click",()=>openMesocycleBuilder(active));document.querySelector("#rescheduleMesoWorkout")?.addEventListener("click",()=>rescheduleNextMeso(active));document.querySelector("#skipMesoWorkout")?.addEventListener("click",()=>skipNextMeso(active));document.querySelector("#moveMesoForward")?.addEventListener("click",()=>moveMesoForward(active));document.querySelector("#draftActiveMeso")?.addEventListener("click",()=>returnMesoToDraft(active));document.querySelector("#endMeso")?.addEventListener("click",()=>endMesocycle(active));document.querySelector("#beginMesoWeek")?.addEventListener("click",()=>{active.progress.needsWeekReview=false;saveData();});document.querySelector("#repeatMesoWeek")?.addEventListener("click",()=>repeatPreviousMesoWeek(active));document.querySelector("#completeMeso")?.addEventListener("click",()=>completeMesocycle(active));}

function renderMesoCollection(selector,items,type){const el=document.querySelector(selector);el.innerHTML=items.length?"":`<div class="panel"><p>No ${type} mesocycles.</p></div>`;items.forEach(m=>{const card=document.createElement("div");card.className="mesocycle-card";const summary=m.summary?`<p>${m.summary.completed}/${m.summary.planned} workouts • ${m.summary.percentage}% • ${m.summary.sets} sets • ${m.summary.improved} exercises improved${m.summary.pain.length?` • Pain flags: ${m.summary.pain.map(escapeHtml).join(", ")}`:""}</p>`:"";card.innerHTML=`<h3>${escapeHtml(m.name)}</h3><p>${m.totalWeeks} weeks • ${m.daysPerWeek} days/week</p>${summary}<div class="card-actions"><button class="secondary-button open">${type==="draft"?"Continue editing":"View"}</button>${type==="completed"?'<button class="secondary-button duplicate">Duplicate</button>':""}</div>`;card.querySelector(".open").onclick=()=>openMesocycleBuilder(m);card.querySelector(".duplicate")?.addEventListener("click",()=>duplicateMesocycle(m));el.appendChild(card);});}

function workoutForMesoSlot(meso,next,persist=true){let workout=structuredClone(next.plan.workout);if(isDeloadWeek(meso,next.week)){workout.id=`${workout.id}-deload-${meso.id}`;workout.name=`Deload — ${workout.name}`;workout.exercises=workout.exercises.map(e=>({...e,id:`${e.id}-deload`,sets:Math.ceil(e.sets/2),startWeight:Math.round(e.startWeight*.85/2.5)*2.5,targetRir:Math.max(4,e.targetRir)}));}if(persist)ensureWorkoutTemplate(workout);return workout;}
function previewNextMesoWorkout(meso,trigger){const next=nextMesoSlot(meso);if(!next)return;const workout=workoutForMesoSlot(meso,next,false);const deload=isDeloadWeek(meso,next.week);openWorkoutPreview(workout,{trigger,originalWorkout:deload?next.plan.workout:null,adjustmentReason:deload?"Deload week: sets and load are reduced and target RIR is increased.":"Current mesocycle prescription with progression and approved pain recommendations.",context:{mesocycleId:meso.id,week:next.week,slot:next.slot,plannedWorkoutId:next.plan.workout.id},startAction:()=>startNextMesoWorkout(meso)});}
function startNextMesoWorkout(meso){const next=nextMesoSlot(meso);if(!next)return;const workout=workoutForMesoSlot(meso,next);startWorkout(workout.id,{mesocycleId:meso.id,week:next.week,slot:next.slot,plannedWorkoutId:next.plan.workout.id});}
function mesoSlotReference(meso,week,slot){const plan=meso.schedule[slot];return plan?{week,slot,plan}:null;}
function startScheduledMesoWorkout(meso,week,slot){const scheduled=mesoSlotReference(meso,week,slot);if(!scheduled||mesoSlotResolved(meso,week,slot))return;const workout=workoutForMesoSlot(meso,scheduled);startWorkout(workout.id,{mesocycleId:meso.id,week,slot,plannedWorkoutId:scheduled.plan.workout.id});}
function previewScheduledMesoWorkout(meso,week,slot,trigger){const scheduled=mesoSlotReference(meso,week,slot);if(!scheduled)return;const workout=workoutForMesoSlot(meso,scheduled,false);const deload=isDeloadWeek(meso,week);openWorkoutPreview(workout,{trigger,originalWorkout:deload?scheduled.plan.workout:null,adjustmentReason:deload?"Deload week: sets and load are reduced and target RIR is increased.":"Today's active-mesocycle prescription.",context:{mesocycleId:meso.id,week,slot,plannedWorkoutId:scheduled.plan.workout.id},startAction:mesoSlotResolved(meso,week,slot)?null:()=>startScheduledMesoWorkout(meso,week,slot)});}
function skipNextMeso(meso){const next=nextMesoSlot(meso);if(!next||!confirm(`Skip ${next.plan.workout.name}? It will remain recorded as missed.`))return;meso.progress.skipped.push({week:next.week,slot:next.slot,date:new Date().toISOString(),workoutName:next.plan.workout.name});afterMesoAdvance(meso,next.week);saveData();}
function afterMesoAdvance(meso,oldWeek){const next=nextMesoSlot(meso);if(next&&next.week>oldWeek)meso.progress.needsWeekReview=true;}
function repeatPreviousMesoWeek(meso){const current=currentMesoPosition(meso).week,previous=Math.max(1,current-1);meso.progress.completed=meso.progress.completed.filter(item=>item.week!==previous);meso.progress.skipped=meso.progress.skipped.filter(item=>item.week!==previous);meso.progress.needsWeekReview=false;saveData();}
function onMesocycleWorkoutFinished(session){const ref=session.mesocycle;if(!ref||!data.mesocycles.active||data.mesocycles.active.id!==ref.mesocycleId)return;const meso=data.mesocycles.active;if(!meso.progress.completed.some(x=>x.week===ref.week&&x.slot===ref.slot))meso.progress.completed.push({week:ref.week,slot:ref.slot,date:session.date,sessionDate:session.date,workoutName:session.workoutName});afterMesoAdvance(meso,ref.week);}
function endMesocycle(meso){if(!confirm("End this mesocycle early? Workout history will be kept."))return;meso.status="ended";meso.endedAt=new Date().toISOString();data.mesocycles.completed.unshift(structuredClone(meso));data.mesocycles.active=null;saveData();}
function rescheduleNextMeso(meso){const next=nextMesoSlot(meso);if(!next)return;next.plan.dayIndex=(new Date().getDay()+1)%7;saveData();}
function moveMesoForward(meso){meso.schedule.forEach(slot=>slot.dayIndex=(slot.dayIndex+1)%7);const date=new Date(meso.startDate+"T12:00:00");date.setDate(date.getDate()+1);meso.startDate=date.toISOString().slice(0,10);saveData();}
function returnMesoToDraft(meso){if(!confirm("Return this mesocycle to drafts? Completed workout history will be kept."))return;meso.status="draft";data.mesocycles.drafts.unshift(structuredClone(meso));data.mesocycles.active=null;saveData();}
function completeMesocycle(meso){meso.status="completed";meso.completedAt=new Date().toISOString();meso.summary=buildMesoSummary(meso);data.mesocycles.completed.unshift(structuredClone(meso));data.mesocycles.active=null;saveData();alert(`Mesocycle complete: ${meso.summary.completed} of ${meso.summary.planned} workouts completed.`);}
function buildMesoSummary(meso){const sessions=data.history.filter(h=>h.mesocycle?.mesocycleId===meso.id).slice().reverse();const sets=sessions.reduce((n,h)=>n+h.exercises.reduce((s,e)=>s+e.sets.filter(x=>x.done).length,0),0);const pain=[...new Set(sessions.flatMap(h=>h.exercises.filter(e=>Number(e.jointPain?.rating)>=3).map(e=>`${e.name} (${e.jointPain.rating}/5: ${(e.jointPain.joints||[]).join(", ")})`)))];const soreness=sessions.flatMap(h=>h.soreness?[h.soreness]:[]);const weights={};sessions.forEach(h=>h.exercises.forEach(e=>{weights[e.name]=weights[e.name]||{start:Number(e.weight),end:Number(e.weight)};weights[e.name].end=Number(e.weight);}));const improved=Object.values(weights).filter(w=>w.end>w.start).length;return{planned:mesoTotalWorkouts(meso),completed:meso.progress.completed.length,percentage:Math.round(meso.progress.completed.length/mesoTotalWorkouts(meso)*100),sets,pain,soreness,improved,weights,startDate:meso.startDate,endDate:new Date().toISOString().slice(0,10)};}
function duplicateMesocycle(source){const copy=structuredClone(source);copy.id=crypto.randomUUID();copy.name=`${source.name} Copy`;copy.status="draft";copy.startDate=new Date().toISOString().slice(0,10);copy.progress={week:1,slot:0,completed:[],skipped:[],needsWeekReview:false};copy.schedule.forEach(s=>{s.id=crypto.randomUUID();s.workout.id=crypto.randomUUID();s.workout.exercises=s.workout.exercises.map(e=>{const prior=latestExerciseResult(e.id);return{...e,id:crypto.randomUUID(),startWeight:prior?recommendationFor(e).weight:e.startWeight};});});data.mesocycles.drafts.unshift(copy);saveData();openMesocycleBuilder(copy);}

function renderMesocycleToday(){
  ensureMesocycleData();
  const meso=data.mesocycles.active,btn=document.querySelector("#startWorkoutButton"),previewBtn=document.querySelector("#previewTodayWorkoutButton"),paused=savedWorkoutInProgress(),hero=document.querySelector("#homeView .hero-card");
  if(paused){const completed=paused.exercises.reduce((sum,exercise)=>sum+exercise.sets.filter(set=>set.done).length,0),total=paused.exercises.reduce((sum,exercise)=>sum+exercise.sets.length,0);hero.querySelector(".eyebrow").textContent="WORKOUT IN PROGRESS";document.querySelector("#todayWorkoutName").textContent=paused.workoutName;document.querySelector("#todayWorkoutSummary").textContent=`${completed} of ${total} working sets completed`;btn.textContent="Resume workout";btn.onclick=resumeSavedWorkout;previewBtn.classList.add("hidden");return;}
  if(!meso){btn.onclick=()=>{if(data.selectedWorkoutId)startWorkout(data.selectedWorkoutId);else document.querySelector('[data-view="builderView"]').click();};return;}
  const next=nextMesoSlot(meso);
  if(!next){hero.querySelector(".eyebrow").textContent="MESOCYCLE COMPLETE";document.querySelector("#todayWorkoutName").textContent=meso.name;document.querySelector("#todayWorkoutSummary").textContent="Open Programs to review and complete this mesocycle.";btn.textContent="Open Programs";btn.onclick=()=>document.querySelector('[data-view="programsView"]').click();previewBtn.classList.add("hidden");return;}
  hero.querySelector(".eyebrow").textContent=`${meso.name.toUpperCase()} • WEEK ${next.week}`;
  if(meso.progress.needsWeekReview){document.querySelector("#todayWorkoutName").textContent=`Week ${next.week} review`;document.querySelector("#todayWorkoutSummary").textContent="Approve the weekly review before starting this week's workouts.";btn.textContent="Open weekly review";btn.onclick=()=>document.querySelector('[data-view="programsView"]').click();previewBtn.classList.add("hidden");return;}
  const today=new Date().getDay(),todaySlot=meso.schedule.findIndex(plan=>plan.dayIndex===today);
  if(todaySlot<0){document.querySelector("#todayWorkoutName").textContent="Rest Day";document.querySelector("#todayWorkoutSummary").textContent=`No mesocycle workout is scheduled today. Next unresolved workout: ${next.plan.workout.name}.`;btn.textContent="Open active mesocycle";btn.onclick=()=>document.querySelector('[data-view="programsView"]').click();previewBtn.classList.add("hidden");return;}
  const plan=meso.schedule[todaySlot],completed=meso.progress.completed.some(item=>item.week===next.week&&item.slot===todaySlot),skipped=meso.progress.skipped.some(item=>item.week===next.week&&item.slot===todaySlot),resolved=completed||skipped;
  document.querySelector("#todayWorkoutName").textContent=plan.workout.name;
  document.querySelector("#todayWorkoutSummary").textContent=resolved?(completed?"Today's active-mesocycle workout is complete.":"Today's active-mesocycle workout was skipped."):`${plan.workout.exercises.length} exercises • ${plan.workout.notes||"Today's active-mesocycle workout"}`;
  btn.textContent=resolved?"Open active mesocycle":"Start today's workout";btn.onclick=resolved?()=>document.querySelector('[data-view="programsView"]').click():()=>startScheduledMesoWorkout(meso,next.week,todaySlot);
  previewBtn.classList.remove("hidden");previewBtn.onclick=event=>previewScheduledMesoWorkout(meso,next.week,todaySlot,event.currentTarget);
}

function activeMesocycleMarkup(meso) {
  return activeMesocycleMarkupBase(meso)
    .replace("Start next workout", "Continue mesocycle")
    .replace("View full", "View schedule");
}

function renderMesoCollection(selector,items,type){
  const el=document.querySelector(selector);
  if(!el)return;
  el.innerHTML=items.length?"":`<div class="panel"><p>No ${type} mesocycles.</p></div>`;
  items.forEach(m=>{
    const card=document.createElement("div");card.className="mesocycle-card";
    const summary=m.summary?`<p>${m.summary.completed}/${m.summary.planned} workouts | ${m.summary.percentage}% | ${m.summary.sets} sets | ${m.summary.improved} exercises improved${m.summary.pain.length?` | Pain flags: ${m.summary.pain.map(escapeHtml).join(", ")}`:""}</p>`:"";
    card.innerHTML=`<h3>${escapeHtml(m.name)}</h3><p>${m.totalWeeks} weeks | ${m.daysPerWeek} days/week</p>${summary}<div class="card-actions workout-card-actions horizontal-scroll-row"><button class="secondary-button preview">Preview</button><button class="secondary-button open">${type==="draft"?"Continue Editing":"View"}</button><button class="secondary-button duplicate">Duplicate</button>${type==="draft"?'<button class="primary-button start">Start Mesocycle</button><button class="danger-button delete">Delete</button>':""}</div>`;
    card.querySelector(".preview").onclick=()=>openMesocyclePreview(m);
    card.querySelector(".open").onclick=()=>openMesocycleBuilder(m);
    card.querySelector(".duplicate").onclick=()=>duplicateMesocycle(m);
    card.querySelector(".start")?.addEventListener("click",()=>activateMesocycle(m));
    card.querySelector(".delete")?.addEventListener("click",()=>deleteMesocycleDraft(m));
    el.appendChild(card);
  });
}

function openMesocyclePreview(meso){
  mesoBuilder=structuredClone(meso);mesoStep=4;
  document.querySelector("#mesocycleDialogTitle").textContent="Preview mesocycle";
  renderMesoBuilder();document.querySelector("#mesocycleDialog").showModal();
}

function deleteMesocycleDraft(meso){
  if(!confirm(`Delete draft ${meso.name}? Workout history and other mesocycles will remain.`))return;
  data.mesocycles.drafts=data.mesocycles.drafts.filter(item=>item.id!==meso.id);saveData();
}

document.querySelector("#newMesocycleButton").onclick=()=>{const choice=document.querySelector("#buildChoiceTitle");choice.tabIndex=-1;choice.scrollIntoView({behavior:"smooth",block:"center"});choice.focus({preventScroll:true});};
document.querySelector("#closeMesocycleButton").onclick=()=>{if(confirm("Close the builder? Save as a draft first if you want to keep these changes."))document.querySelector("#mesocycleDialog").close();};
ensureMesocycleData();
renderAll();
restoreNavigationState();
