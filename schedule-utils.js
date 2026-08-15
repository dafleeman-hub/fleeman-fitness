"use strict";

(function exposeScheduleUtilities(root) {
  const DAY_MS = 86400000;

  function localDate(value) {
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12);
  }

  function dateKey(value) {
    const date = localDate(value);
    if (!date) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function occurrenceMatches(entry, period, slot, rolling) {
    if (!entry) return false;
    const entryPeriod = Number(rolling ? entry.cycle ?? entry.week : entry.week);
    return entryPeriod === Number(period) && Number(entry.slot) === Number(slot);
  }

  function weeklyOccurrenceDate(mesocycle, week, slot) {
    const override = (mesocycle.progress?.rescheduled || []).find(item => occurrenceMatches(item, week, slot, false));
    if (override?.date) return localDate(override.date);
    const start = localDate(mesocycle.startDate || mesocycle.activatedAt || new Date());
    const plan = mesocycle.schedule?.[slot];
    if (!start || !plan) return null;
    const weekdayOffset = (Number(plan.dayIndex) - start.getDay() + 7) % 7;
    const date = new Date(start);
    date.setDate(start.getDate() + weekdayOffset + (Number(week) - 1) * 7);
    return date;
  }

  function weeklyOccurrences(mesocycle) {
    const occurrences = [];
    const totalWeeks = Math.max(1, Number(mesocycle.totalWeeks || mesocycle.trainingWeeks || 1));
    for (let week = 1; week <= totalWeeks; week += 1) {
      (mesocycle.schedule || []).forEach((plan, slot) => {
        const date = weeklyOccurrenceDate(mesocycle, week, slot);
        occurrences.push({
          scheduleType: "weekly",
          week,
          slot,
          plan,
          date,
          dateKey: dateKey(date),
          occurrenceId: `${week}:${slot}`
        });
      });
    }
    return occurrences.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0) || a.slot - b.slot);
  }

  function rollingOccurrences(mesocycle) {
    const normalCycles = Math.max(1, Number(mesocycle.normalCycles || 1));
    const totalCycles = normalCycles + (mesocycle.deloadMode === "final-cycle" ? 1 : 0);
    const occurrences = [];
    for (let cycle = 1; cycle <= totalCycles; cycle += 1) {
      (mesocycle.schedule || []).forEach((plan, slot) => occurrences.push({
        scheduleType: "rolling",
        cycle,
        week: cycle,
        slot,
        day: slot + 1,
        plan,
        phase: cycle > normalCycles ? "deload" : "normal",
        occurrenceId: `${cycle}:${slot}`
      }));
    }
    return occurrences;
  }

  function occurrenceResolved(mesocycle, occurrence) {
    const rolling = occurrence.scheduleType === "rolling";
    const period = rolling ? occurrence.cycle : occurrence.week;
    const progress = mesocycle.progress || {};
    if ((progress.completed || []).some(item => occurrenceMatches(item, period, occurrence.slot, rolling))) return true;
    if ((progress.skipped || []).some(item => occurrenceMatches(item, period, occurrence.slot, rolling))) return true;
    return rolling && occurrence.plan?.dayType === "rest" && (progress.restCompleted || []).some(item => occurrenceMatches(item, period, occurrence.slot, true));
  }

  function getCurrentActionableWorkout(mesocycle, referenceDate = new Date()) {
    if (!mesocycle) return null;
    if (mesocycle.scheduleType === "rolling") {
      return rollingOccurrences(mesocycle).find(item => !occurrenceResolved(mesocycle, item)) || null;
    }
    const todayKey = dateKey(referenceDate);
    const unresolved = weeklyOccurrences(mesocycle).filter(item => !occurrenceResolved(mesocycle, item));
    if (!unresolved.length) return null;
    const occurrence = unresolved[0];
    return {
      ...occurrence,
      status: occurrence.dateKey < todayKey ? "missed" : occurrence.dateKey === todayKey ? "today" : "upcoming",
      daysFromToday: Math.round(((occurrence.date?.getTime() || 0) - (localDate(referenceDate)?.getTime() || 0)) / DAY_MS)
    };
  }

  function markOccurrenceSkipped(mesocycle, occurrence, skippedAt = new Date(), reason = "Skipped by user") {
    if (!mesocycle?.progress || !occurrence) return null;
    mesocycle.progress.skipped ||= [];
    const rolling = occurrence.scheduleType === "rolling";
    const period = rolling ? occurrence.cycle : occurrence.week;
    const existing = mesocycle.progress.skipped.find(item => occurrenceMatches(item, period, occurrence.slot, rolling));
    if (existing) return existing;
    const entry = {
      week: rolling ? occurrence.cycle : occurrence.week,
      slot: occurrence.slot,
      date: new Date(skippedAt).toISOString(),
      scheduledDate: occurrence.dateKey || null,
      workoutName: occurrence.plan?.workout?.name || occurrence.plan?.restTitle || "Training Day",
      reason
    };
    if (rolling) Object.assign(entry, { cycle: occurrence.cycle, day: occurrence.day });
    mesocycle.progress.skipped.push(entry);
    return entry;
  }

  const api = { dateKey, localDate, occurrenceMatches, occurrenceResolved, weeklyOccurrenceDate, weeklyOccurrences, rollingOccurrences, getCurrentActionableWorkout, markOccurrenceSkipped };
  root.FleemanSchedule = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
