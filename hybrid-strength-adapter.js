(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FleemanHybridStrengthAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function uid(prefix = "hybrid-strength") {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function snapshotWorkout(workout, sourceType = "saved-workout", sourceId = workout?.id) {
    if (!workout || !Array.isArray(workout.exercises) || !workout.exercises.length) return null;
    const copy = clone(workout);
    copy.id = uid();
    copy.hybridSource = { type: sourceType, id: sourceId || null, copiedAt: new Date().toISOString() };
    copy.exercises = copy.exercises.map(exercise => ({ ...exercise, id: exercise.id || uid("exercise") }));
    return copy;
  }

  function snapshotSavedWorkouts(workouts = [], ids = []) {
    const byId = new Map(workouts.map(workout => [workout.id, workout]));
    return ids.map(id => snapshotWorkout(byId.get(id), "saved-workout", id)).filter(Boolean);
  }

  function templateWorkout(day, exerciseConverter) {
    if (!day?.workout || typeof exerciseConverter !== "function") return null;
    const exercises = (day.workout.exercises || []).map(exerciseConverter).filter(Boolean);
    if (!exercises.length) return null;
    return snapshotWorkout({
      id: uid("template-source"),
      name: day.workout.name,
      notes: day.workout.focus || "Quick Start strength workout",
      exercises
    }, "quick-start", day.workout.name);
  }

  function snapshotsFromTemplate(template, exerciseConverter) {
    return (template?.schedule || []).map(day => templateWorkout(day, exerciseConverter)).filter(Boolean);
  }

  function snapshotsFromStrengthProgram(program) {
    const schedule = program?.schedule || [];
    return schedule.map(item => snapshotWorkout(item.workout, "strength-program", program.id)).filter(Boolean);
  }

  function analyzeStrengthWorkoutForHybrid(workout, stressEngine) {
    if (!workout || !stressEngine?.classifyStrengthSession) return null;
    const result = stressEngine.classifyStrengthSession(workout);
    return {
      workoutId: workout.id,
      name: workout.name,
      exerciseCount: workout.exercises?.length || 0,
      totalSets: (workout.exercises || []).reduce((sum, exercise) => sum + Number(exercise.sets || 0), 0),
      classification: result.classification,
      stress: clone(result.stress)
    };
  }

  function autoWorkoutCount(priority) {
    return priority === "strength" ? 4 : priority === "balanced" ? 3 : 2;
  }

  function buildStrengthForMe(priority, templates = [], exerciseConverter) {
    const preferredTemplateId = priority === "strength" ? "upper-body-focus-4-day" : "balanced-hypertrophy-4-day";
    const template = templates.find(item => item.id === preferredTemplateId) || templates[0];
    const desired = autoWorkoutCount(priority);
    const generated = snapshotsFromTemplate(template, exerciseConverter).slice(0, desired);
    return generated.map((workout, index) => ({
      ...workout,
      hybridSource: { ...workout.hybridSource, type: "liberty-forge-generated", templateId: template?.id || null },
      hybridOrder: index
    }));
  }

  function replaceWorkout(workouts = [], updatedWorkout) {
    return workouts.map(workout => workout.id === updatedWorkout.id ? clone(updatedWorkout) : workout);
  }

  function moveWorkout(workouts = [], workoutId, direction) {
    const result = [...workouts];
    const from = result.findIndex(item => item.id === workoutId);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= result.length) return result;
    [result[from], result[to]] = [result[to], result[from]];
    return result;
  }

  return {
    clone,
    snapshotWorkout,
    snapshotSavedWorkouts,
    snapshotsFromTemplate,
    snapshotsFromStrengthProgram,
    analyzeStrengthWorkoutForHybrid,
    autoWorkoutCount,
    buildStrengthForMe,
    replaceWorkout,
    moveWorkout
  };
});
