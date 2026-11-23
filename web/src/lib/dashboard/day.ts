const DAY_MS = 86_400_000;

/** Noon UTC of a YYYY-MM-DD day, so calendar arithmetic never crosses a date line. */
function noon(day: string): number {
  return Date.parse(`${day}T12:00:00Z`);
}

/** The calendar day `delta` days from `day` (YYYY-MM-DD). */
export function shiftDay(day: string, delta: number): string {
  return new Date(noon(day) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** "Asia/Jakarta" becomes "Jakarta"; "UTC" stays "UTC". */
export function zoneCity(zone: string): string {
  return (zone.split('/').pop() ?? zone).replaceAll('_', ' ');
}

const TITLE = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** "Weekday, day month" from the parts, so the punctuation does not depend on the ICU version. */
function title(fmt: Intl.DateTimeFormat, day: string): string {
  const p = Object.fromEntries(fmt.formatToParts(noon(day)).map((x) => [x.type, x.value]));
  return `${p.weekday}, ${p.day} ${p.month}`;
}

/** "Friday, 20 November"; the year is added when `day` is not in `todayDay`'s year. */
export function dayTitle(day: string, todayDay: string): string {
  const text = title(TITLE, day);
  return day.slice(0, 4) === todayDay.slice(0, 4) ? text : `${text} ${day.slice(0, 4)}`;
}

const TITLE_SHORT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "Fri, 20 Nov", for the phone top bar; the year is added as in `dayTitle`. */
export function dayTitleShort(day: string, todayDay: string): string {
  const text = title(TITLE_SHORT, day);
  return day.slice(0, 4) === todayDay.slice(0, 4) ? text : `${text} ${day.slice(0, 4)}`;
}

/** "Jakarta time · today", "Jakarta time · yesterday", or just "Jakarta time". */
export function daySubtitle(day: string, todayDay: string, zone: string): string {
  const base = `${zoneCity(zone)} time`;
  if (day === todayDay) return `${base} · today`;
  if (day === shiftDay(todayDay, -1)) return `${base} · yesterday`;
  return base;
}
