// Per-sport match formats (T20/ODI, halves, sets, …) for SportSetupScreen.
// Add a sport here to give it custom formats; unknown sports use DEFAULT_FORMATS.
// NB: keys match Arena-picker sport ids. (Historic billiards/snowboarding keys
// do not match picker ids bowling/snowboard, so those fall through to default —
// behaviour preserved verbatim from the original screen.)

export const SPORT_FORMATS = {
  cricket: {
    title: 'Select Format',
    subtitle: 'Choose match type & overs',
    formats: [
      { id: 't20',      label: 'T20',           icon: 'lightning-bolt',      desc: '20 overs per side',      overs: 20  },
      { id: 'odi',      label: 'ODI',           icon: 'cricket',             desc: '50 overs per side',      overs: 50  },
      { id: 't10',      label: 'T10',           icon: 'flash',               desc: '10 overs per side',      overs: 10  },
      { id: 'tapeball', label: 'Tape-Ball',     icon: 'circle',              desc: 'Tape ball, 10 overs',    overs: 10  },
      { id: 'test',     label: 'Test Match',    icon: 'calendar-range',      desc: '5 days, 2 innings',      overs: 0   },
      { id: 'custom',   label: 'Custom',        icon: 'tune',                desc: 'Set your own overs',     overs: null },
    ],
  },
  football: {
    title: 'Select Format',
    subtitle: 'Choose game type & duration',
    formats: [
      { id: 'full',     label: '90 Min',        icon: 'soccer',              desc: '2 × 45 min halves'  },
      { id: '60min',    label: '60 Min',        icon: 'timer-outline',       desc: '2 × 30 min halves'  },
      { id: 'futsal',   label: 'Futsal',        icon: 'soccer',              desc: '2 × 20 min halves'  },
      { id: 'friendly', label: 'Friendly',      icon: 'handshake',           desc: 'No time limit'      },
    ],
  },
  basketball: {
    title: 'Select Format',
    subtitle: 'Choose game type',
    formats: [
      { id: 'full',     label: 'Full Game',     icon: 'basketball',          desc: '4 × 10 min quarters' },
      { id: '3x3',      label: '3×3 Basketball',icon: 'numeric-3-box',       desc: 'Half court, 21 pts'  },
      { id: 'nba',      label: 'NBA Rules',     icon: 'star',                desc: '4 × 12 min quarters' },
      { id: '21pts',    label: '21 Points',     icon: 'counter',             desc: 'First to 21 wins'    },
    ],
  },
  tennis: {
    title: 'Select Format',
    subtitle: 'Choose match format',
    formats: [
      { id: 'bo3',      label: 'Best of 3',     icon: 'tennis',              desc: 'First to 2 sets'    },
      { id: 'bo5',      label: 'Best of 5',     icon: 'tennis',              desc: 'First to 3 sets'    },
      { id: 'tiebreak', label: 'Tie-Break',     icon: 'lightning-bolt',      desc: '10-point super TB'  },
      { id: 'fast4',    label: 'Fast4',         icon: 'flash',               desc: '4 games per set'    },
    ],
  },
  volleyball: {
    title: 'Select Format',
    subtitle: 'Choose format',
    formats: [
      { id: 'bo5',      label: 'Best of 5',     icon: 'volleyball',          desc: 'First to 3 sets'    },
      { id: 'bo3',      label: 'Best of 3',     icon: 'volleyball',          desc: 'First to 2 sets'    },
      { id: 'beach',    label: 'Beach 2v2',     icon: 'beach',               desc: 'Best of 3 sets'     },
    ],
  },
  badminton: {
    title: 'Select Format',
    subtitle: 'Choose match format',
    formats: [
      { id: 'bo3',      label: 'Best of 3',     icon: 'badminton',           desc: '21 pts per game'    },
      { id: 'bo5',      label: 'Best of 5',     icon: 'badminton',           desc: 'Tournament format'  },
      { id: 'singles',  label: 'Singles',       icon: 'account',             desc: '1v1 format'         },
      { id: 'doubles',  label: 'Doubles',       icon: 'account-multiple',    desc: '2v2 format'         },
    ],
  },
  tabletennis: {
    title: 'Select Format',
    subtitle: 'Choose match format',
    formats: [
      { id: 'bo7',      label: 'Best of 7',     icon: 'table-tennis',        desc: '11 pts per game'    },
      { id: 'bo5',      label: 'Best of 5',     icon: 'table-tennis',        desc: '11 pts per game'    },
      { id: 'bo3',      label: 'Best of 3',     icon: 'table-tennis',        desc: 'Quick format'       },
    ],
  },
  hockey: {
    title: 'Select Format',
    subtitle: 'Choose game format',
    formats: [
      { id: '4q',       label: 'Field Hockey',  icon: 'hockey-sticks',       desc: '4 × 15 min quarters'},
      { id: '2h',       label: '2 Halves',      icon: 'hockey-sticks',       desc: '2 × 35 min halves'  },
      { id: 'indoor',   label: 'Indoor Hockey', icon: 'home',                desc: '2 × 20 min halves'  },
      { id: 'mini',     label: 'Mini Hockey',   icon: 'hockey-sticks',       desc: 'Youth / friendly'   },
    ],
  },
  kabaddi: {
    title: 'Select Format',
    subtitle: 'Choose match format',
    formats: [
      { id: 'pro',      label: 'Pro Kabaddi',   icon: 'run-fast',            desc: '2 × 20 min halves'  },
      { id: 'amateur',  label: 'Amateur',       icon: 'run-fast',            desc: '2 × 15 min halves'  },
      { id: 'circle',   label: 'Circle Style',  icon: 'circle-outline',      desc: 'Traditional format' },
    ],
  },
  khokho: {
    title: 'Select Format',
    subtitle: 'Choose match format',
    formats: [
      { id: 'full',     label: 'Full Match',    icon: 'run',                 desc: '4 turns × 7 min'   },
      { id: 'super',    label: 'Super Kho-Kho', icon: 'flash',               desc: 'Fast-paced format'  },
    ],
  },
  boxing: {
    title: 'Select Rounds',
    subtitle: 'Choose number of rounds',
    formats: [
      { id: 'r12',      label: '12 Rounds',     icon: 'boxing-glove',        desc: 'Championship bout'  },
      { id: 'r10',      label: '10 Rounds',     icon: 'boxing-glove',        desc: 'Main event bout'    },
      { id: 'r8',       label: '8 Rounds',      icon: 'boxing-glove',        desc: 'Semi-main event'    },
      { id: 'r6',       label: '6 Rounds',      icon: 'boxing-glove',        desc: 'Undercard bout'     },
      { id: 'r4',       label: '4 Rounds',      icon: 'boxing-glove',        desc: 'Beginner bout'      },
    ],
  },
  karate: {
    title: 'Select Discipline',
    subtitle: 'Choose event type',
    formats: [
      { id: 'kumite',   label: 'Kumite',        icon: 'karate',              desc: 'Sparring match'     },
      { id: 'kata',     label: 'Kata',          icon: 'account',             desc: 'Forms & patterns'   },
      { id: 'team',     label: 'Team Kumite',   icon: 'account-group',       desc: '3v3 team sparring'  },
    ],
  },
  judo: {
    title: 'Select Format',
    subtitle: 'Choose bout duration',
    formats: [
      { id: '5m',       label: '5 Min Bout',    icon: 'human-handsup',       desc: 'Senior competition' },
      { id: '4m',       label: '4 Min Bout',    icon: 'human-handsup',       desc: 'Standard bout'      },
      { id: 'gs',       label: 'Golden Score',  icon: 'star',                desc: 'Sudden death OT'    },
    ],
  },
  wrestling: {
    title: 'Select Style',
    subtitle: 'Choose wrestling style',
    formats: [
      { id: 'freestyle',label: 'Freestyle',     icon: 'arm-flex-outline',    desc: '2 × 3 min periods'  },
      { id: 'greco',    label: 'Greco-Roman',   icon: 'arm-flex-outline',    desc: 'Upper body only'    },
      { id: 'beach',    label: 'Beach',         icon: 'beach',               desc: 'Outdoor format'     },
    ],
  },
  handball: {
    title: 'Select Format',
    subtitle: 'Choose game format',
    formats: [
      { id: 'full',     label: 'Full Match',    icon: 'handball',            desc: '2 × 30 min halves'  },
      { id: 'beach',    label: 'Beach Handball',icon: 'beach',               desc: 'Beach 2v2 format'   },
      { id: 'mini',     label: 'Mini Handball', icon: 'handball',            desc: 'Youth / friendly'   },
    ],
  },
  golf: {
    title: 'Select Format',
    subtitle: 'Choose round type',
    formats: [
      { id: '18',       label: '18 Holes',      icon: 'golf',                desc: 'Full stroke round'  },
      { id: '9',        label: '9 Holes',       icon: 'golf',                desc: 'Half round'         },
      { id: 'match',    label: 'Match Play',    icon: 'trophy-outline',      desc: 'Hole-by-hole win'   },
      { id: 'stroke',   label: 'Stroke Play',   icon: 'format-list-numbered',desc: 'Lowest total score' },
    ],
  },
  archery: {
    title: 'Select Discipline',
    subtitle: 'Choose archery type',
    formats: [
      { id: '70m',      label: '70m Recurve',   icon: 'bow-arrow',           desc: 'Olympic distance'   },
      { id: '50m',      label: '50m Field',     icon: 'bow-arrow',           desc: 'Standard distance'  },
      { id: '18m',      label: '18m Indoor',    icon: 'home',                desc: 'Indoor target'      },
      { id: 'compound', label: 'Compound',      icon: 'bow-arrow',           desc: 'Compound bow'       },
      { id: '3d',       label: '3D Archery',    icon: 'forest',              desc: 'Field course'       },
    ],
  },
  squash: {
    title: 'Select Format',
    subtitle: 'Choose match format',
    formats: [
      { id: 'bo5',      label: 'Best of 5',     icon: 'racquetball',         desc: 'Tournament format'  },
      { id: 'bo3',      label: 'Best of 3',     icon: 'racquetball',         desc: 'Quick match'        },
      { id: 'psa',      label: 'PSA Rules',     icon: 'star',                desc: 'Professional rules' },
    ],
  },
  pickleball: {
    title: 'Select Format',
    subtitle: 'Choose game format',
    formats: [
      { id: 'bo3',      label: 'Best of 3',     icon: 'tennis',              desc: 'Race to 11 per game'},
      { id: 'single',   label: 'Single Game',   icon: 'tennis',              desc: 'Race to 11 points'  },
      { id: 'doubles',  label: 'Doubles',       icon: 'account-multiple',    desc: '2v2 format'         },
      { id: 'singles',  label: 'Singles',       icon: 'account',             desc: '1v1 format'         },
    ],
  },
  billiards: {
    title: 'Select Game',
    subtitle: 'Choose billiards type',
    formats: [
      { id: 'snooker',  label: 'Snooker',       icon: 'billiards',           desc: '22 balls on table'  },
      { id: '8ball',    label: '8-Ball Pool',   icon: 'billiards',           desc: '15 balls, sink 8 last'},
      { id: '9ball',    label: '9-Ball Pool',   icon: 'billiards',           desc: 'Lowest numbered ball'},
      { id: 'carom',    label: 'Carom',         icon: 'billiards',           desc: 'No pockets'         },
    ],
  },
  snowboarding: {
    title: 'Select Discipline',
    subtitle: 'Choose event type',
    formats: [
      { id: 'halfpipe', label: 'Halfpipe',      icon: 'snowboard',           desc: 'Trick & style score'},
      { id: 'slopestyle',label: 'Slopestyle',   icon: 'snowboard',           desc: 'Rails & jumps'      },
      { id: 'bigair',   label: 'Big Air',       icon: 'snowboard',           desc: 'One big jump'       },
      { id: 'parallel', label: 'Parallel GS',   icon: 'snowboard',           desc: 'Side-by-side race'  },
    ],
  },
};

export const DEFAULT_FORMATS = {
  title: 'Select Format',
  subtitle: 'Choose game format',
  formats: [
    { id: 'standard', label: 'Standard',  icon: 'trophy-outline', desc: 'Regular format'   },
    { id: 'friendly', label: 'Friendly',  icon: 'handshake',      desc: 'Casual match'     },
    { id: 'custom',   label: 'Custom',    icon: 'tune',           desc: 'Custom settings'  },
  ],
};

export const getFormats = (id) => SPORT_FORMATS[id] || DEFAULT_FORMATS;

export default { SPORT_FORMATS, DEFAULT_FORMATS, getFormats };
