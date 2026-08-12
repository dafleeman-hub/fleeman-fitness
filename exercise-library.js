const EXERCISE_LIBRARY_VERSION = 1;

const EXERCISE_CATALOG = {
  Chest: ["Barbell Bench Press","Dumbbell Bench Press","Smith Machine Bench Press","Selectorized Chest Press","Plate-Loaded Chest Press","Incline Barbell Press","Incline Dumbbell Press","Incline Smith Machine Press","Incline Machine Chest Press","Plate-Loaded Incline Chest Press","Decline Barbell Press","Decline Dumbbell Press","Pec Deck","Cable Fly","Low-to-High Cable Fly","High-to-Low Cable Fly"],
  Back: ["Pull-Up","Neutral-Grip Pull-Up","Chin-Up","Assisted Pull-Up","Wide-Grip Lat Pulldown","Neutral-Grip Lat Pulldown","Underhand Lat Pulldown","Single-Arm Lat Pulldown","Plate-Loaded Pulldown","Barbell Row","Pendlay Row","Dumbbell Row","Chest-Supported Dumbbell Row","T-Bar Row","Chest-Supported T-Bar Row","Seated Cable Row","Wide-Grip Cable Row","Chest-Supported Row Machine","Plate-Loaded Row","Single-Arm Machine Row","Cable Pullover","Machine Pullover","Straight-Arm Cable Pulldown","High Row Machine"],
  Shoulders: ["Seated Barbell Overhead Press","Standing Barbell Overhead Press","Seated Dumbbell Shoulder Press","Standing Dumbbell Shoulder Press","Machine Shoulder Press","Smith Machine Shoulder Press","Arnold Press","Dumbbell Lateral Raise","Cable Lateral Raise","Machine Lateral Raise","Leaning Cable Lateral Raise","Dumbbell Front Raise","Cable Front Raise","Reverse Pec Deck","Rear-Delt Cable Fly","Bent-Over Dumbbell Rear-Delt Raise","Chest-Supported Rear-Delt Raise","Face Pull","Rear-Delt Row","Single-Arm Machine Shoulder Press"],
  Biceps: ["Barbell Curl","EZ-Bar Curl","Dumbbell Curl","Alternating Dumbbell Curl","Incline Dumbbell Curl","Preacher Curl","Machine Preacher Curl","Cable Curl","Single-Arm Cable Curl","Bayesian Cable Curl","Hammer Curl","Rope Hammer Curl","Reverse Curl"],
  Triceps: ["Rope Pushdown","Straight-Bar Pushdown","V-Bar Pushdown","Single-Arm Cable Pushdown","Overhead Rope Extension","Single-Arm Overhead Cable Extension","Dumbbell Overhead Triceps Extension","EZ-Bar Skull Crusher","Dumbbell Skull Crusher","Machine Triceps Extension","Close-Grip Bench Press","Dip","Assisted Dip"],
  Quads: ["Back Squat","Front Squat","Smith Machine Squat","Hack Squat","Pendulum Squat","Leg Press","Single-Leg Press","Bulgarian Split Squat","Dumbbell Split Squat","Smith Machine Split Squat","Walking Lunge","Reverse Lunge","Leg Extension","Single-Leg Extension","Sissy Squat Machine","Belt Squat Machine"],
  Hamstrings: ["Romanian Deadlift","Dumbbell Romanian Deadlift","Smith Machine Romanian Deadlift","Stiff-Leg Deadlift","Seated Leg Curl","Lying Leg Curl","Standing Single-Leg Curl","Single-Leg Seated Curl","Nordic Curl Machine","Good Morning","Back Extension with Hamstring Emphasis"],
  Glutes: ["Barbell Hip Thrust","Smith Machine Hip Thrust","Glute Drive Machine","Dumbbell Hip Thrust","Cable Pull-Through","Cable Glute Kickback","Glute Kickback Machine","Reverse Lunge with Glute Emphasis","Bulgarian Split Squat with Glute Emphasis","High-Foot Leg Press","Back Extension with Glute Emphasis"],
  Calves: ["Standing Calf Raise Machine","Seated Calf Raise Machine","Leg Press Calf Raise","Smith Machine Standing Calf Raise","Single-Leg Calf Raise","Donkey Calf Raise Machine","Plate-Loaded Calf Raise","Standing Dumbbell Calf Raise"],
  Core: ["Cable Crunch","Machine Crunch","Hanging Knee Raise","Hanging Leg Raise","Captain's Chair Knee Raise","Decline Sit-Up","Ab Wheel Rollout","Cable Wood Chop","Pallof Press","Weighted Plank","Roman Chair Knee Raise","Oblique Crunch Machine"],
  Traps: ["Barbell Shrug","Dumbbell Shrug","Smith Machine Shrug","Plate-Loaded Shrug Machine","Cable Shrug","Trap Raise Machine"],
  Forearms: ["Wrist Curl","Reverse Wrist Curl","Cable Wrist Curl","Cable Reverse Wrist Curl","Behind-the-Back Wrist Curl","Dumbbell Wrist Rotation"],
  Adductors: ["Hip Adduction Machine","Cable Hip Adduction","Standing Hip Adduction Machine"],
  Abductors: ["Hip Abduction Machine","Cable Hip Abduction","Standing Hip Abduction Machine"],
  "Lower Back": ["Back Extension","45-Degree Back Extension","Reverse Hyperextension Machine","Selectorized Back Extension","Good Morning with Lower-Back Emphasis"]
};

const SECONDARY_MUSCLES = {
  Chest:["Triceps","Front Delts"], Back:["Biceps","Rear Delts"], Shoulders:["Triceps","Traps"], Biceps:["Forearms"], Triceps:["Front Delts"],
  Quads:["Glutes"], Hamstrings:["Glutes","Lower Back"], Glutes:["Hamstrings","Quads"], Calves:[], Core:[], Traps:["Shoulders"], Forearms:["Biceps"],
  Adductors:["Glutes"], Abductors:["Glutes"], "Lower Back":["Glutes","Hamstrings"]
};

function exerciseSlug(name) {
  return name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function exerciseEquipment(name) {
  const rules = [[/dumbbell/i,["Dumbbells"]],[/barbell|good morning|pendlay/i,["Barbell"]],[/smith/i,["Smith Machine"]],[/cable|pushdown|face pull|pallof/i,["Cable Station"]],[/assisted/i,["Assisted Bodyweight Machine"]],[/pull-up|chin-up|hanging|dip$/i,["Bodyweight Station"]],[/plate-loaded/i,["Plate-Loaded Machine"]],[/selectorized|machine|pec deck|hack squat|pendulum|leg press|leg extension|leg curl|glute drive|captain/i,["Machine"]],[/bench press|squat|romanian deadlift|stiff-leg/i,["Barbell"]]];
  return (rules.find(([pattern]) => pattern.test(name)) || [null,["Commercial Gym Equipment"]])[1];
}

function exerciseFamily(name, category) {
  if (/incline.*press/i.test(name)) return "Incline Chest Press";
  if (/bench press|chest press/i.test(name)) return "Flat Chest Press";
  if (/fly|pec deck/i.test(name)) return "Chest Fly";
  if (/pull-up|chin-up|pulldown/i.test(name)) return "Vertical Pull";
  if (/row/i.test(name)) return "Horizontal Row";
  if (/squat|hack|pendulum/i.test(name)) return "Squat Pattern";
  if (/leg press|leg extension/i.test(name)) return "Quad Machine";
  if (/romanian|stiff-leg|good morning|back extension/i.test(name)) return "Hip Hinge";
  if (/pushdown/i.test(name)) return "Triceps Pressdown";
  if (/overhead.*extension/i.test(name)) return "Overhead Triceps Extension";
  return `${category} ${/curl|raise|extension|fly|crunch|kickback|shrug|adduction|abduction/i.test(name) ? "Isolation" : "Compound"}`;
}

function buildExerciseDefinition(name, primaryMuscle) {
  const equipment = exerciseEquipment(name);
  const isolation = /curl|raise|extension|fly|pec deck|pushdown|pullover|crunch|kickback|shrug|adduction|abduction|wood chop|pallof|plank|calf/i.test(name);
  const bodyweight = /pull-up|chin-up|dip$|hanging|captain|ab wheel|plank|sit-up/i.test(name);
  const assisted = /assisted/i.test(name);
  const dumbbell = /dumbbell/i.test(name);
  const plateLoaded = /plate-loaded/i.test(name);
  const heavy = !isolation && /barbell|squat|deadlift|good morning|pendlay/i.test(name);
  const defaults = isolation
    ? {sets:3,minReps:10,maxReps:/calf|core|crunch|raise|fly/i.test(name)?20:15,targetRIR:2,restSeconds:75,weightIncrement:5}
    : heavy ? {sets:3,minReps:6,maxReps:10,targetRIR:3,restSeconds:150,weightIncrement:5}
    : {sets:3,minReps:8,maxReps:12,targetRIR:3,restSeconds:120,weightIncrement:5};
  defaults.weightEntryType = assisted ? "Assisted Bodyweight" : bodyweight ? "Bodyweight Plus Added Weight" : dumbbell ? "Per Dumbbell" : plateLoaded ? "Plate-Loaded Total" : equipment.some(item=>/Machine/.test(item)) || equipment.includes("Cable Station") ? "Machine Stack" : "Total Weight";
  const tags = [];
  if (/incline|low-to-high/i.test(name)) tags.push("Upper Chest");
  if (/decline|high-to-low/i.test(name)) tags.push("Lower Chest");
  if (/rear-delt|reverse pec|face pull/i.test(name)) tags.push("Rear Delts");
  if (/lateral/i.test(name)) tags.push("Side Delts");
  if (/pulldown|pull-up|pullover/i.test(name)) tags.push("Lats");
  return {
    id: exerciseSlug(name), name, description: `A commercial-gym ${exerciseFamily(name,primaryMuscle).toLowerCase()} exercise emphasizing the ${primaryMuscle.toLowerCase()}.`,
    primaryMuscle, secondaryMuscles: SECONDARY_MUSCLES[primaryMuscle] || [], muscleTags: tags.length ? tags : [primaryMuscle], equipment,
    exerciseType: isolation ? "Isolation" : "Compound", movementPattern: exerciseFamily(name,primaryMuscle),
    laterality: /single-arm|single-leg|alternating/i.test(name) ? "Unilateral" : "Bilateral", substitutionFamily: exerciseFamily(name,primaryMuscle), defaults,
    setup:[`Adjust the ${equipment[0].toLowerCase()} to a comfortable starting position.`,`Set up so the target joint can move through a controlled range.`],
    cues:["Use a controlled range of motion.","Keep the target muscles loaded throughout the set.","Stop the set if technique breaks down."], caution:"", sourceType:"premade",
    searchKeywords:[name.toLowerCase(),primaryMuscle.toLowerCase(),exerciseFamily(name,primaryMuscle).toLowerCase(),...equipment.map(item=>item.toLowerCase()),...tags.map(item=>item.toLowerCase())]
  };
}

const COMMERCIAL_GYM_EXERCISES = Object.entries(EXERCISE_CATALOG).flatMap(([category,names]) => names.map(name => buildExerciseDefinition(name,category)));

function exerciseDefinitionToPrescription(definition) {
  return {
    id: crypto.randomUUID(), libraryExerciseId: definition.id, name: definition.name, description: definition.description,
    muscle: definition.primaryMuscle, primaryMuscle: definition.primaryMuscle, secondaryMuscles: [...definition.secondaryMuscles], muscleTags: [...definition.muscleTags],
    equipment: [...definition.equipment], exerciseType: definition.exerciseType, movementPattern: definition.movementPattern, laterality: definition.laterality,
    substitutionFamily: definition.substitutionFamily, weightEntryType: definition.defaults.weightEntryType, sourceType: definition.sourceType,
    progressionMode: definition.progressionMode || definition.defaults.progressionMode || "manual", repUnit: definition.repUnit || definition.defaults.repUnit || "reps",
    sets: definition.defaults.sets, minReps: definition.defaults.minReps, maxReps: definition.defaults.maxReps, targetRir: definition.defaults.targetRIR,
    rest: definition.defaults.restSeconds, increment: definition.defaults.weightIncrement, startWeight: 0, setup: [...definition.setup], cues: [...definition.cues]
  };
}
