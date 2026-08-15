"use strict";

(function exposeWorkoutClassifier(root) {
  const PUSH_MUSCLES = new Set(["chest", "triceps"]);
  const PULL_MUSCLES = new Set(["back", "biceps", "rear delts", "traps", "forearms"]);
  const LEG_MUSCLES = new Set(["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"]);

  function normalized(value) { return String(value || "").trim().toLowerCase(); }

  function categoryForMetadata(exercise = {}) {
    const muscle = normalized(exercise.primaryMuscle || exercise.muscle);
    const movement = normalized(exercise.movementPattern || exercise.movementCategory || exercise.substitutionFamily);
    if (LEG_MUSCLES.has(muscle) || /(squat|leg press|lunge|split squat|hip hinge|hip extension|leg extension|leg curl|calf raise)/.test(movement)) return "legs";
    if (PULL_MUSCLES.has(muscle) || /(vertical pull|horizontal row|pullover|curl|rear.?delt|face pull|shrug)/.test(movement)) return "pull";
    if (PUSH_MUSCLES.has(muscle) || /(horizontal.*press|incline.*press|decline|dip press|vertical press|shoulder press|chest fly|adduction|triceps)/.test(movement)) return "push";
    if (muscle === "shoulders") return /(rear|pull|row|face)/.test(movement) ? "pull" : "push";
    return null;
  }

  function secondaryCategory(muscle) {
    const value = normalized(muscle);
    if (LEG_MUSCLES.has(value)) return "legs";
    if (PULL_MUSCLES.has(value)) return "pull";
    if (PUSH_MUSCLES.has(value) || value === "shoulders") return "push";
    return null;
  }

  function workoutSplitDetails(workout = {}) {
    const scores = { push: 0, pull: 0, legs: 0 };
    const primarySets = { push: 0, pull: 0, legs: 0 };
    for (const exercise of workout.exercises || []) {
      const sets = Math.max(0, Number(exercise.sets || exercise.defaults?.sets || 0));
      if (!sets) continue;
      const primary = categoryForMetadata(exercise);
      if (primary) { scores[primary] += sets; primarySets[primary] += sets; }
      const secondary = new Set((exercise.secondaryMuscles || []).map(secondaryCategory).filter(Boolean));
      secondary.delete(primary);
      secondary.forEach(category => { scores[category] += sets * 0.15; });
    }
    const total = scores.push + scores.pull + scores.legs;
    const meaningful = ["push", "pull", "legs"].filter(category => primarySets[category] >= 2 && total > 0 && scores[category] / total >= 0.2);
    return { scores, primarySets, total, meaningful };
  }

  function classifyWorkoutSplit(workout = {}) {
    const { meaningful } = workoutSplitDetails(workout);
    if (meaningful.length === 3) return "FULL BODY";
    if (meaningful.length === 2) {
      if (meaningful.includes("push") && meaningful.includes("pull")) return "PUSH + PULL";
      if (meaningful.includes("push") && meaningful.includes("legs")) return "PUSH + LEGS";
      return "PULL + LEGS";
    }
    if (meaningful.length === 1) return meaningful[0].toUpperCase();
    return "";
  }

  function workoutDisplayLabel(workout = {}, fallback = "TRAINING DAY") {
    return classifyWorkoutSplit(workout) || String(workout.name || fallback).trim() || fallback;
  }

  const api = { categoryForMetadata, workoutSplitDetails, classifyWorkoutSplit, workoutDisplayLabel };
  root.FleemanWorkoutClassifier = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
