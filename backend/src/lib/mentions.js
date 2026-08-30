// Who a chat message names.
//
// Derived from the text against the room's members, never stored. A stored list
// is a second copy of something the message already says, and the two drift the
// moment anyone edits a name — a mention would then highlight one word and
// notify a different person. Parsing costs one pass over a short string.
//
// The client highlights with the same rule (ChatScreen's renderWithMentions), so
// what looks like a mention and what actually notifies someone cannot disagree.

/** Everyone, however it was typed. Kept small on purpose. */
const ALL_TOKENS = ['everyone', 'all', 'team'];

/** A person's display name, the way chat shows it. */
export const memberName = (u) =>
  [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The userIds a message mentions.
 *
 * `members` is [{ userId, name }]. Longest names are tried first so
 * "@Suresh Balakrishnan" is one mention of that person rather than a mention of
 * a "Suresh" who also happens to be in the room. A mention must start at the
 * beginning of the text or after whitespace, so an email address is not a
 * mention of anybody.
 */
export function mentionedUserIds(text, members) {
  const src = String(text || '');
  if (!src.includes('@') || !members?.length) return [];

  const everyone = ALL_TOKENS.some((t) =>
    new RegExp(`(^|\\s)@${t}\\b`, 'i').test(src));
  if (everyone) return [...new Set(members.map((m) => m.userId).filter(Boolean))];

  const byLongest = [...members]
    .filter((m) => m.name)
    .sort((a, b) => b.name.length - a.name.length);

  // Matched spans are CONSUMED, not just counted. Testing each name
  // independently, a member called "Suresh" also matches inside
  // "@Suresh Balakrishnan" — the boundary after their name is a space either
  // way — so one mention would notify two people. Longest first, then the text
  // it covered is off limits.
  const taken = [];
  const overlaps = (a, b) => taken.some(([x, y]) => a < y && b > x);

  const hit = new Set();
  for (const m of byLongest) {
    const re = new RegExp(`(^|\\s)@${escape(m.name)}(?![\\w])`, 'gi');
    let match;
    while ((match = re.exec(src))) {
      const start = match.index + match[1].length;   // the '@' itself
      const end = start + 1 + m.name.length;
      if (overlaps(start, end)) continue;
      taken.push([start, end]);
      hit.add(m.userId);
      break;
    }
  }
  return [...hit];
}
