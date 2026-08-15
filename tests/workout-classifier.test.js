"use strict";

const assert = require("node:assert/strict");
const { classifyWorkoutSplit } = require("../workout-classifier.js");
const exercise = (primaryMuscle, movementPattern, sets = 3, secondaryMuscles = []) => ({ primaryMuscle, movementPattern, sets, secondaryMuscles });
const classify = exercises => classifyWorkoutSplit({ exercises });

assert.equal(classify([exercise("Chest","Horizontal Press"),exercise("Chest","Incline Press"),exercise("Shoulders","Vertical Press"),exercise("Triceps","Triceps Extension")]), "PUSH");
assert.equal(classify([exercise("Back","Vertical Pull"),exercise("Back","Horizontal Row"),exercise("Back","Horizontal Row"),exercise("Biceps","Curl")]), "PULL");
assert.equal(classify([exercise("Quads","Squat"),exercise("Hamstrings","Hip Hinge"),exercise("Quads","Leg Extension"),exercise("Hamstrings","Leg Curl"),exercise("Calves","Calf Raise")]), "LEGS");
assert.equal(classify([exercise("Chest","Horizontal Press"),exercise("Shoulders","Vertical Press"),exercise("Back","Vertical Pull"),exercise("Back","Horizontal Row")]), "PUSH + PULL");
assert.equal(classify([exercise("Chest","Horizontal Press"),exercise("Chest","Incline Press"),exercise("Quads","Squat"),exercise("Quads","Leg Press")]), "PUSH + LEGS");
assert.equal(classify([exercise("Back","Vertical Pull"),exercise("Back","Horizontal Row"),exercise("Quads","Squat"),exercise("Hamstrings","Hip Hinge")]), "PULL + LEGS");
assert.equal(classify([exercise("Chest","Horizontal Press"),exercise("Back","Horizontal Row"),exercise("Quads","Squat"),exercise("Shoulders","Vertical Press"),exercise("Back","Vertical Pull"),exercise("Hamstrings","Hip Hinge")]), "FULL BODY");
assert.equal(classify([exercise("Quads","Squat",6),exercise("Quads","Leg Press",6),exercise("Quads","Leg Extension",6),exercise("Biceps","Curl",3)]), "LEGS");

console.log("PASS workout classifier: 8 split-label scenarios");
