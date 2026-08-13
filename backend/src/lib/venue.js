// Venue names, tidied in one place.
//
// Match.venue is free text a scorer types at the ground, and it shows it:
// "porur" and "Porur", "chennai" / "Chennai" / "CHENNAI", plus trailing spaces
// and a dozen blanks. The same ground therefore reads as several, which makes a
// venue list look careless and a per-venue stat impossible to group.
//
// Note this is a stopgap. There IS a Ground table — with images, amenities,
// opening hours, reviews and availability — and a live Grounds screen; matches
// simply do not reference it (no groundId on Match, and the table is empty).
// Once grounds are real, a match should point at one and this becomes the
// fallback for the ones that don't.

/** Collapse whitespace and trim. Empty and whitespace-only both become null. */
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * A grouping key: case- and punctuation-insensitive, so "Porur", "porur" and
 * "PORUR." all land together. For comparison only — never show this to anyone.
 */
export const venueKey = (s) => squash(s).toLowerCase().replace(/[.,]/g, '');

/**
 * The name as it should be stored and shown: trimmed, single-spaced, and
 * Title Cased when the scorer gave us no case to trust.
 *
 * Mixed case is left exactly as typed — "Test Arena, Chennai" and a ground
 * whose name is genuinely stylised are the scorer's call, and only all-lower
 * or all-upper input is unambiguously an accident of the keyboard.
 *
 * Returns null for blank, so an empty venue stays absent rather than becoming
 * an empty-string venue that groups with the other empty strings.
 */
export const canonicalVenue = (s) => {
  const v = squash(s);
  if (!v) return null;
  const allOneCase = v === v.toLowerCase() || v === v.toUpperCase();
  if (!allOneCase) return v;
  // Lowercase first: title-casing "PORUR" in place leaves "PORUR", which would
  // still not match "Porur" on screen — the whole point of doing this.
  return v.toLowerCase().replace(/\b[\p{L}]/gu, (c) => c.toUpperCase());
};

export default { canonicalVenue, venueKey };
