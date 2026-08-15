"use strict";

const assert = require("node:assert/strict");
const { getCurrentActionableWorkout, markOccurrenceSkipped } = require("../schedule-utils.js");
const weekly = () => ({
  scheduleType:"weekly", startDate:"2026-08-10", totalWeeks:2,
  schedule:[0,2,4].map((dayIndex,index)=>({dayIndex,workout:{name:`Training Day ${index+1}`,exercises:[]}})),
  progress:{completed:[],skipped:[],rescheduled:[]}
});

let meso=weekly();
meso.progress.completed.push({week:1,slot:0});
assert.equal(getCurrentActionableWorkout(meso,new Date("2026-08-10T12:00:00")).slot,1,"A: advances to Day 2");
meso.progress.completed.push({week:1,slot:1});
assert.equal(getCurrentActionableWorkout(meso,new Date("2026-08-10T12:00:00")).slot,2,"B: advances to Day 3");
meso=weekly();meso.progress.completed.push({week:1,slot:0});
let next=getCurrentActionableWorkout(meso,new Date("2026-08-13T12:00:00"));
assert.equal(next.status,"missed","C: yesterday is missed");assert.equal(next.slot,1);
markOccurrenceSkipped(meso,next,new Date("2026-08-13T12:00:00"));
assert.equal(getCurrentActionableWorkout(meso,new Date("2026-08-13T12:00:00")).slot,2,"D: skip advances to Day 3");
const reloaded=JSON.parse(JSON.stringify(meso));
assert.equal(getCurrentActionableWorkout(reloaded,new Date("2026-08-13T12:00:00")).slot,2,"E: skipped state survives reload");
assert.equal(reloaded.progress.completed.length,1,"F: skip creates no completed workout");
assert.equal(reloaded.progress.skipped.length,1,"F: skip is recorded once");
markOccurrenceSkipped(reloaded,next,new Date("2026-08-13T12:00:00"));
assert.equal(reloaded.progress.skipped.length,1,"F: duplicate skip is prevented");

const rolling={scheduleType:"rolling",normalCycles:2,deloadMode:"none",schedule:Array.from({length:9},(_,index)=>({dayType:"training",workout:{name:`Day ${index+1}`}})),progress:{completed:[{cycle:1,slot:0},{cycle:1,slot:1}],skipped:[],restCompleted:[]}};
assert.deepEqual([getCurrentActionableWorkout(rolling,new Date("2026-08-10")).cycle,getCurrentActionableWorkout(rolling,new Date("2026-08-14")).slot],[1,2],"Rolling A: calendar time does not advance sequence");
rolling.progress.completed.push({cycle:1,slot:2});
assert.equal(getCurrentActionableWorkout(rolling).slot,3,"Rolling B: completion advances one day");
markOccurrenceSkipped(rolling,getCurrentActionableWorkout(rolling));
assert.equal(getCurrentActionableWorkout(rolling).slot,4,"Rolling C: explicit skip advances one day");
for(let slot=4;slot<8;slot+=1)rolling.progress.completed.push({cycle:1,slot});
markOccurrenceSkipped(rolling,getCurrentActionableWorkout(rolling));
assert.deepEqual([getCurrentActionableWorkout(rolling).cycle,getCurrentActionableWorkout(rolling).slot],[2,0],"Rolling D: Day 9 rolls to Cycle 2 Day 1");

console.log("PASS schedule selector: weekly A-F and rolling A-D");
