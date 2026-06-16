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
