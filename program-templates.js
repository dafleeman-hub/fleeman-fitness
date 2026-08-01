const PROGRAM_TEMPLATE_VERSION = 1;

function programWorkout(name, focus, exercises) { return { name, focus, exercises }; }
function programExercise(id, sets=3) { return { exerciseId:id, sets }; }

const PREMADE_PROGRAM_TEMPLATES = [
  {
    id:"balanced-hypertrophy-4-day",name:"Balanced Hypertrophy",version:1,daysPerWeek:4,focus:"Balanced full-body development",duration:"45–65 minutes",
    description:"Four balanced training days covering every major muscle group with conservative starting volume.",
    schedule:[
      {dayIndex:1,workout:programWorkout("Upper A","Chest and back",[programExercise("barbell-bench-press"),programExercise("wide-grip-lat-pulldown"),programExercise("incline-dumbbell-press"),programExercise("seated-cable-row"),programExercise("dumbbell-lateral-raise",2),programExercise("rope-pushdown",2)])},
      {dayIndex:2,workout:programWorkout("Lower A","Quads and hamstrings",[programExercise("back-squat"),programExercise("romanian-deadlift"),programExercise("leg-extension",2),programExercise("seated-leg-curl",2),programExercise("standing-calf-raise-machine",3),programExercise("cable-crunch",2)])},
      {dayIndex:4,workout:programWorkout("Upper B","Back, shoulders, and arms",[programExercise("dumbbell-bench-press"),programExercise("chest-supported-row-machine"),programExercise("machine-shoulder-press"),programExercise("neutral-grip-lat-pulldown"),programExercise("dumbbell-curl",2),programExercise("single-arm-cable-pushdown",2)])},
      {dayIndex:5,workout:programWorkout("Lower B","Glutes and quads",[programExercise("leg-press"),programExercise("dumbbell-romanian-deadlift"),programExercise("bulgarian-split-squat",2),programExercise("lying-leg-curl",2),programExercise("seated-calf-raise-machine",3),programExercise("pallof-press",2)])}
    ]
  },
  {
    id:"upper-body-focus-4-day",name:"Upper Body Focus",version:1,daysPerWeek:4,focus:"Upper-body emphasis",duration:"45–65 minutes",
    description:"Additional chest, back, shoulder, and arm volume while maintaining meaningful lower-body training.",
    schedule:[
      {dayIndex:1,workout:programWorkout("Upper Push Focus","Chest, shoulders, and triceps",[programExercise("barbell-bench-press"),programExercise("incline-dumbbell-press"),programExercise("machine-shoulder-press"),programExercise("cable-lateral-raise",3),programExercise("rope-pushdown",3)])},
      {dayIndex:2,workout:programWorkout("Lower Maintenance","Lower body",[programExercise("leg-press"),programExercise("romanian-deadlift"),programExercise("leg-extension",2),programExercise("seated-leg-curl",2),programExercise("standing-calf-raise-machine",2)])},
      {dayIndex:4,workout:programWorkout("Upper Pull Focus","Back and biceps",[programExercise("wide-grip-lat-pulldown"),programExercise("chest-supported-row-machine"),programExercise("single-arm-lat-pulldown",2),programExercise("rear-delt-cable-fly",3),programExercise("incline-dumbbell-curl",3)])},
      {dayIndex:5,workout:programWorkout("Upper Mixed","Chest, back, shoulders, and arms",[programExercise("selectorized-chest-press"),programExercise("seated-cable-row"),programExercise("seated-dumbbell-shoulder-press"),programExercise("cable-fly",2),programExercise("hammer-curl",2),programExercise("overhead-rope-extension",2)])}
    ]
  },
  {
    id:"lower-body-focus-4-day",name:"Lower Body Focus",version:1,daysPerWeek:4,focus:"Lower-body emphasis",duration:"50–70 minutes",
    description:"Extra quad, hamstring, glute, and calf work while maintaining the major upper-body muscle groups.",
    schedule:[
      {dayIndex:1,workout:programWorkout("Lower Quad Focus","Quads",[programExercise("back-squat"),programExercise("hack-squat"),programExercise("leg-extension",3),programExercise("walking-lunge",2),programExercise("standing-calf-raise-machine",3)])},
      {dayIndex:2,workout:programWorkout("Upper Maintenance","Upper body",[programExercise("dumbbell-bench-press"),programExercise("neutral-grip-lat-pulldown"),programExercise("machine-shoulder-press",2),programExercise("seated-cable-row",2),programExercise("rope-pushdown",2)])},
      {dayIndex:4,workout:programWorkout("Lower Hamstring and Glute Focus","Hamstrings and glutes",[programExercise("romanian-deadlift"),programExercise("barbell-hip-thrust"),programExercise("seated-leg-curl",3),programExercise("cable-glute-kickback",2),programExercise("seated-calf-raise-machine",3)])},
      {dayIndex:5,workout:programWorkout("Lower Mixed","Complete lower body",[programExercise("leg-press"),programExercise("dumbbell-romanian-deadlift"),programExercise("bulgarian-split-squat",3),programExercise("lying-leg-curl",2),programExercise("leg-press-calf-raise",3),programExercise("cable-crunch",2)])}
    ]
  },
  {
    id:"chest-focus-4-day",name:"Chest Focus",version:1,daysPerWeek:4,focus:"Chest emphasis",duration:"45–65 minutes",
    description:"Two direct chest sessions using flat, incline, machine, and fly movements while training every major muscle group.",
    schedule:[
      {dayIndex:1,workout:programWorkout("Chest and Triceps","Chest",[programExercise("barbell-bench-press"),programExercise("incline-dumbbell-press"),programExercise("selectorized-chest-press",2),programExercise("cable-fly",2),programExercise("rope-pushdown",3)])},
      {dayIndex:2,workout:programWorkout("Lower Body","Lower body",[programExercise("back-squat"),programExercise("romanian-deadlift"),programExercise("leg-extension",2),programExercise("seated-leg-curl",2),programExercise("standing-calf-raise-machine",3)])},
      {dayIndex:4,workout:programWorkout("Back and Biceps","Back",[programExercise("wide-grip-lat-pulldown"),programExercise("chest-supported-row-machine"),programExercise("seated-cable-row",2),programExercise("rear-delt-cable-fly",2),programExercise("dumbbell-curl",3)])},
      {dayIndex:5,workout:programWorkout("Upper Body with Chest Focus","Chest and shoulders",[programExercise("incline-machine-chest-press"),programExercise("dumbbell-bench-press"),programExercise("neutral-grip-lat-pulldown"),programExercise("machine-shoulder-press",2),programExercise("low-to-high-cable-fly",2),programExercise("overhead-rope-extension",2)])}
    ]
  },
  {
    id:"back-focus-4-day",name:"Back Focus",version:1,daysPerWeek:4,focus:"Back emphasis",duration:"45–65 minutes",
    description:"Two direct back sessions combining vertical pulls, rows, lat work, and upper-back work while maintaining the rest of the body.",
    schedule:[
      {dayIndex:1,workout:programWorkout("Back and Biceps","Back",[programExercise("wide-grip-lat-pulldown"),programExercise("chest-supported-row-machine"),programExercise("single-arm-lat-pulldown",2),programExercise("seated-cable-row",2),programExercise("incline-dumbbell-curl",3)])},
      {dayIndex:2,workout:programWorkout("Lower Body","Lower body",[programExercise("leg-press"),programExercise("romanian-deadlift"),programExercise("leg-extension",2),programExercise("seated-leg-curl",2),programExercise("standing-calf-raise-machine",3)])},
      {dayIndex:4,workout:programWorkout("Chest and Shoulders","Chest and shoulders",[programExercise("dumbbell-bench-press"),programExercise("incline-machine-chest-press"),programExercise("machine-shoulder-press"),programExercise("cable-lateral-raise",3),programExercise("rope-pushdown",2)])},
      {dayIndex:5,workout:programWorkout("Upper Body with Back Focus","Back and upper body",[programExercise("neutral-grip-lat-pulldown"),programExercise("plate-loaded-row"),programExercise("cable-pullover",2),programExercise("rear-delt-row",3),programExercise("selectorized-chest-press",2),programExercise("hammer-curl",2)])}
    ]
  }
];
