const STARTING_WEIGHT_RULES_VERSION = 1;

const MOVEMENT_BASELINE_CATEGORIES = [
  "Horizontal chest press","Incline chest press","Shoulder press","Vertical pull","Horizontal row","Squat pattern","Leg press or hack squat","Hip hinge","Leg extension","Leg curl","Biceps curl","Triceps pushdown","Calf raise"
];

const EXERCISE_TRANSFER_FACTORS = [
  {sourceFamily:"Flat Chest Press",targetFamily:"Flat Chest Press",ratio:1,confidence:"medium",notes:"Same press family; equipment differences still require confirmation."},
  {sourceFamily:"Incline Chest Press",targetFamily:"Incline Chest Press",ratio:1,confidence:"medium",notes:"Same incline press family."},
  {sourceFamily:"Vertical Pull",targetFamily:"Vertical Pull",ratio:1,confidence:"medium",notes:"Only used when weight-entry types match."},
  {sourceFamily:"Horizontal Row",targetFamily:"Horizontal Row",ratio:1,confidence:"medium",notes:"Only used when weight-entry types match."},
  {sourceFamily:"Squat Pattern",targetFamily:"Squat Pattern",ratio:.85,confidence:"medium",notes:"Conservative cross-variation squat estimate."},
  {sourceFamily:"Hip Hinge",targetFamily:"Hip Hinge",ratio:.85,confidence:"medium",notes:"Conservative cross-variation hinge estimate."},
  {sourceFamily:"Triceps Pressdown",targetFamily:"Triceps Pressdown",ratio:1,confidence:"medium",notes:"Machine stacks vary by gym."},
  {sourceFamily:"Biceps Isolation",targetFamily:"Biceps Isolation",ratio:1,confidence:"medium",notes:"Only used when weight-entry types match."}
];

function estimatedOneRepMax(weight,repetitions,repsRemaining=0){const adjusted=Number(repetitions)+Number(repsRemaining);return Math.max(0,Number(weight)*(1+adjusted/30));}
function workingWeightFromOneRepMax(oneRepMax,minReps,maxReps,targetRir,increment=5){const failureReps=(Number(minReps)+Number(maxReps))/2+Number(targetRir||0);return roundStartingWeight(Number(oneRepMax)/(1+failureReps/30),increment);}
function roundStartingWeight(weight,increment=5){const step=Math.max(.5,Number(increment)||5);return Math.max(0,Math.round(Number(weight)/step)*step);}
function displayWeightValue(weight,units="imperial"){return units==="metric"?Math.round(Number(weight)/2.20462*2)/2:Number(weight);}
function internalWeightValue(weight,units="imperial"){return units==="metric"?Math.round(Number(weight)*2.20462*10)/10:Number(weight);}
function weightUnit(units="imperial"){return units==="metric"?"kg":"lb";}
function weightEntryLabel(entry="Total Weight"){return({"Total Weight":"Total weight","Per Dumbbell":"Weight per dumbbell","Machine Stack":"Machine stack weight","Plate-Loaded Total":"Total loaded weight","Plate-Loaded Per Side":"Weight per side","Bodyweight":"Bodyweight","Bodyweight + Added Weight":"Added weight","Bodyweight Plus Added Weight":"Added weight","Assisted Bodyweight":"Assistance"})[entry]||entry;}

function movementBaselineCategory(exercise){const text=`${exercise.movementPattern||""} ${exercise.substitutionFamily||""} ${exercise.name||""}`.toLowerCase();if(/incline/.test(text))return"Incline chest press";if(/chest press|bench press|flat chest/.test(text))return"Horizontal chest press";if(/shoulder press|overhead press|vertical press/.test(text))return"Shoulder press";if(/vertical pull|pulldown|pull-up|chin-up/.test(text))return"Vertical pull";if(/horizontal row|row/.test(text))return"Horizontal row";if(/leg press|hack squat/.test(text))return"Leg press or hack squat";if(/squat/.test(text))return"Squat pattern";if(/hinge|deadlift|good morning|back extension/.test(text))return"Hip hinge";if(/leg extension/.test(text))return"Leg extension";if(/leg curl/.test(text))return"Leg curl";if(/biceps|curl/.test(text))return"Biceps curl";if(/triceps pressdown|pushdown/.test(text))return"Triceps pushdown";if(/calf/.test(text))return"Calf raise";return"";}

function conservativeProfileEstimate(exercise,profile){
  const bodyWeight=Number(profile?.bodyWeight?.value||0);if(!bodyWeight||!profile?.experienceLevel)return null;
  const entry=exercise.weightEntryType||exercise.defaults?.weightEntryType||"Total Weight";if(entry==="Bodyweight"||entry==="Bodyweight Plus Added Weight")return{weight:0,displayWeight:"Bodyweight"};if(entry==="Assisted Bodyweight")return null;
  const experience={"brand-new":.12,beginner:.18,intermediate:.25,experienced:.3,custom:.22}[profile.experienceLevel]||.12;
  const movement=movementBaselineCategory(exercise);const movementFactor={"Horizontal chest press":1,"Incline chest press":.75,"Shoulder press":.55,"Vertical pull":.7,"Horizontal row":.75,"Squat pattern":1,"Leg press or hack squat":1.3,"Hip hinge":.9,"Leg extension":.35,"Leg curl":.3,"Biceps curl":.12,"Triceps pushdown":.18,"Calf raise":.4}[movement]||.12;
  const equipmentText=(exercise.equipment||[]).join(" ");const backgroundKey=/Barbell/.test(equipmentText)?"barbell":/Dumbbells/.test(equipmentText)?"dumbbell":/Machine|Cable|Smith/.test(equipmentText)?"machines":"";const equipmentExperience=profile.trainingBackground?.[backgroundKey]||"Never";const equipmentFactor={Never:.7,"A little":.82,Comfortable:.95,"Very experienced":1}[equipmentExperience]||.7;
  const coordination=/Barbell|Dumbbells/.test(equipmentText)?.75:1;let weight=bodyWeight*experience*movementFactor*coordination*equipmentFactor;if(entry==="Per Dumbbell")weight/=2;
  if(/Barbell/.test(equipmentText)&&exercise.exerciseType==="Compound")weight=Math.max(45,weight);if(entry==="Per Dumbbell")weight=Math.max(5,weight);if(entry==="Machine Stack")weight=Math.max(10,weight);
  return{weight:roundStartingWeight(weight,exercise.increment||exercise.defaults?.weightIncrement||5),displayWeight:null};
}
