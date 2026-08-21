// Per-sport Scout / "Looking For" configuration.
// Defines the formats and subtypes (roles) for listings in each sport.

export const SCOUT_CONFIG = {
  cricket: {
    formats: ['Any','T20','T10','ODI','Test','The Hundred','Box/Turf'],
    subtypes: {
      player      : ['Batter','Bowler','Wicket-keeper','All-rounder'],
      team        : ['For a match','For a tournament','Net practice','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Club level','District level','Certified'],
      scorer      : ['Manual','Digital / App','Live stream'],
      coach       : ['Batting','Bowling','Fielding','Fitness','All-round'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Turf','Matting','Grass','Nets'],
      commentator : ['English','Regional','Live stream'],
    }
  },
  football: {
    formats: ['Any','11-a-side','7-a-side','5-a-side','Futsal'],
    subtypes: {
      player      : ['Striker','Midfielder','Defender','Goalkeeper'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  badminton: {
    formats: ['Any','Singles','Doubles','Mixed Doubles'],
    subtypes: {
      player      : ['Singles','Doubles'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  tennis: {
    formats: ['Any','Singles','Doubles','Mixed Doubles'],
    subtypes: {
      player      : ['Singles','Doubles'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  tabletennis: {
    formats: ['Any','Singles','Doubles','Mixed Doubles'],
    subtypes: {
      player      : ['Singles','Doubles'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  squash: {
    formats: ['Any','Singles','Doubles'],
    subtypes: {
      player      : ['Singles'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  pickleball: {
    formats: ['Any','Singles','Doubles','Mixed Doubles'],
    subtypes: {
      player      : ['Singles','Doubles'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  basketball: {
    formats: ['Any','5v5','3x3'],
    subtypes: {
      player      : ['Guard','Forward','Center'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  kabaddi: {
    formats: ['Any','Standard Style','Circle Style'],
    subtypes: {
      player      : ['Raider','Defender','All-rounder'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  hockey: {
    formats: ['Any','11-a-side','5-a-side','Indoor'],
    subtypes: {
      player      : ['Forward','Midfielder','Defender','Goalkeeper'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  volleyball: {
    formats: ['Any','Indoor (6v6)','Beach (2v2)'],
    subtypes: {
      player      : ['Setter','Spiker','Libero','Blocker'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  handball: {
    formats: ['Any','Indoor','Beach'],
    subtypes: {
      player      : ['Goalkeeper','Back','Wing','Pivot'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  khokho: {
    formats: ['Any','Standard'],
    subtypes: {
      player      : ['Chaser','Runner','Defender'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  boxing: {
    formats: ['Any','Amateur','Professional'],
    subtypes: {
      player      : ['Lightweight','Welterweight','Middleweight','Heavyweight'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  wrestling: {
    formats: ['Any','Freestyle','Greco-Roman'],
    subtypes: {
      player      : ['Freestyle','Greco-Roman'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  judo: {
    formats: ['Any','Shiai','Kata'],
    subtypes: {
      player      : ['Lightweight','Middleweight','Heavyweight'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  karate: {
    formats: ['Any','Kumite','Kata'],
    subtypes: {
      player      : ['Kumite','Kata'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
  skateboard: {
    formats: ['Any','Street','Park','Vert'],
    subtypes: {
      player      : ['Street','Park','Vert'],
      team        : ['For a match','For a tournament','Regular squad'],
      opponent    : ['Friendly','Practice match','League','Tournament'],
      umpire      : ['Referee / Umpire'],
      scorer      : ['Scorer'],
      coach       : ['Coach'],
      tournament  : ['To join','Corporate','Community','Youth'],
      teamtourn   : ['League','Knockout','Corporate','Community'],
      ground      : ['Ground / Court'],
      commentator : ['Commentator'],
    }
  },
};

export const getScout = (sport) => SCOUT_CONFIG[sport] || {
  formats: ['Any', 'Friendly', 'Competitive', 'Tournament'],
  subtypes: {
    player:      ['Player'],
    team:        ['For a match', 'For a tournament', 'Regular squad'],
    opponent:    ['Friendly', 'Practice match', 'League', 'Tournament'],
    umpire:      ['Referee / Umpire'],
    scorer:      ['Scorer'],
    coach:       ['Coach'],
    tournament:  ['To join', 'Corporate', 'Community', 'Youth'],
    teamtourn:   ['League', 'Knockout', 'Corporate', 'Community'],
    ground:      ['Ground / Court'],
    commentator: ['Commentator'],
  }
};

export default { SCOUT_CONFIG, getScout };
