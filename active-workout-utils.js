"use strict";

(function exposeActiveWorkoutUtilities(root) {
  const clone = value => typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const normalized = value => String(value || "").trim().toLowerCase();
  const array = value => Array.isArray(value) ? value : value ? [value] : [];

  function equipmentOverlap(left, right) {
    const available = new Set(array(left).map(normalized));
    return array(right).some(item => available.has(normalized(item)));
  }

  function replacementScore(current = {}, candidate = {}, context = {}) {
    if (!candidate || candidate.id === current.libraryExerciseId || normalized(candidate.name) === normalized(current.name)) return -Infinity;
    let score = 0;
    if (candidate.substitutionFamily && candidate.substitutionFamily === current.substitutionFamily) score += 100;
    if (candidate.movementPattern && candidate.movementPattern === current.movementPattern) score += 70;
    if (candidate.movementCategory && candidate.movementCategory === current.movementCategory) score += 70;
    if (candidate.primaryMuscle && candidate.primaryMuscle === current.primaryMuscle) score += 50;
    if (candidate.exerciseType && candidate.exerciseType === current.exerciseType) score += 24;
    if (equipmentOverlap(candidate.equipment, current.equipment)) score += 12;
    if ((context.favorites || []).includes(candidate.id)) score += 6;
    const recentIndex = (context.recent || []).indexOf(candidate.id);
    if (recentIndex >= 0) score += Math.max(1, 5 - recentIndex);
    const painfulJoints = new Set(array(context.painfulJoints).map(normalized));
    if (array(candidate.avoidJoints || candidate.contraindicatedJoints).some(joint => painfulJoints.has(normalized(joint)))) score -= 80;
    return score;
  }

  function rankReplacementExercises(current, candidates, context = {}) {
    return (candidates || [])
      .map((candidate, index) => ({ candidate, index, score: replacementScore(current, candidate, context) }))
      .filter(item => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score || a.index - b.index || String(a.candidate.name).localeCompare(String(b.candidate.name)))
      .map(item => ({ ...item.candidate, replacementScore: item.score }));
  }

  function addWorkingSet(exercise, prescription = {}, makeId = () => crypto.randomUUID()) {
    exercise.sets ||= [];
    const last = exercise.sets.at(-1);
    const set = {
      id: makeId(),
      weight: Number(last?.weight ?? exercise.weight ?? 0),
      reps: Number(last?.reps ?? prescription.minReps ?? 0),
      done: false,
      manuallyEditedWeight: false,
      manuallyEditedReps: false,
      restored: false,
      addedManually: true
    };
    exercise.sets.push(set);
    return set;
  }

  function removeLastWorkingSet(exercise, allowCompleted = false) {
    exercise.sets ||= [];
    if (exercise.sets.length <= 1) return { removed: false, reason: "minimum" };
    const last = exercise.sets.at(-1);
    if (last.done && !allowCompleted) return { removed: false, reason: "completed" };
    return { removed: true, set: exercise.sets.pop() };
  }

  function replacementSessionExercise(current, replacementPrescription, recommendation, scope, setCount, makeId, date) {
    const sourcePrescription = current.sessionPrescription || current;
    const carriedPrescription = {
      ...clone(replacementPrescription),
      sets: setCount,
      minReps: Number(sourcePrescription.minReps ?? replacementPrescription.minReps ?? replacementPrescription.defaults?.minReps ?? 0),
      maxReps: Number(sourcePrescription.maxReps ?? replacementPrescription.maxReps ?? replacementPrescription.defaults?.maxReps ?? 0),
      targetRir: Number(current.targetRir ?? sourcePrescription.targetRir ?? replacementPrescription.targetRir ?? replacementPrescription.defaults?.targetRIR ?? 3),
      rest: Number(sourcePrescription.rest ?? replacementPrescription.rest ?? replacementPrescription.defaults?.restSeconds ?? 90)
    };
    const weight = Number(recommendation?.weight ?? 0);
    const starting = recommendation?.starting || replacementPrescription.startingWeightRecommendation || null;
    return {
      ...clone(current),
      exerciseId: replacementPrescription.id,
      libraryExerciseId: replacementPrescription.libraryExerciseId || replacementPrescription.id,
      sessionPrescription: carriedPrescription,
      name: replacementPrescription.name,
      primaryMuscle: replacementPrescription.primaryMuscle,
      secondaryMuscles: clone(replacementPrescription.secondaryMuscles || []),
      weightEntryType: replacementPrescription.weightEntryType || replacementPrescription.defaults?.weightEntryType || "Total Weight",
      progressionMode: replacementPrescription.progressionMode || replacementPrescription.defaults?.progressionMode || "manual",
      repUnit: replacementPrescription.repUnit || replacementPrescription.defaults?.repUnit || "reps",
      targetRir: carriedPrescription.targetRir,
      weight,
      recommendation: recommendation?.note || "Replacement exercise prescription",
      startingWeightRecommendation: starting,
      calibrationAttempts: [],
      calibrationStarted: false,
      calibrationMaxed: false,
      calibrationComplete: !starting?.calibrationRecommended,
      calibrationDecision: starting?.calibrationRecommended ? "pending" : "not-needed",
      sets: Array.from({ length: setCount }, () => ({
        id: makeId(), weight, reps: carriedPrescription.minReps, done: false,
        manuallyEditedWeight: false, manuallyEditedReps: false, restored: false
      })),
      skipped: false,
      skipReason: "",
      sessionNote: "",
      feedback: null,
      feedbackVisible: false,
      feedbackDeferred: false,
      feedbackAnswered: false,
      jointPain: { rating: null, joints: [] },
      jointPainAnswered: false,
      expanded: true,
      substitution: {
        from: current.name,
        fromExerciseId: current.exerciseId,
        fromLibraryExerciseId: current.libraryExerciseId || null,
        fromWeightEntryType: current.weightEntryType || sourcePrescription.weightEntryType || "Total Weight",
        to: replacementPrescription.name,
        toExerciseId: replacementPrescription.id,
        scope,
        date
      }
    };
  }

  function applyExerciseSwap(session, exerciseIndex, replacementPrescription, recommendation, scope = "today", options = {}) {
    const makeId = options.makeId || (() => crypto.randomUUID());
    const date = options.date || new Date().toISOString();
    const current = session.exercises[exerciseIndex];
    if (!current) return null;
    const completed = (current.sets || []).filter(set => set.done);
    const incompleteCount = Math.max(1, (current.sets || []).length - completed.length);
    const replacement = replacementSessionExercise(current, replacementPrescription, recommendation, scope, completed.length ? incompleteCount : Math.max(1, current.sets?.length || replacementPrescription.sets || 1), makeId, date);
    if (completed.length) {
      const original = clone(current);
      original.sets = completed;
      original.expanded = false;
      original.swapContinuation = { to: replacement.name, scope, date };
      session.exercises.splice(exerciseIndex, 1, original, replacement);
      session.currentExerciseIndex = exerciseIndex + 1;
      return { preservedOriginal: original, replacement, inserted: true };
    }
    session.exercises.splice(exerciseIndex, 1, replacement);
    session.currentExerciseIndex = exerciseIndex;
    return { preservedOriginal: null, replacement, inserted: false };
  }

  function replaceMesocycleExercise(mesocycle, original, replacementPrescription) {
    if (!mesocycle) return 0;
    let replaced = 0;
    (mesocycle.schedule || []).forEach(slot => (slot.workout?.exercises || []).forEach((item, index) => {
      const matchesId = original.exerciseId && item.id === original.exerciseId;
      const matchesLibrary = original.libraryExerciseId && item.libraryExerciseId === original.libraryExerciseId;
      if (!matchesId && !matchesLibrary) return;
      slot.workout.exercises[index] = { ...clone(replacementPrescription), id: item.id };
      replaced += 1;
    }));
    return replaced;
  }

  function moveExercise(session, index, direction) {
    const target = index + direction;
    if (!session?.exercises || target < 0 || target >= session.exercises.length) return false;
    const [exercise] = session.exercises.splice(index, 1);
    session.exercises.splice(target, 0, exercise);
    session.currentExerciseIndex = target;
    return true;
  }

  const api = { replacementScore, rankReplacementExercises, addWorkingSet, removeLastWorkingSet, applyExerciseSwap, replaceMesocycleExercise, moveExercise };
  root.FleemanActiveWorkout = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
