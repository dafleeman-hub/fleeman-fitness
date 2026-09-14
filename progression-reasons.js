(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FleemanProgressionReasons = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CODES = Object.freeze({
    GOOD_COMPLETION: "GOOD_COMPLETION",
    GOOD_RECOVERY: "GOOD_RECOVERY",
    LOW_RPE_AT_CURRENT_LOAD: "LOW_RPE_AT_CURRENT_LOAD",
    STABLE_WEEKLY_VOLUME: "STABLE_WEEKLY_VOLUME",
    LONG_RUN_COMPLETED_WELL: "LONG_RUN_COMPLETED_WELL",
    GOOD_MILEAGE_TOLERANCE: "GOOD_MILEAGE_TOLERANCE",
    RUN_LOAD_ALREADY_INCREASED: "RUN_LOAD_ALREADY_INCREASED",
    STRENGTH_LOAD_ALREADY_INCREASED: "STRENGTH_LOAD_ALREADY_INCREASED",
    LOWER_STRENGTH_INCREASED: "LOWER_STRENGTH_INCREASED",
    HIGH_RECENT_FATIGUE: "HIGH_RECENT_FATIGUE",
    POOR_RECOVERY_TREND: "POOR_RECOVERY_TREND",
    PAIN_REPORTED: "PAIN_REPORTED",
    MISSED_SESSIONS: "MISSED_SESSIONS",
    PARTIAL_COMPLETION: "PARTIAL_COMPLETION",
    QUALITY_WORK_ADDED: "QUALITY_WORK_ADDED",
    QUALITY_WORK_HELD: "QUALITY_WORK_HELD",
    LONG_RUN_INCREASED: "LONG_RUN_INCREASED",
    RECOVERY_WEEK_TRIGGERED: "RECOVERY_WEEK_TRIGGERED",
    HYBRID_CONFLICT: "HYBRID_CONFLICT",
    RACE_PHASE_ADJUSTMENT: "RACE_PHASE_ADJUSTMENT",
    GOOD_STRENGTH_PERFORMANCE: "GOOD_STRENGTH_PERFORMANCE",
    PREVIOUSLY_DEFERRED: "PREVIOUSLY_DEFERRED",
    RUNNING_VOLUME_REDUCED: "RUNNING_VOLUME_REDUCED",
    STRENGTH_VOLUME_REDUCED: "STRENGTH_VOLUME_REDUCED",
    TARGET_NOT_MET: "TARGET_NOT_MET"
  });

  const TEMPLATES = Object.freeze({
    [CODES.GOOD_COMPLETION]: ["Recent sessions were completed with controlled effort.", "Your recent sessions were completed consistently at manageable effort."],
    [CODES.GOOD_RECOVERY]: ["Recovery stayed steady at the current training load.", "Your recent recovery remained steady while you completed the planned training."],
    [CODES.LOW_RPE_AT_CURRENT_LOAD]: ["Recent easy sessions stayed within the intended effort.", "Your recent easy sessions stayed at or below the intended effort target."],
    [CODES.STABLE_WEEKLY_VOLUME]: ["Hold the current load while consistency develops.", "More consistent completed training is needed before the next increase."],
    [CODES.LONG_RUN_COMPLETED_WELL]: ["Last week's long run felt controlled.", "You completed the previous long run at a manageable effort."],
    [CODES.GOOD_MILEAGE_TOLERANCE]: ["You handled your recent mileage well.", "Recent mileage was completed consistently without elevated effort or pain."],
    [CODES.RUN_LOAD_ALREADY_INCREASED]: ["Running load already increased this week.", "Another running progression was applied, so this prescription remains steady."],
    [CODES.STRENGTH_LOAD_ALREADY_INCREASED]: ["Strength load already increased this week.", "Another Strength progression was applied, so this prescription remains steady."],
    [CODES.LOWER_STRENGTH_INCREASED]: ["Lower-body strength load increased this week.", "Running stays steady while the increased lower-body Strength load settles."],
    [CODES.HIGH_RECENT_FATIGUE]: ["Fatigue has been elevated across recent sessions.", "Multiple recent sessions were shortened because fatigue was elevated."],
    [CODES.POOR_RECOVERY_TREND]: ["Recent training stress is outpacing recovery.", "Easy-run effort has risen enough to support a recovery-focused adjustment."],
    [CODES.PAIN_REPORTED]: ["Pain was reported during recent training.", "Recent pain reports take priority over normal progression signals."],
    [CODES.MISSED_SESSIONS]: ["Recent missed sessions support holding the current load.", "Completion has been below the level used for a safe progression."],
    [CODES.PARTIAL_COMPLETION]: ["Recent sessions were only partially completed.", "Partial session completion supports keeping or reducing the current load."],
    [CODES.QUALITY_WORK_ADDED]: ["Quality work increased within the weekly load budget.", "Quality work progressed because recent training stayed manageable."],
    [CODES.QUALITY_WORK_HELD]: ["Overall training load already increased this week.", "Quality work remains steady because another training load already increased."],
    [CODES.LONG_RUN_INCREASED]: ["Long-run volume increased this week.", "The long run increased, so earned lower-body Strength progression is deferred."],
    [CODES.RECOVERY_WEEK_TRIGGERED]: ["Recent training stress is outpacing recovery.", "A recovery week reduces load after a sustained recovery concern."],
    [CODES.HYBRID_CONFLICT]: ["Nearby Strength and running stress need more recovery.", "This progression is deferred to avoid stacking competing training stress."],
    [CODES.RACE_PHASE_ADJUSTMENT]: ["Race-phase priorities changed this week's training balance.", "The current race phase changed which training quality receives priority."],
    [CODES.GOOD_STRENGTH_PERFORMANCE]: ["You reached the top of the target rep range.", "Every completed set reached the top of its target range without high difficulty."],
    [CODES.PREVIOUSLY_DEFERRED]: ["A previously earned progression now fits this week.", "The earlier earned progression can be applied during this stable training week."],
    [CODES.RUNNING_VOLUME_REDUCED]: ["Running volume was reduced to support recovery.", "The next running prescription is reduced because current recovery signals warrant it."],
    [CODES.STRENGTH_VOLUME_REDUCED]: ["Strength volume was reduced to support recovery.", "The next Strength prescription uses less volume while recovery catches up."],
    [CODES.TARGET_NOT_MET]: ["Recent sets finished below the target range.", "The load is reduced because completed sets fell below the planned rep range."]
  });

  const PRIORITY = [
    CODES.PAIN_REPORTED,
    CODES.RECOVERY_WEEK_TRIGGERED,
    CODES.HIGH_RECENT_FATIGUE,
    CODES.POOR_RECOVERY_TREND,
    CODES.HYBRID_CONFLICT,
    CODES.LONG_RUN_INCREASED,
    CODES.LOWER_STRENGTH_INCREASED,
    CODES.RUN_LOAD_ALREADY_INCREASED,
    CODES.STRENGTH_LOAD_ALREADY_INCREASED,
    CODES.MISSED_SESSIONS,
    CODES.PARTIAL_COMPLETION,
    CODES.LONG_RUN_COMPLETED_WELL,
    CODES.GOOD_MILEAGE_TOLERANCE,
    CODES.GOOD_STRENGTH_PERFORMANCE,
    CODES.GOOD_COMPLETION,
    CODES.STABLE_WEEKLY_VOLUME
  ];

  function create(code, details = {}) {
    const template = TEMPLATES[code] || TEMPLATES[CODES.STABLE_WEEKLY_VOLUME];
    return { code: TEMPLATES[code] ? code : CODES.STABLE_WEEKLY_VOLUME, shortText: template[0], longText: template[1], details: { ...details } };
  }

  function selectPrimary(codes = [], details = {}) {
    const unique = [...new Set(codes.filter(code => TEMPLATES[code]))];
    const code = PRIORITY.find(candidate => unique.includes(candidate)) || unique[0] || CODES.STABLE_WEEKLY_VOLUME;
    return create(code, details);
  }

  function running(decision, summary = {}, context = {}) {
    const candidates = [];
    if (Number(summary.highPainCount || 0) > 0) candidates.push(CODES.PAIN_REPORTED);
    if (decision === "RECOVER" || decision === "RECOVERY WEEK") candidates.push(CODES.RECOVERY_WEEK_TRIGGERED);
    if (Number(summary.fatigueStops || 0) >= 2) candidates.push(CODES.HIGH_RECENT_FATIGUE);
    if (Number(summary.averageEasyRpe || 0) >= 6 || Number(summary.easyRpeDrift || 0) >= 1.5) candidates.push(CODES.POOR_RECOVERY_TREND);
    if (Number(summary.completionRate ?? 1) < .6 || Number(summary.missedCount || 0) > 1) candidates.push(CODES.MISSED_SESSIONS);
    if (context.lowerBodyStrengthIncreased) candidates.push(CODES.LOWER_STRENGTH_INCREASED);
    if (context.runLoadAlreadyIncreased) candidates.push(CODES.RUN_LOAD_ALREADY_INCREASED);
    if (decision === "PROGRESS") candidates.push(context.sessionType === "long-run" ? CODES.LONG_RUN_COMPLETED_WELL : CODES.GOOD_MILEAGE_TOLERANCE);
    if (decision === "HOLD" && !candidates.length) candidates.push(CODES.STABLE_WEEKLY_VOLUME);
    if (decision === "CUT BACK" && !candidates.length) candidates.push(CODES.RUNNING_VOLUME_REDUCED);
    return selectPrimary(candidates, {
      completionRate: Number(summary.completionRate ?? 1),
      averageWeeklyDistance: Number(summary.averageWeeklyDistance || 0),
      averageEasyRpe: Number(summary.averageEasyRpe || 0),
      easyRpeDrift: Number(summary.easyRpeDrift || 0),
      highPainCount: Number(summary.highPainCount || 0),
      fatigueStops: Number(summary.fatigueStops || 0),
      missedCount: Number(summary.missedCount || 0)
    });
  }

  function strengthBudget(item = {}, runningProgression = {}) {
    if (item.deferred) return create(runningProgression.longRunIncreased ? CODES.LONG_RUN_INCREASED : CODES.HYBRID_CONFLICT, { exerciseId: item.exerciseId, runningVolumeMultiplier: Number(runningProgression.volumeMultiplier || 1) });
    if (item.previouslyDeferred) return create(CODES.PREVIOUSLY_DEFERRED, { exerciseId: item.exerciseId });
    return create(CODES.GOOD_STRENGTH_PERFORMANCE, { exerciseId: item.exerciseId });
  }

  return { CODES, TEMPLATES, create, selectPrimary, running, strengthBudget };
});
