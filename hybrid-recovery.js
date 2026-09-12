(function (root, factory) {
  const config = typeof module === "object" && module.exports ? require("./hybrid-config.js") : root.FleemanHybridConfig;
  const api = factory(config);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FleemanHybridRecovery = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (config) {
  function sessionAggravatesLocalIssue(session = {}, location = "") {
    if (!location || location === "None") return false;
    const normalized = String(location).toLowerCase();
    const runningLocations = /knee|shin|achilles|calf|ankle|foot|plantar|hip|lower back/;
    const upperLocations = /shoulder|elbow|wrist|hand|upper back|neck/;
    if (session.type === "run" || session.type === "recovery") return runningLocations.test(normalized);
    if (session.type === "strength") {
      if (upperLocations.test(normalized)) return Number(session.stress?.upperBody || 0) >= 2;
      if (runningLocations.test(normalized)) return Number(session.stress?.lowerBody || 0) >= 2;
    }
    return false;
  }

  function calculateRecoveryState(input = {}, session = {}) {
    if (input.acuteWarning) return { level: 6, decision: "STOP", action: "Do not train", reason: "Concerning acute symptoms require appropriate medical evaluation. The app does not diagnose conditions.", safetyOverride: true };
    const legPenalty = config.RECOVERY_PENALTIES.legs[input.legs] ?? 0;
    const fatigue = config.RECOVERY_PENALTIES.fatigue[input.fatigue] ?? 0;
    const sleep = config.RECOVERY_PENALTIES.sleep[input.sleep] ?? 0;
    const pain = Number(input.painRating || 0);
    const localConflict = pain >= 3 && sessionAggravatesLocalIssue(session, input.painLocation);
    const upperOnlyStrength = session.type === "strength" && Number(session.stress?.lowerBody || 0) < 1.5 && Number(session.stress?.upperBody || 0) >= 1;
    const legs = upperOnlyStrength ? 0 : legPenalty;
    let score = legs + fatigue + sleep;
    const demandingLower = Number(session.stress?.lowerBody || 0) >= 3.5;
    if (["heavy", "very-heavy", "very-sore"].includes(input.legs) && demandingLower) score += 2;
    if (localConflict) score += pain >= 5 ? 5 : pain >= 4 ? 3 : 2;
    let level = score === 0 ? 0 : score <= 1 ? 1 : score <= 3 ? 2 : score <= 5 ? 3 : score <= 7 ? 4 : 5;
    if (pain === 2 && localConflict) level = Math.max(level, 1);
    if (pain === 3 && localConflict) level = Math.max(level, 3);
    if (pain === 4 && localConflict) level = Math.max(level, 4);
    if (pain >= 5 && localConflict) level = 6;
    if (pain >= 4 && !localConflict && session.type === "strength" && Number(session.stress?.lowerBody || 0) < 2) level = Math.min(level, 2);
    const actions = {
      0: ["Train as planned"],
      1: ["Train normally", "Monitor during warm-up"],
      2: ["Train with a readiness warm-up", "Hold progression if the warm-up feels worse"],
      3: ["Remove low-value accessory volume", "Increase RIR or reduce run intensity"],
      4: ["Substitute or move the demanding session", "Use an easy session if the warm-up remains difficult"],
      5: ["Use active recovery or very light non-aggravating training"],
      6: ["Stop the aggravating activity", "Seek appropriate evaluation when symptoms warrant it"]
    };
    return { level, score, decision: level === 0 ? "TRAIN AS PLANNED" : level === 1 ? "TRAIN AND MONITOR" : level === 2 ? "READINESS WARM-UP" : level === 3 ? "TRAIN WITH ADJUSTMENT" : level === 4 ? "CHANGE OR MOVE SESSION" : level === 5 ? "ACTIVE RECOVERY" : "STOP", actions: actions[level], localConflict, safetyOverride: level === 6, reason: localConflict ? `Reported ${input.painLocation || "local"} pain affects this session. Unrelated training may remain appropriate.` : "Recovery inputs are applied progressively; complete rest is the last intervention." };
  }

  function adjustSessionForRecovery(session, recovery) {
    const adjusted = JSON.parse(JSON.stringify(session));
    adjusted.recoveryDecision = recovery;
    if (recovery.level <= 1) return adjusted;
    if (recovery.level === 2) adjusted.holdProgression = true;
    if (recovery.level === 3) {
      adjusted.holdProgression = true;
      if (adjusted.type === "run") { adjusted.targetDistance = Number((Number(adjusted.targetDistance || 0) * .85).toFixed(1)); adjusted.targetDuration = Math.round(Number(adjusted.targetDuration || 0) * .85); adjusted.runType = /Threshold|Intervals|Tempo|Hills/.test(adjusted.runType || "") ? "Easy Run" : adjusted.runType; adjusted.rpeTarget = "3-4"; }
      else adjusted.volumeMultiplier = .75;
    }
    if (recovery.level === 4) {
      adjusted.holdProgression = true;
      if (adjusted.type === "run") { adjusted.originalRunType = adjusted.runType; adjusted.runType = "Easy Run"; adjusted.targetDistance = Number((Number(adjusted.targetDistance || 0) * .65).toFixed(1)); adjusted.targetDuration = Math.round(Number(adjusted.targetDuration || 0) * .65); adjusted.rpeTarget = "2-4"; }
      else adjusted.volumeMultiplier = .6;
    }
    if (recovery.level === 5) adjusted = { ...adjusted, type: "recovery", title: "Active Recovery", targetDuration: 20, rpeTarget: "1-2" };
    if (recovery.level >= 6) adjusted.blocked = true;
    return adjusted;
  }
  return { sessionAggravatesLocalIssue, calculateRecoveryState, adjustSessionForRecovery };
});
