"use strict";

const BODYWEIGHT_LIBRARY_VERSION = 1;

const BODYWEIGHT_EXERCISE_SPECS = [
  ["Push-Up","Chest",["Triceps","Shoulders"],"Horizontal Chest Press","Bodyweight","reps",8,20],
  ["Incline Push-Up","Chest",["Triceps","Shoulders"],"Horizontal Chest Press","Bodyweight","reps",10,25],
  ["Decline Push-Up","Chest",["Triceps","Shoulders"],"Incline Chest Press","Bodyweight","reps",6,15],
  ["Close-Grip Push-Up","Triceps",["Chest","Shoulders"],"Decline / Dip Press","Bodyweight","reps",8,20],
  ["Wide-Grip Push-Up","Chest",["Triceps","Shoulders"],"Horizontal Chest Press","Bodyweight","reps",8,20],
  ["Diamond Push-Up","Triceps",["Chest","Shoulders"],"Decline / Dip Press","Bodyweight","reps",6,15],
  ["Weighted Push-Up","Chest",["Triceps","Shoulders"],"Horizontal Chest Press","Bodyweight + Added Weight","added_load",6,15],
  ["Deficit Push-Up","Chest",["Triceps","Shoulders"],"Horizontal Chest Press","Bodyweight","reps",6,15],
  ["Paused Push-Up","Chest",["Triceps","Shoulders"],"Horizontal Chest Press","Bodyweight","reps",6,15],
  ["Tempo Push-Up","Chest",["Triceps","Shoulders"],"Horizontal Chest Press","Bodyweight","reps",6,15],
  ["Hand-Release Push-Up","Chest",["Triceps","Shoulders"],"Horizontal Chest Press","Bodyweight","reps",8,25],
  ["Pull-Up","Back",["Biceps","Forearms"],"Vertical Pull","Bodyweight","reps",4,12,"Pull-Up Station"],
  ["Chin-Up","Back",["Biceps","Forearms"],"Vertical Pull","Bodyweight","reps",4,12,"Pull-Up Station"],
  ["Neutral-Grip Pull-Up","Back",["Biceps","Forearms"],"Vertical Pull","Bodyweight","reps",4,12,"Pull-Up Station"],
  ["Wide-Grip Pull-Up","Back",["Biceps","Forearms"],"Vertical Pull","Bodyweight","reps",4,12,"Pull-Up Station"],
  ["Assisted Pull-Up","Back",["Biceps","Forearms"],"Vertical Pull","Assisted Bodyweight","assisted_reduction",6,15,"Pull-Up Station"],
  ["Weighted Pull-Up","Back",["Biceps","Forearms"],"Vertical Pull","Bodyweight + Added Weight","added_load",3,10,"Pull-Up Station"],
  ["Inverted Row / Bodyweight Row","Back",["Biceps","Rear Delts"],"Horizontal Row","Bodyweight","reps",8,20,"Smith Machine"],
  ["Parallel Bar Dip","Triceps",["Chest","Shoulders"],"Decline / Dip Press","Bodyweight","reps",5,15,"Dip Station"],
  ["Assisted Dip","Triceps",["Chest","Shoulders"],"Decline / Dip Press","Assisted Bodyweight","assisted_reduction",6,15,"Dip Station"],
  ["Weighted Dip","Triceps",["Chest","Shoulders"],"Decline / Dip Press","Bodyweight + Added Weight","added_load",4,12,"Dip Station"],
  ["Bench Dip","Triceps",["Chest","Shoulders"],"Decline / Dip Press","Bodyweight","reps",8,20,"Bench"],
  ["Bodyweight Squat","Quads",["Glutes","Hamstrings"],"Squat Pattern","Bodyweight","reps",12,30],
  ["Split Squat","Quads",["Glutes","Hamstrings"],"Lunge / Split Squat","Bodyweight","reps",8,20],
  ["Bulgarian Split Squat","Quads",["Glutes","Hamstrings"],"Lunge / Split Squat","Bodyweight","reps",6,15,"Bench"],
  ["Walking Lunge","Quads",["Glutes","Hamstrings"],"Lunge / Split Squat","Bodyweight","reps",10,24],
  ["Reverse Lunge","Quads",["Glutes","Hamstrings"],"Lunge / Split Squat","Bodyweight","reps",8,20],
  ["Forward Lunge","Quads",["Glutes","Hamstrings"],"Lunge / Split Squat","Bodyweight","reps",8,20],
  ["Step-Up","Quads",["Glutes","Hamstrings"],"Lunge / Split Squat","Bodyweight","reps",8,20,"Bench"],
  ["Pistol Squat","Quads",["Glutes","Hamstrings","Core"],"Squat Pattern","Bodyweight","reps",3,10],
  ["Assisted Pistol Squat","Quads",["Glutes","Hamstrings","Core"],"Squat Pattern","Assisted Bodyweight","assisted_reduction",5,12],
  ["Single-Leg Squat","Quads",["Glutes","Hamstrings","Core"],"Squat Pattern","Bodyweight","reps",5,12],
  ["Nordic Hamstring Curl","Hamstrings",["Glutes","Calves"],"Leg Curl","Bodyweight","reps",3,10],
  ["Glute Bridge","Glutes",["Hamstrings","Core"],"Hip Extension","Bodyweight","reps",12,30],
  ["Single-Leg Glute Bridge","Glutes",["Hamstrings","Core"],"Hip Extension","Bodyweight","reps",8,20],
  ["Bodyweight Calf Raise","Calves",[],"Calf Raise","Bodyweight","reps",12,30],
  ["Single-Leg Calf Raise","Calves",[],"Calf Raise","Bodyweight","reps",10,25],
  ["Plank","Core",["Shoulders","Glutes"],"Core","Bodyweight","duration",20,90],
  ["Side Plank","Core",["Shoulders","Glutes"],"Core","Bodyweight","duration",15,60],
  ["Hanging Knee Raise","Core",["Forearms"],"Core","Bodyweight","reps",8,20,"Pull-Up Station"],
  ["Hanging Leg Raise","Core",["Forearms"],"Core","Bodyweight","reps",6,15,"Pull-Up Station"],
  ["Reverse Crunch","Core",[],"Core","Bodyweight","reps",10,25],
  ["Dead Bug","Core",[],"Core","Bodyweight","reps",8,20],
  ["Bird Dog","Core",["Glutes","Lower Back"],"Core","Bodyweight","reps",8,20],
  ["Hollow Hold","Core",[],"Core","Bodyweight","duration",15,60],
  ["Mountain Climber","Core",["Shoulders","Quads"],"Core","Bodyweight","duration",20,60]
];

function bodyweightExerciseDefinition(spec) {
  const [name, primaryMuscle, secondaryMuscles, movementPattern, loadType, progressionMode, minReps, maxReps, station] = spec;
  const duration = progressionMode === "duration";
  return {
    id: `bodyweight-${exerciseSlug(name)}`,
    name,
    description: `${name} is a bodyweight ${movementPattern.toLowerCase()} movement emphasizing the ${primaryMuscle.toLowerCase()}.`,
    primaryMuscle,
    secondaryMuscles,
    muscleTags: [primaryMuscle, ...secondaryMuscles],
    equipment: [...new Set(["Bodyweight", ...(station ? [station] : [])])],
    exerciseType: /curl|raise|bridge|plank|hold|crunch|calf|bird dog|dead bug/i.test(name) ? "Isolation" : "Compound",
    movementPattern,
    laterality: /single-leg|side plank|split squat|lunge|step-up|pistol/i.test(name) ? "Unilateral" : "Bilateral",
    substitutionFamily: movementPattern,
    progressionMode,
    repUnit: duration ? "seconds" : "reps",
    defaults: {
      sets: 3,
      minReps,
      maxReps,
      targetRIR: duration ? 2 : 3,
      restSeconds: /pull-up|dip|pistol|nordic/i.test(name) ? 120 : duration ? 60 : 75,
      weightIncrement: loadType === "Bodyweight + Added Weight" || loadType === "Assisted Bodyweight" ? 5 : 0,
      weightEntryType: loadType,
      progressionMode,
      repUnit: duration ? "seconds" : "reps"
    },
    setup: [
      station ? `Set up at the ${station.toLowerCase()} with a stable grip and clear working space.` : "Use a stable surface and enough clear space for the full movement.",
      "Choose a range of motion you can control without joint pain."
    ],
    cues: ["Keep the working muscles loaded through a controlled range.", "Stop the set before technique breaks down."],
    caution: "Use assistance or an easier variation when you cannot maintain controlled technique.",
    sourceType: "premade",
    searchKeywords: [name.toLowerCase(), "bodyweight", primaryMuscle.toLowerCase(), movementPattern.toLowerCase(), progressionMode.replace("_", " ")]
  };
}

BODYWEIGHT_EXERCISE_SPECS.forEach(spec => {
  const definition = bodyweightExerciseDefinition(spec);
  const existingIndex = COMMERCIAL_GYM_EXERCISES.findIndex(item => normalizedBodyweightName(item.name) === normalizedBodyweightName(definition.name));
  if (existingIndex >= 0) {
    const existingId = COMMERCIAL_GYM_EXERCISES[existingIndex].id;
    COMMERCIAL_GYM_EXERCISES[existingIndex] = { ...COMMERCIAL_GYM_EXERCISES[existingIndex], ...definition, id: existingId };
  } else COMMERCIAL_GYM_EXERCISES.push(definition);
});

function normalizedBodyweightName(name = "") {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "");
}
