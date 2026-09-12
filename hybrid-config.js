(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FleemanHybridConfig = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SCHEMA_VERSION = 2;
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const PRIORITIES = {
    strength: { label: "Strength Priority", strengthSessions: 4, runSessions: 2, hardRunLimit: 1, lowerVolumeMultiplier: 1 },
    balanced: { label: "Balanced Hybrid", strengthSessions: 3, runSessions: 3, hardRunLimit: 1, lowerVolumeMultiplier: .85 },
    running: { label: "Running Priority", strengthSessions: 2, runSessions: 4, hardRunLimit: 1, lowerVolumeMultiplier: .7 },
    race: { label: "Race Hybrid", strengthSessions: 2, runSessions: 4, hardRunLimit: 1, lowerVolumeMultiplier: .65 }
  };
  const RUN_BASE_STRESS = {
    "Recovery Run": 1,
    "Easy Run": 2,
    "Steady Run": 2.5,
    "Long Easy Run": 3,
    "Marathon Pace": 3.5,
    "Tempo": 4,
    "Threshold": 4.5,
    "Hills": 4.5,
    "Intervals": 4.5,
    "Race": 5
  };
  const RIR_WEIGHTS = { zeroOne: 1.2, two: 1, three: .85, four: .7, fivePlus: .5 };
  const SYSTEMIC_COST = { deadlift: .5, squat: .25, rdl: .25 };
  const CONFLICT = {
    greenMax: 5,
    yellowMax: 7,
    orangeMax: 8,
    penalties: { green: 0, yellow: -5, orange: -15, red: -30, sameDayRed: -20 },
    rewards: { preferredDay: 5, hardEasyAlternation: 5, separatedA: 5, upperRunPairing: 3 }
  };
  const RECOVERY_PENALTIES = {
    legs: { fresh: 0, normal: 0, "slightly-heavy": 1, heavy: 2, "very-heavy": 3, "very-sore": 3 },
    fatigue: { low: 0, normal: 0, high: 2, "very-high": 3, extreme: 3 },
    sleep: { great: 0, good: 0, okay: 0, fair: 1, poor: 2, "very-poor": 3 }
  };
  const INTERVENTION_ORDER = [
    "Train as planned",
    "Hold progression",
    "Reduce low-value accessory volume",
    "Increase RIR or reduce running intensity",
    "Reduce total session volume",
    "Substitute a lower-stress session",
    "Move the demanding session",
    "Use active recovery",
    "Complete rest"
  ];

  function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, Number(value) || 0)); }
  function dayIndex(value) {
    if (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 6) return Number(value);
    return Math.max(0, DAYS.findIndex(day => day.toLowerCase().startsWith(String(value || "").toLowerCase().slice(0, 3))));
  }
  return { SCHEMA_VERSION, DAYS, PRIORITIES, RUN_BASE_STRESS, RIR_WEIGHTS, SYSTEMIC_COST, CONFLICT, RECOVERY_PENALTIES, INTERVENTION_ORDER, clamp, dayIndex };
});
