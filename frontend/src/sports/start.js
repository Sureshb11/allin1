// Per-sport quick start-match formats (unit + format presets) for StartMatchScreen.
// Add a sport here for custom presets; unknown sports use DEFAULT_START_FORMAT.
export const START_FORMATS = {
  cricket: {
    unit: 'Overs', durationIcon: 'counter',
    formats: [
      { label: 'T20',    icon: 'lightning-bolt', value: 20 },
      { label: 'ODI',    icon: 'earth',          value: 50 },
      { label: 'Test',   icon: 'flag-outline',   value: 90 },
      { label: 'Custom', icon: 'tune-variant',   value: 10 },
    ],
  },
  football: {
    unit: 'Minutes', durationIcon: 'clock-outline',
    formats: [
      { label: 'Full',     icon: 'soccer',         value: 90 },
      { label: 'Friendly', icon: 'handshake',      value: 90 },
      { label: '5-a-side', icon: 'account-group',  value: 40 },
      { label: 'Custom',   icon: 'tune-variant',   value: 60 },
    ],
  },
  badminton: {
    unit: 'Points', durationIcon: 'numeric',
    formats: [
      { label: 'Singles',   icon: 'account',           value: 21 },
      { label: 'Doubles',   icon: 'account-multiple',  value: 21 },
      { label: 'Best of 3', icon: 'trophy-outline',    value: 21 },
      { label: 'Custom',    icon: 'tune-variant',      value: 15 },
    ],
  },
  tennis: {
    unit: 'Sets', durationIcon: 'tennis',
    formats: [
      { label: 'Best of 3', icon: 'tennis',         value: 3 },
      { label: 'Best of 5', icon: 'trophy-outline', value: 5 },
      { label: 'Pro Set',   icon: 'flash',          value: 1 },
      { label: 'Custom',    icon: 'tune-variant',   value: 3 },
    ],
  },
  tabletennis: {
    unit: 'Games', durationIcon: 'table-tennis',
    formats: [
      { label: 'Best of 5', icon: 'table-tennis',   value: 5 },
      { label: 'Best of 7', icon: 'trophy-outline', value: 7 },
      { label: 'Singles',   icon: 'account',        value: 5 },
      { label: 'Custom',    icon: 'tune-variant',   value: 5 },
    ],
  },
  squash: {
    unit: 'Games', durationIcon: 'tennis',
    formats: [
      { label: 'Best of 5', icon: 'tennis',         value: 5 },
      { label: 'Best of 3', icon: 'trophy-outline', value: 3 },
      { label: 'PSA Rules', icon: 'flash',          value: 5 },
      { label: 'Custom',    icon: 'tune-variant',   value: 5 },
    ],
  },
  pickleball: {
    unit: 'Games', durationIcon: 'table-tennis',
    formats: [
      { label: 'Best of 3', icon: 'table-tennis',     value: 3 },
      { label: 'Singles',   icon: 'account',          value: 3 },
      { label: 'Doubles',   icon: 'account-multiple', value: 3 },
      { label: 'Custom',    icon: 'tune-variant',     value: 3 },
    ],
  },
  basketball: {
    unit: 'Minutes', durationIcon: 'clock-outline',
    formats: [
      { label: 'Full Game', icon: 'basketball',     value: 40 },
      { label: 'NBA Rules', icon: 'star',           value: 48 },
      { label: '3x3',       icon: 'numeric-3-box',  value: 10 },
      { label: 'Custom',    icon: 'tune-variant',   value: 40 },
    ],
  },
  kabaddi: {
    unit: 'Minutes', durationIcon: 'clock-outline',
    formats: [
      { label: 'Pro Kabaddi', icon: 'run-fast',      value: 40 },
      { label: 'Amateur',     icon: 'run-fast',      value: 30 },
      { label: 'Circle',      icon: 'circle-outline', value: 30 },
      { label: 'Custom',      icon: 'tune-variant',  value: 40 },
    ],
  },
  hockey: {
    unit: 'Minutes', durationIcon: 'clock-outline',
    formats: [
      { label: 'Field (4Q)', icon: 'hockey-sticks', value: 60 },
      { label: '2 Halves',   icon: 'hockey-sticks', value: 70 },
      { label: 'Indoor',     icon: 'home',          value: 40 },
      { label: 'Custom',     icon: 'tune-variant',  value: 60 },
    ],
  },
  volleyball: {
    unit: 'Sets', durationIcon: 'volleyball',
    formats: [
      { label: 'Best of 5', icon: 'volleyball',     value: 5 },
      { label: 'Best of 3', icon: 'trophy-outline', value: 3 },
      { label: 'Beach',     icon: 'beach',          value: 3 },
      { label: 'Custom',    icon: 'tune-variant',   value: 5 },
    ],
  },
  handball: {
    unit: 'Minutes', durationIcon: 'clock-outline',
    formats: [
      { label: 'Full Match', icon: 'handball',     value: 60 },
      { label: 'Beach',      icon: 'beach',         value: 20 },
      { label: 'Mini',       icon: 'handball',      value: 40 },
      { label: 'Custom',     icon: 'tune-variant',  value: 60 },
    ],
  },
  khokho: {
    unit: 'Turns', durationIcon: 'run',
    formats: [
      { label: 'Standard',     icon: 'run',          value: 4 },
      { label: 'Super Kho-Kho', icon: 'flash',       value: 2 },
      { label: 'Custom',       icon: 'tune-variant', value: 4 },
    ],
  },
};

export const DEFAULT_START_FORMAT = {
  unit: 'Duration', durationIcon: 'clock-outline',
  formats: [
    { label: 'Standard',   icon: 'whistle',        value: 60 },
    { label: 'Friendly',   icon: 'handshake',      value: 60 },
    { label: 'Tournament', icon: 'trophy-outline', value: 60 },
    { label: 'Custom',     icon: 'tune-variant',   value: 30 },
  ],
};

export const getStartFormat = (sportId) => START_FORMATS[sportId] || DEFAULT_START_FORMAT;

export default { START_FORMATS, DEFAULT_START_FORMAT, getStartFormat };
