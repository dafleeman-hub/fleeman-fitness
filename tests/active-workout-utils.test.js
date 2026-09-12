"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  rankReplacementExercises,
  addWorkingSet,
  removeLastWorkingSet,
  applyExerciseSwap,
  replaceMesocycleExercise,
  moveExercise
} = require("../active-workout-utils.js");

let id = 0;
const makeId = () => `test-${++id}`;
const currentExercise = () => ({
  exerciseId:"bench-session",libraryExerciseId:"barbell-bench",name:"Barbell Bench Press",primaryMuscle:"Chest",
  movementPattern:"Horizontal Chest Press",substitutionFamily:"Horizontal Chest Press",exerciseType:"Compound",equipment:["Barbell","Bench"],
  weightEntryType:"Total Weight",weight:225,targetRir:2,sessionPrescription:{minReps:5,maxReps:8,targetRir:2,rest:120},
  sets:[1,2,3].map(number=>({id:`bench-${number}`,weight:225,reps:8,done:false})),expanded:true,skipped:false,
  feedbackAnswered:false,jointPain:{rating:null,joints:[]},jointPainAnswered:false
});
const machinePress = { id:"machine-session",libraryExerciseId:"machine-press",name:"Machine Chest Press",primaryMuscle:"Chest",secondaryMuscles:["Triceps"],movementPattern:"Horizontal Chest Press",substitutionFamily:"Horizontal Chest Press",exerciseType:"Compound",equipment:["Selectorized Machine"],weightEntryType:"Machine Stack",sets:3,minReps:8,maxReps:12,targetRir:3,rest:90 };

{
  const candidates = [
    {id:"curl",name:"Curl",primaryMuscle:"Biceps",movementPattern:"Biceps Curl",substitutionFamily:"Curl",exerciseType:"Isolation",equipment:["Dumbbells"]},
    {id:"hack",name:"Hack Squat",primaryMuscle:"Quads",movementPattern:"Squat Pattern",substitutionFamily:"Squat",exerciseType:"Compound",equipment:["Hack Squat"]},
    {id:"front",name:"Front Squat",primaryMuscle:"Quads",movementPattern:"Squat Pattern",substitutionFamily:"Squat",exerciseType:"Compound",equipment:["Barbell"]}
  ];
  const ranked = rankReplacementExercises({libraryExerciseId:"back-squat",name:"Back Squat",primaryMuscle:"Quads",movementPattern:"Squat Pattern",substitutionFamily:"Squat",exerciseType:"Compound",equipment:["Barbell"]},candidates);
  assert.deepEqual(ranked.map(item=>item.id),["front","hack","curl"],"metadata ranking prioritizes same family, pattern, muscle, role, and equipment");
}

{
  const exercise=currentExercise();
  const before=exercise.sets.length;
  const added=addWorkingSet(exercise,exercise.sessionPrescription,makeId);
  assert.equal(exercise.sets.length,before+1,"Add Set adds exactly one set");
  assert.deepEqual([added.weight,added.reps,added.done,added.addedManually],[225,8,false,true],"Add Set inherits usable values and stays incomplete");
  exercise.sets.at(-1).done=true;
  assert.equal(removeLastWorkingSet(exercise).reason,"completed","completed last set requires confirmation");
  assert.equal(removeLastWorkingSet(exercise,true).removed,true,"confirmed completed set can be removed");
  exercise.sets=[exercise.sets[0]];
  assert.equal(removeLastWorkingSet(exercise,true).reason,"minimum","one sensible minimum set remains");
}

{
  const session={currentExerciseIndex:0,restTimer:{exerciseName:"Barbell Bench Press",endsAt:123456},exercises:[currentExercise()]};
  const result=applyExerciseSwap(session,0,machinePress,{weight:70,note:"Exact Machine Chest Press history"},"today",{makeId,date:"2026-08-18T12:00:00.000Z"});
  assert.equal(result.inserted,false,"an exercise without completed sets is replaced in place");
  assert.equal(session.exercises[0].name,"Machine Chest Press");
  assert.equal(session.exercises[0].weight,70,"replacement uses its own starting-weight recommendation");
  assert.equal(session.exercises[0].sets.length,3,"prescribed set count transfers");
  assert.deepEqual([session.exercises[0].sessionPrescription.minReps,session.exercises[0].sessionPrescription.maxReps,session.exercises[0].targetRir,session.exercises[0].sessionPrescription.rest],[5,8,2,120],"reps, RIR, and rest transfer from current prescription");
  assert.equal(session.exercises[0].substitution.scope,"today","Today Only is recorded without changing future plans");
  assert.deepEqual(session.restTimer,{exerciseName:"Barbell Bench Press",endsAt:123456},"an existing rest timer remains untouched");
  assert.equal(session.exercises[0].skipped,false,"Swap remains separate from Skip Exercise");
  const recovered=JSON.parse(JSON.stringify(session));
  assert.equal(recovered.exercises[0].substitution.from,"Barbell Bench Press","replacement survives active-workout recovery serialization");
}

{
  const original=currentExercise();
  original.sets[0].done=true;original.sets[1].done=true;
  const session={currentExerciseIndex:0,exercises:[original]};
  const result=applyExerciseSwap(session,0,machinePress,{weight:65,note:"Replacement history"},"today",{makeId,date:"2026-08-18T12:00:00.000Z"});
  assert.equal(result.inserted,true);
  assert.equal(session.exercises.length,2,"completed original work and replacement are separate exercise records");
  assert.equal(session.exercises[0].name,"Barbell Bench Press");
  assert.equal(session.exercises[0].sets.length,2);
  assert.ok(session.exercises[0].sets.every(set=>set.done),"completed original sets remain complete under original name");
  assert.equal(session.exercises[1].name,"Machine Chest Press");
  assert.equal(session.exercises[1].sets.length,1,"replacement begins with remaining work only");
  assert.equal(session.currentExerciseIndex,1);
}

{
  const bodyweight={...machinePress,id:"pushup-session",libraryExerciseId:"push-up",name:"Push-Up",weightEntryType:"Bodyweight",sets:3};
  const session={currentExerciseIndex:0,exercises:[currentExercise()]};
  applyExerciseSwap(session,0,bodyweight,{weight:0,note:"Bodyweight replacement"},"today",{makeId});
  assert.equal(session.exercises[0].weightEntryType,"Bodyweight");
  assert.equal(session.exercises[0].weight,0,"bodyweight replacement does not inherit barbell load");
}

{
  const mesocycle={schedule:[{workout:{exercises:[{id:"bench-session",libraryExerciseId:"barbell-bench",name:"Barbell Bench Press"},{id:"row"}]}},{workout:{exercises:[{id:"future-bench",libraryExerciseId:"barbell-bench",name:"Barbell Bench Press"}]}}]};
  const count=replaceMesocycleExercise(mesocycle,{exerciseId:"bench-session",libraryExerciseId:"barbell-bench"},machinePress);
  assert.equal(count,2,"Rest of Mesocycle updates matching future prescriptions");
  assert.equal(mesocycle.schedule[0].workout.exercises[1].id,"row","unrelated exercises remain unchanged");
  assert.equal(mesocycle.schedule[1].workout.exercises[0].name,"Machine Chest Press");
}

{
  const session={currentExerciseIndex:1,exercises:[{name:"A"},{name:"B"},{name:"C"}]};
  assert.equal(moveExercise(session,1,-1),true);
  assert.deepEqual(session.exercises.map(item=>item.name),["B","A","C"],"exercise reordering still works");
  assert.equal(moveExercise(session,0,-1),false,"exercise cannot move beyond list boundary");
}

{
  const source=fs.readFileSync(path.join(__dirname,"..","live-workout.js"),"utf8");
  assert.match(source,/EXERCISE OPTIONS/,"renamed options header is present");
  assert.match(source,/Tap to manage this exercise/,"options supporting text is present");
  assert.match(source,/action-swap-button[^>]*[\s\S]*Swap Exercise/,"Swap Exercise is a real menu button");
  assert.match(source,/setList\.insertAdjacentHTML\("afterend"[\s\S]*action-add-set/,"Add Set is rendered after the set list");
  assert.match(source,/live-sets-heading[\s\S]*<h4>SETS<\/h4>/,"the editable set list has a clear Sets heading");
  assert.match(source,/summary aria-expanded="false" aria-controls=/,"Exercise Options exposes explicit expanded state and panel relationship");
  assert.match(source,/addEventListener\("toggle"[\s\S]*aria-expanded/,"Exercise Options keeps aria-expanded synchronized");
  assert.match(source,/actionSummary\.addEventListener\("keydown"[\s\S]*event\.key !== "Enter"[\s\S]*actionMenu\.open=!actionMenu\.open/,"Exercise Options supports explicit keyboard toggling");
  const menuMarkup=source.match(/actionMenu\.innerHTML = `([\s\S]*?)`;/)?.[1] || "";
  assert.doesNotMatch(menuMarkup,/action-add-set|action-remove-set/,"set controls are not inside Exercise Options");
  assert.doesNotMatch(menuMarkup,/<select class="action-swap"/,"replacement selector is not permanently displayed");
  assert.doesNotMatch(source,/actionMenu\.setAttribute\("open"|actionMenu\.open\s*=\s*true\s*;/,"details menu has no default open state");
}

console.log("PASS active workout UI/data: 15 requested behaviors");
