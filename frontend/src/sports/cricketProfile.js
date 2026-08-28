// What a cricketer is asked about themselves: primary role, batting hand and
// bowling style.
//
// One list, read by the onboarding step and by Edit Player Profile, so the two
// can't offer different words for the same thing — which is exactly how this
// database ended up with eight spellings of four roles.
//
// The role names match the sports registry (src/sports/find.js), so a role set
// here reads identically in Find Players and in a team's squad list.

export const PRIMARY_ROLES = [
  { value: 'Batter',       icon: 'baseball-bat',            blurb: 'Specialises in batting' },
  { value: 'All-rounder',  icon: 'flash',                   blurb: 'Contributes with bat and ball' },
  { value: 'Bowler',       icon: 'baseball',                blurb: 'Specialises in bowling' },
  { value: 'Wicketkeeper', icon: 'hand-back-right-outline', blurb: 'Keeps wicket' },
];

export const BATTING_STYLES = ['Right Hand Bat', 'Left Hand Bat'];

// Grouped by arm, because that is how a bowler describes themselves and it
// halves the length of the list you scan.
export const BOWLING_STYLES = [
  { group: 'Not a bowler', options: ['None'] },
  { group: 'Right arm', options: [
    'Right Arm Fast', 'Right Arm Fast Medium', 'Right Arm Medium Fast', 'Right Arm Medium',
    'Right Arm Off Break', 'Right Arm Leg Break', 'Right Arm Leg Spin', 'Right Arm Googly',
  ] },
  { group: 'Left arm', options: [
    'Left Arm Fast', 'Left Arm Medium', 'Left Arm Orthodox', 'Left Arm Chinaman',
  ] },
];

export const ALL_BOWLING_STYLES = BOWLING_STYLES.flatMap((g) => g.options);

// A batter or a keeper is offered "None" to start with — most of them don't
// bowl. It is only a starting point: plenty of keepers bowl a bit, and the
// field stays editable whatever the role says.
export const defaultBowlingStyle = (primaryRole) =>
  (primaryRole === 'Batter' || primaryRole === 'Wicketkeeper' ? 'None' : null);

// What is missing before the three "how do you play" answers can be saved.
// Primary role and batting hand are required; bowling style never is.
//
// Its own function because the onboarding step asks these three and nothing
// else — it has no name field, the account already has the name — while Edit
// Profile asks them alongside a dozen account fields. One rule, two callers.
export function validateHowIPlay({ primaryRole, battingStyle }) {
  const errors = {};
  if (!primaryRole) errors.primaryRole = 'Pick a primary role';
  if (!battingStyle) errors.battingStyle = 'Right or left handed?';
  return errors;
}

/** The above, plus the name that Edit Profile also collects. */
export function validatePlayerProfile({ name, ...play }) {
  const errors = validateHowIPlay(play);
  if (!String(name || '').trim()) errors.name = 'A player needs a name';
  return errors;
}
