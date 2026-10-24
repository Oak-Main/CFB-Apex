/** A valid Week 0 must not disappear behind a truthiness fallback. */
export function reportingWeekLabel(week: number | null | undefined): string {
  return week != null && Number.isInteger(week) && week >= 0 ? `Week ${week}` : "weekly";
}

/** Statistics keep the weeks printed in their reviewed records, not watchWeek - 1. */
export function heismanWeekCopy(week: number | null | undefined, statLines: readonly string[]) {
  const watchWeek = week != null && Number.isInteger(week) && week >= 0 ? week : 2;
  const observed = statLines.map(line => /^Week (\d+):/.exec(line)?.[1]);
  const statisticsWeek = observed.length > 0 && observed.every(value => value != null && value === observed[0])
    ? Number(observed[0]) : null;
  return { watch: `Week ${watchWeek}`, statistics: statisticsWeek == null ? "dated" : `Week ${statisticsWeek}` };
}
