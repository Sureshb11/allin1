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
    types: [OUTDOOR, INDOOR, { key: 'box_cricket', label: 'Box Cricket', icon: 'cube-outline' }, STADIUM, { key: 'nets', label: 'Nets', icon: 'tennis' }, ACADEMY],
    surfaces: [TURF, GRASS, MATTING, CONCRETE, SYNTHETIC, CLAY],
    categories: ['Cricket Ground', 'Sports Complex', 'Stadium', 'Academy', 'Private Ground', 'Community Ground'],
    ballTypes: [{ key: 'leather', label: 'Leather' }, { key: 'tennis', label: 'Tennis' }, { key: 'soft', label: 'Soft' }, { key: 'tape', label: 'Tape' }],
    fields: [
      { key: 'groundType', label: 'Ground Type', type: 'select', options: ['outdoor', 'indoor', 'box_cricket', 'stadium', 'nets', 'academy'] },
      { key: 'format', label: 'Format', type: 'multi-select', options: ['T20', 'ODI', 'Test', 'T10', 'Box Cricket'] },
      { key: 'pitchType', label: 'Pitch Type', type: 'select', options: ['Turf', 'Matting', 'Cement', 'Artificial'] },
      { key: 'pitchCount', label: 'Number of Pitches', type: 'number' },
      { key: 'pitchLength', label: 'Pitch Length (Yards)', type: 'number' },
      { key: 'boundary', label: 'Boundary Size (Meters)', type: 'number' }
    ],
    pricingUnits: [{ value: 'PER_GROUND_HOUR', label: 'Per Ground / Hour' }, { value: 'PER_MATCH', label: 'Per Match' }],
    facilities: ['Nets', 'Bowling Machine', 'Scoreboard', 'Floodlights']
  },
  football: {
    ...FIELD_SPORT,
    categories: ['Football Ground', 'Stadium', 'Turf Arena', 'Sports Complex', 'Academy'],
    fields: [
      { key: 'format', label: 'Format', type: 'select', options: ['11v11', '9v9', '7v7', '5v5'] },
      { key: 'fieldType', label: 'Field Type', type: 'select', options: ['Outdoor', 'Indoor Turf'] },
      { key: 'surface', label: 'Surface', type: 'select', options: ['Natural Grass', 'Artificial Turf', 'Mud'] },
      { key: 'dimensions', label: 'Dimensions', type: 'text' }
    ],
    pricingUnits: [{ value: 'PER_GROUND_HOUR', label: 'Per Ground / Hour' }],
    facilities: ['Goal Posts', 'Floodlights', 'Changing Room', 'Scoreboard']
  },
  badminton: {
    ...COURT_SPORT(),
    fields: [
      { key: 'courtCount', label: 'Number of Courts', type: 'number' },
      { key: 'surface', label: 'Court Surface', type: 'select', options: ['Wooden', 'Synthetic', 'Cement', 'Rubber'] },
      { key: 'indoorOutdoor', label: 'Indoor/Outdoor', type: 'select', options: ['Indoor', 'Outdoor'] }
    ],
    pricingUnits: [{ value: 'PER_COURT_HOUR', label: 'Per Court / Hour' }],
    facilities: ['AC', 'Lighting', 'Equipment Rental']
  },
  basketball: {
    types: [OUTDOOR, INDOOR, COURT, ACADEMY], surfaces: [SYNTHETIC, WOOD, CONCRETE, ACRYLIC],
    categories: ['Basketball Court', 'Sports Complex', 'Academy', 'Community Ground'], ballTypes: [],
    fields: [
      { key: 'courtCount', label: 'Number of Courts', type: 'number' },
      { key: 'surface', label: 'Court Surface', type: 'select', options: ['Wooden', 'Synthetic', 'Concrete', 'Acrylic'] },
      { key: 'indoorOutdoor', label: 'Indoor/Outdoor', type: 'select', options: ['Indoor', 'Outdoor'] }
    ],
    pricingUnits: [{ value: 'PER_COURT_HOUR', label: 'Per Court / Hour' }],
    facilities: ['Hoops', 'Lighting', 'Scoreboard']
  },
  boxing: {
    ...COMBAT,
    fields: [
      { key: 'venueType', label: 'Venue Type', type: 'select', options: ['Ring', 'Training Center', 'Gym'] },
      { key: 'trainer', label: 'Trainer Available', type: 'toggle' }
    ],
    pricingUnits: [{ value: 'PER_SESSION', label: 'Per Session' }],
    facilities: ['Bags', 'Training Equipment', 'Locker Room']
  },
  hockey: {
    ...FIELD_SPORT, surfaces: [TURF, SYNTHETIC, GRASS, CONCRETE],
    fields: [
      { key: 'fieldCount', label: 'Number of Fields', type: 'number' },
      { key: 'surface', label: 'Surface', type: 'select', options: ['Astroturf', 'Grass', 'Synthetic'] }
    ],
    pricingUnits: [{ value: 'PER_GROUND_HOUR', label: 'Per Ground / Hour' }],
    facilities: ['Goal Posts', 'Floodlights', 'Changing Room']
  },
  kabaddi: {
    types: [INDOOR, OUTDOOR, HALL, ACADEMY], surfaces: [MAT_FLOOR, MUD, SYNTHETIC],
    categories: ['Kabaddi Ground', 'Sports Complex', 'Academy', 'Community Ground'], ballTypes: [],
    fields: [
      { key: 'courtCount', label: 'Number of Courts', type: 'number' },
      { key: 'surface', label: 'Surface', type: 'select', options: ['Mud', 'Mat', 'Synthetic'] },
      { key: 'indoorOutdoor', label: 'Indoor/Outdoor', type: 'select', options: ['Indoor', 'Outdoor'] }
    ],
    pricingUnits: [{ value: 'PER_GROUND_HOUR', label: 'Per Ground / Hour' }],
    facilities: ['Mats', 'Scoreboard']
  },
  khokho: {
    types: [OUTDOOR, INDOOR, ACADEMY], surfaces: [MUD, GRASS, SYNTHETIC, MAT_FLOOR],
    categories: ['Ground', 'Sports Complex', 'Academy', 'Community Ground'], ballTypes: [],
    fields: [
      { key: 'groundCount', label: 'Number of Grounds', type: 'number' },
      { key: 'surface', label: 'Surface', type: 'select', options: ['Mud', 'Grass', 'Synthetic'] }
    ],
    pricingUnits: [{ value: 'PER_GROUND_HOUR', label: 'Per Ground / Hour' }],
    facilities: ['Floodlights']
  },
  handball: {
    ...FIELD_SPORT, surfaces: [SYNTHETIC, CONCRETE, WOOD, GRASS],
    fields: [
      { key: 'courtCount', label: 'Number of Courts', type: 'number' },
      { key: 'surface', label: 'Surface', type: 'select', options: ['Synthetic', 'Concrete', 'Wooden', 'Grass'] }
    ],
    pricingUnits: [{ value: 'PER_COURT_HOUR', label: 'Per Court / Hour' }],
    facilities: ['Goal Posts', 'Scoreboard']
  },
  judo: {
    ...COMBAT,
    fields: [
      { key: 'matCount', label: 'Number of Mats', type: 'number' },
      { key: 'matType', label: 'Mat Type', type: 'select', options: ['Tatami', 'Foam', 'Rubber'] }
    ],
    pricingUnits: [{ value: 'PER_CLASS', label: 'Per Class' }],
    facilities: ['Training Area', 'Trainer', 'Locker Room']
  },
  karate: {
    ...COMBAT,
    fields: [
      { key: 'matCount', label: 'Number of Mats', type: 'number' }
    ],
    pricingUnits: [{ value: 'PER_CLASS', label: 'Per Class' }],
    facilities: ['Training Area', 'Equipment', 'Trainer']
  },
  pickleball: {
    ...COURT_SPORT(),
    fields: [
      { key: 'courtCount', label: 'Number of Courts', type: 'number' },
      { key: 'surface', label: 'Surface', type: 'select', options: ['Hard', 'Synthetic'] }
    ],
    pricingUnits: [{ value: 'PER_COURT_HOUR', label: 'Per Court / Hour' }],
    facilities: ['Lighting', 'Paddle Rental']
  },
  squash: {
    types: [INDOOR, COURT, ACADEMY], surfaces: [WOOD, SYNTHETIC],
    categories: ['Squash Court', 'Sports Complex', 'Club', 'Academy'], ballTypes: [],
    fields: [
      { key: 'courtCount', label: 'Number of Courts', type: 'number' },
      { key: 'glassBackWall', label: 'Glass Back Wall', type: 'toggle' }
    ],
    pricingUnits: [{ value: 'PER_COURT_HOUR', label: 'Per Court / Hour' }],
    facilities: ['AC', 'Lighting', 'Equipment Rental']
  },
  tabletennis: {
    types: [INDOOR, HALL, ACADEMY], surfaces: [WOOD, SYNTHETIC, CONCRETE],
    categories: ['Table Tennis Hall', 'Sports Complex', 'Academy', 'Club'], ballTypes: [],
    fields: [
      { key: 'tableCount', label: 'Number of Tables', type: 'number' },
      { key: 'tableType', label: 'Table Type', type: 'select', options: ['Indoor', 'Outdoor', 'Professional'] }
    ],
    pricingUnits: [{ value: 'PER_TABLE_HOUR', label: 'Per Table / Hour' }],
    facilities: ['AC', 'Equipment Rental']
  },
  tennis: {
    ...COURT_SPORT([CLAY, GRASS]),
    fields: [
      { key: 'courtCount', label: 'Number of Courts', type: 'number' },
      { key: 'surface', label: 'Surface', type: 'select', options: ['Hard', 'Clay', 'Grass', 'Synthetic'] }
    ],
    pricingUnits: [{ value: 'PER_COURT_HOUR', label: 'Per Court / Hour' }],
    facilities: ['Floodlights', 'Ball Machine', 'Equipment Rental']
  },
  volleyball: {
    types: [OUTDOOR, INDOOR, COURT, ACADEMY], surfaces: [SYNTHETIC, WOOD, { key: 'sand', label: 'Sand' }, CONCRETE],
    categories: ['Volleyball Court', 'Sports Complex', 'Academy', 'Community Ground'], ballTypes: [],
    fields: [
      { key: 'courtCount', label: 'Number of Courts', type: 'number' },
      { key: 'surface', label: 'Surface', type: 'select', options: ['Sand', 'Synthetic', 'Wooden', 'Concrete'] }
    ],
    pricingUnits: [{ value: 'PER_COURT_HOUR', label: 'Per Court / Hour' }],
    facilities: ['Net', 'Lighting', 'Scoreboard']
  },
  wrestling: {
    ...COMBAT,
    fields: [
      { key: 'matCount', label: 'Number of Mats', type: 'number' },
      { key: 'matType', label: 'Mat Type', type: 'select', options: ['Foam', 'Rubber'] }
    ],
    pricingUnits: [{ value: 'PER_CLASS', label: 'Per Class' }],
    facilities: ['Trainer', 'Locker Room']
  },
  skateboard: {
    types: [OUTDOOR, { key: 'skatepark', label: 'Skatepark', icon: 'skateboard' }, INDOOR],
    surfaces: [CONCRETE, WOOD, SYNTHETIC],
    categories: ['Skatepark', 'Sports Complex', 'Community Ground'], ballTypes: [],
    fields: [
      { key: 'venueType', label: 'Venue Type', type: 'select', options: ['Indoor', 'Outdoor'] }
    ],
    pricingUnits: [{ value: 'PER_SESSION', label: 'Per Session' }],
    facilities: ['Bowl', 'Half pipe', 'Ramps', 'Rails', 'Equipment Rental']
  },
  rummy: {
    types: [INDOOR, HALL], surfaces: [], categories: ['Club', 'Community Centre'], ballTypes: [],
    fields: [],
    pricingUnits: [],
    facilities: []
  }
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
