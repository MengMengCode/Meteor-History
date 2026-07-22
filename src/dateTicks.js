const DAY_MS = 86_400_000;
const YEAR_MS = 365.25 * DAY_MS;

function dateTickFormatter(span) {
  if (span < YEAR_MS) {
    return new Intl.DateTimeFormat('en', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  if (span < 8 * YEAR_MS) {
    return new Intl.DateTimeFormat('en', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
    });
  }

  return new Intl.DateTimeFormat('en', {
    timeZone: 'UTC',
    year: 'numeric',
  });
}

export function createDateTicks(start, end, maxCount = 5) {
  const span = Math.max(DAY_MS, end - start);
  const availableDates = Math.floor(span / DAY_MS) + 1;
  const count = Math.max(2, Math.min(maxCount, availableDates));
  const formatter = dateTickFormatter(span);

  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    const value = start + span * ratio;
    return { value, ratio, label: formatter.format(value) };
  });
}
