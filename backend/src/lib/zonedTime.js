// Put a wall-clock time onto a date IN A GIVEN TIME ZONE.
//
// `d.setHours(14, 30)` uses the SERVER's zone. That is fine on a laptop in
// Chennai and wrong on Vercel, which runs in UTC: the same code that stores a
// 14:30 first ball here stores 14:30Z there, and the fixture shows up at 20:00
// for everyone in India. The create wizard collects the tournament's time zone
// precisely so this doesn't have to be guessed.
//
// No dependency: Intl can format an instant into a zone, so guess the instant,
// see what that zone calls it, and correct by the difference. One correction is
// enough for whole-minute offsets; a second run pins the DST boundary case
// where the first guess lands on the other side of a transition.

// What wall-clock time does `instant` show in `tz`, as a UTC-epoch of those
// same numbers? The difference from `instant` is the zone's offset.
function wallClockAsUtc(instant, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant).reduce((a, p) => (a[p.type] = p.value, a), {});
  // Intl renders midnight as hour 24 in some environments.
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, hour, +parts.minute, +parts.second);
}

/**
 * @param {Date}   date  the day to schedule on (its Y-M-D in `tz` is used)
 * @param {number} hh    wall-clock hour in `tz`
 * @param {number} mm    wall-clock minute in `tz`
 * @param {string} tz    IANA zone, e.g. 'Asia/Kolkata'. Falsy → server local.
 * @returns {Date} the instant at which `tz` reads hh:mm on that day
 */
export function zonedTime(date, hh, mm, tz) {
  if (!tz) { const d = new Date(date); d.setHours(hh, mm, 0, 0); return d; }
  try {
    // The calendar day as that zone sees it, not as the server does.
    const dayParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date).split('-').map(Number);
    // The wall clock we want, expressed as a UTC-epoch of those numbers. The
    // loop converges when the zone SHOWS this, not when the offset is zero —
    // the offset is never zero outside UTC, and testing for that subtracted it
    // on every pass.
    const target = Date.UTC(dayParts[0], dayParts[1] - 1, dayParts[2], hh, mm, 0, 0);
    let guess = new Date(target);
    for (let i = 0; i < 2; i++) {
      const diff = wallClockAsUtc(guess, tz) - target;
      if (diff === 0) break;
      guess = new Date(guess.getTime() - diff);
    }
    return guess;
  } catch {
    // An unknown zone shouldn't stop a schedule being generated.
    const d = new Date(date); d.setHours(hh, mm, 0, 0); return d;
  }
}

export default zonedTime;
