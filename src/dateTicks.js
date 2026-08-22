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
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startDay = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const requestedEndDay = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  const endDay = Math.max(startDay + DAY_MS, requestedEndDay);
  const span = endDay - startDay;
  const availableDates = Math.floor(span / DAY_MS) + 1;
  const count = availableDates <= 7 ? availableDates : Math.max(2, Math.min(maxCount, availableDates));
  const formatter = dateTickFormatter(span);

  return Array.from({ length: count }, (_, index) => {
    const dayOffset = Math.round(((availableDates - 1) * index) / (count - 1));
    const value = startDay + dayOffset * DAY_MS;
    const ratio = (value - startDay) / span;
    return { value, ratio, label: formatter.format(value) };
  });
}
