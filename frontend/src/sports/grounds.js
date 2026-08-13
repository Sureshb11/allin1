// Per-sport venue vocabulary for GroundsScreen's add form and filters.
//
// These lists were hardcoded in the screen, and they were cricket's: a
// badminton club adding their hall picked between "Box Cricket" and "Nets",
// chose a "Cricket Ground" category, and was asked which BALL TYPE — leather,
// tennis, soft or tape — the hall used. The columns behind them are generic
// (Ground.groundType / category / playingSurface / ballTypes are all free
// strings), so only the offered options were ever cricket-shaped.
//
// Same shape as find.js and formats.js: a table keyed by sport, a getter with a
// safe fallback, and a sport is added by adding a line. Anything not listed
// gets GENERIC, which is deliberately plain rather than cricket's — a sport
// nobody has configured should not be asked about pitch matting.

// Shared by most sports; only the odd one out overrides.
const OUTDOOR = { key: 'outdoor', label: 'Outdoor', icon: 'weather-sunny' };
const INDOOR = { key: 'indoor', label: 'Indoor', icon: 'home-city' };
const STADIUM = { key: 'stadium', label: 'Stadium', icon: 'stadium' };
const ACADEMY = { key: 'academy', label: 'Academy', icon: 'school' };
const COURT = { key: 'court', label: 'Court', icon: 'tennis' };
const HALL = { key: 'hall', label: 'Sports hall', icon: 'home-city' };
const MAT_VENUE = { key: 'mat_hall', label: 'Mat hall', icon: 'karate' };
const RING = { key: 'ring', label: 'Ring', icon: 'boxing-glove' };
const POOL = { key: 'pool', label: 'Pool', icon: 'pool' };

// Surfaces are the thing that varies most, because it is the thing a player
// actually wants to know before turning up.
const TURF = { key: 'turf', label: 'Turf' };
const GRASS = { key: 'grass', label: 'Grass' };
const MATTING = { key: 'mat', label: 'Matting' };
const CONCRETE = { key: 'concrete', label: 'Concrete' };
const SYNTHETIC = { key: 'synthetic', label: 'Synthetic' };
const CLAY = { key: 'clay', label: 'Clay' };
const WOOD = { key: 'wooden', label: 'Wooden' };
const ACRYLIC = { key: 'acrylic', label: 'Acrylic' };
const MUD = { key: 'mud', label: 'Mud' };
const MAT_FLOOR = { key: 'mat_floor', label: 'Mats' };

const COURT_SPORT = (extraSurfaces = []) => ({
  types: [INDOOR, OUTDOOR, COURT, ACADEMY],
  surfaces: [SYNTHETIC, WOOD, CONCRETE, ACRYLIC, ...extraSurfaces],
  categories: ['Court', 'Sports Complex', 'Academy', 'Club', 'Community Centre'],
  // Cricket is the only one of these that plays with different balls at
  // amateur level in a way that changes which venue you want.
  ballTypes: [],
});

const COMBAT = {
  types: [MAT_VENUE, HALL, ACADEMY, RING],
  surfaces: [MAT_FLOOR, SYNTHETIC, WOOD],
  categories: ['Academy', 'Sports Complex', 'Club', 'Community Centre'],
  ballTypes: [],
};

const FIELD_SPORT = {
  types: [OUTDOOR, STADIUM, INDOOR, ACADEMY],
  surfaces: [GRASS, TURF, SYNTHETIC, MUD, CONCRETE],
  categories: ['Ground', 'Stadium', 'Sports Complex', 'Academy', 'Community Ground'],
  ballTypes: [],
};

export const GROUND_CONFIG = {
  cricket: {
    types: [OUTDOOR, INDOOR, { key: 'box_cricket', label: 'Box Cricket', icon: 'cube-outline' },
            STADIUM, { key: 'nets', label: 'Nets', icon: 'tennis' }, ACADEMY],
    surfaces: [TURF, GRASS, MATTING, CONCRETE, SYNTHETIC, CLAY],
    categories: ['Cricket Ground', 'Sports Complex', 'Stadium', 'Academy', 'Private Ground', 'Community Ground'],
    // The one sport here where the ball genuinely decides the venue.
    ballTypes: [
      { key: 'leather', label: 'Leather' }, { key: 'tennis', label: 'Tennis' },
      { key: 'soft', label: 'Soft' }, { key: 'tape', label: 'Tape' },
    ],
  },
  football:   { ...FIELD_SPORT, categories: ['Football Ground', 'Stadium', 'Turf Arena', 'Sports Complex', 'Academy'] },
  hockey:     { ...FIELD_SPORT, surfaces: [TURF, SYNTHETIC, GRASS, CONCRETE] },
  kabaddi:    { types: [INDOOR, OUTDOOR, HALL, ACADEMY], surfaces: [MAT_FLOOR, MUD, SYNTHETIC],
                categories: ['Kabaddi Ground', 'Sports Complex', 'Academy', 'Community Ground'], ballTypes: [] },
  khokho:     { types: [OUTDOOR, INDOOR, ACADEMY], surfaces: [MUD, GRASS, SYNTHETIC, MAT_FLOOR],
                categories: ['Ground', 'Sports Complex', 'Academy', 'Community Ground'], ballTypes: [] },
  handball:   { ...FIELD_SPORT, surfaces: [SYNTHETIC, CONCRETE, WOOD, GRASS] },

  badminton:   COURT_SPORT(),
  tabletennis: { types: [INDOOR, HALL, ACADEMY], surfaces: [WOOD, SYNTHETIC, CONCRETE],
                 categories: ['Table Tennis Hall', 'Sports Complex', 'Academy', 'Club'], ballTypes: [] },
  squash:      { types: [INDOOR, COURT, ACADEMY], surfaces: [WOOD, SYNTHETIC],
                 categories: ['Squash Court', 'Sports Complex', 'Club', 'Academy'], ballTypes: [] },
  tennis:      COURT_SPORT([CLAY, GRASS]),
  pickleball:  COURT_SPORT(),
  volleyball:  { types: [OUTDOOR, INDOOR, COURT, ACADEMY], surfaces: [SYNTHETIC, WOOD, { key: 'sand', label: 'Sand' }, CONCRETE],
                 categories: ['Volleyball Court', 'Sports Complex', 'Academy', 'Community Ground'], ballTypes: [] },
  basketball:  { types: [OUTDOOR, INDOOR, COURT, ACADEMY], surfaces: [SYNTHETIC, WOOD, CONCRETE, ACRYLIC],
                 categories: ['Basketball Court', 'Sports Complex', 'Academy', 'Community Ground'], ballTypes: [] },

  boxing:    COMBAT,
  wrestling: COMBAT,
  judo:      COMBAT,
  karate:    COMBAT,

  skateboard: { types: [OUTDOOR, { key: 'skatepark', label: 'Skatepark', icon: 'skateboard' }, INDOOR],
                surfaces: [CONCRETE, WOOD, SYNTHETIC],
                categories: ['Skatepark', 'Sports Complex', 'Community Ground'], ballTypes: [] },
  rummy:      { types: [INDOOR, HALL], surfaces: [], categories: ['Club', 'Community Centre'], ballTypes: [] },
};

// Not cricket's — a sport nobody has configured yet should be asked plain
// questions, not cricket's ones with the labels left on.
const GENERIC = {
  types: [OUTDOOR, INDOOR, STADIUM, ACADEMY],
  surfaces: [GRASS, SYNTHETIC, CONCRETE, WOOD],
  categories: ['Ground', 'Sports Complex', 'Stadium', 'Academy', 'Community Ground'],
  ballTypes: [],
};

// Amenities are a property of the building, not the game played in it.
export const AMENITY_OPTIONS = [
  'Flood Lights', 'Parking', 'Washroom', 'Drinking Water', 'Dressing Room',
  'Seating', 'Canteen', 'First Aid', 'WiFi', 'Sound System',
];

/** Venue vocabulary for a sport; never throws, never returns cricket's by accident. */
export const getGroundConfig = (sport) => GROUND_CONFIG[sport] || GENERIC;

export default { GROUND_CONFIG, AMENITY_OPTIONS, getGroundConfig };
