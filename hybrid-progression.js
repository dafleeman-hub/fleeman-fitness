(function (root, factory) {
  const config = typeof module === "object" && module.exports ? require("./hybrid-config.js") : root.FleemanHybridConfig;
  const reasons = typeof module === "object" && module.exports ? require("./progression-reasons.js") : root.FleemanProgressionReasons;
  const api = factory(config, reasons);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FleemanHybridProgression = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (config, reasons) {
  function summarizeCompletedRuns(runHistory = [], referenceDate = new Date()) {
    const cutoff = new Date(referenceDate).getTime() - 28 * 86400000;
    const recent = runHistory.filter(run => new Date(run.date).getTime() >= cutoff);
    const completed = recent.filter(run => run.completion === "completed");
    const mileage = recent.reduce((sum, run) => sum + Number(run.completedDistance || 0), 0);
    const weeks = Math.max(1, Math.min(4, Math.ceil((referenceDate.getTime() - Math.min(...recent.map(run => new Date(run.date).getTime()), referenceDate.getTime())) / (7 * 86400000)) || 1));
    const easy = recent.filter(run => run.completion !== "skipped" && /Recovery|Easy/.test(run.runType || ""));
    const hard = recent.filter(run => run.completion !== "skipped" && /Tempo|Threshold|Hills|Intervals|Race|Marathon Pace/.test(run.runType || ""));
    const longRuns = recent.filter(run => run.completion !== "skipped" && /Long/.test(run.runType || ""));
    const uniqueRunDays = new Set(recent.filter(run => run.completion !== "skipped").map(run => String(run.date || "").slice(0, 10))).size;
    const orderedEasy = easy.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const split = Math.max(1, Math.floor(orderedEasy.length / 2));
    const firstRpe = orderedEasy.slice(0, split).reduce((sum, run) => sum + Number(run.rpe || 0), 0) / Math.max(1, orderedEasy.slice(0, split).length);
    const lastRpe = orderedEasy.slice(split).reduce((sum, run) => sum + Number(run.rpe || 0), 0) / Math.max(1, orderedEasy.slice(split).length);
    return {
      recentCount: recent.length,
      completedCount: completed.length,
      completionRate: recent.length ? completed.length / recent.length : 1,
      averageWeeklyDistance: mileage / weeks,
      runningDaysPerWeek: uniqueRunDays / weeks,
      longestRun: Math.max(0, ...recent.map(run => Number(run.completedDistance || 0))),
      averageLongRun: longRuns.length ? longRuns.reduce((sum, run) => sum + Number(run.completedDistance || 0), 0) / longRuns.length : 0,
      averageEasyDuration: easy.length ? easy.reduce((sum, run) => sum + Number(run.durationMinutes || 0), 0) / easy.length : 0,
      hardSessionsPerWeek: hard.length / weeks,
      averageEasyRpe: easy.length ? easy.reduce((sum, run) => sum + Number(run.rpe || 0), 0) / easy.length : 0,
      easyRpeDrift: orderedEasy.length >= 4 ? lastRpe - firstRpe : 0,
      highPainCount: recent.filter(run => Number(run.painRating || 0) >= 3).length,
      fatigueStops: recent.filter(run => run.completion === "partial" && /fatigue/i.test(run.partialReason || "")).length,
      timeConstraintStops: recent.filter(run => run.completion === "partial" && /time/i.test(run.partialReason || "")).length,
      missedCount: recent.filter(run => run.completion === "skipped").length
    };
  }

  function calculateRunningProgression(runHistory = [], baseline = {}) {
    const summary = summarizeCompletedRuns(runHistory);
    let decision = "HOLD", volumeMultiplier = 1, lever = "none", reason = "More completed training is needed before progressing.";
    if (summary.highPainCount) { decision = summary.highPainCount > 1 ? "RECOVER" : "CUT BACK"; volumeMultiplier = summary.highPainCount > 1 ? .72 : .85; reason = "Pain reports override normal running progression."; }
    else if (summary.completionRate < .6 || summary.fatigueStops >= 2 || summary.averageEasyRpe >= 6 || summary.easyRpeDrift >= 1.5) { decision = "CUT BACK"; volumeMultiplier = .85; reason = "Recent completion, fatigue, or easy-run effort drift supports a lower running load."; }
    else if (summary.recentCount >= 3 && summary.completionRate >= .8 && summary.averageEasyRpe <= 5) { decision = "PROGRESS"; volumeMultiplier = baseline.classification === "new" ? 1.05 : 1.08; lever = "volume"; reason = "Completed running has been consistent and manageable."; }
    else if (summary.recentCount) { reason = "Hold the current running load while consistency develops."; }
    const explanation = reasons.running(decision, summary);
    return { decision, volumeMultiplier, lever, reason, explanation, longRunIncreased: decision === "PROGRESS" && volumeMultiplier > 1, summary };
  }

  function calculateHybridProgressionBudget({ priority = "balanced", runningProgression = {}, strengthEligibility = [], deferred = [] } = {}) {
    const majorRunningIncrease = runningProgression.decision === "PROGRESS" && Number(runningProgression.volumeMultiplier || 1) >= 1.075;
    const candidates = [...deferred.map(item => ({ ...item, previouslyDeferred: true })), ...strengthEligibility].filter((item, index, list) => list.findIndex(other => other.exerciseId === item.exerciseId) === index);
    return candidates.map(item => {
      const lowerBody = item.region === "lower";
      const shouldDefer = lowerBody && majorRunningIncrease && ["balanced", "running", "race"].includes(priority) && !item.previouslyDeferred;
      const result = { ...item, eligible: true, applied: !shouldDefer, deferred: shouldDefer, reason: shouldDefer ? "HYBRID LOAD MANAGEMENT: earned progression is retained for the next stable week." : item.previouslyDeferred ? "Previously earned progression can be reconsidered this stable week." : "Progression can be applied this week." };
      result.explanation = reasons.strengthBudget(result, runningProgression);
      return result;
    });
  }

  function weeklyDecision({ runHistory = [], baseline = {}, recoveryWeeks = 0, priority = "balanced", strengthEligibility = [], deferredStrengthProgression = [] } = {}) {
    const running = calculateRunningProgression(runHistory, baseline);
    const decision = running.decision === "RECOVER" || recoveryWeeks >= 2 ? "RECOVERY WEEK" : running.decision;
    const strengthBudget = calculateHybridProgressionBudget({ priority, runningProgression: running, strengthEligibility, deferred: deferredStrengthProgression });
    const explanation = decision === "RECOVERY WEEK" && running.decision !== "RECOVER"
      ? reasons.create(reasons.CODES.RECOVERY_WEEK_TRIGGERED, { recoveryWeeks: Number(recoveryWeeks || 0) })
      : running.explanation;
    return { decision, explanation, running, strengthBudget, strengthVolumeMultiplier: decision === "RECOVERY WEEK" ? .68 : decision === "CUT BACK" ? .82 : 1, runningVolumeMultiplier: decision === "RECOVERY WEEK" ? .75 : running.volumeMultiplier };
  }
  return { summarizeCompletedRuns, calculateRunningProgression, calculateHybridProgressionBudget, weeklyDecision };
});
