// data.jsx — sport list, honeycomb hex-spiral layout, design tokens.
// Plain <script type="text/babel"> → top-level decls are global; we also
// mirror onto window so consumers can destructure defensively.

const ARENA = {
  navy0: '#0a0e18',
  navy1: '#0d1320',
  navy2: '#111a2b',
  cell:  '#161f30',
  cellHi:'#1d2942',
  line:  'rgba(150,180,230,0.10)',
  ink:   '#eaf0fb',
  inkDim:'#8a97ב0',
  lime:  '#c4f82a',
  lime2: '#a6e814',
  limeDim:'#7d9e3a',
  glow:  'rgba(196,248,42,0.55)',
};
// fix accidental char
ARENA.inkDim = '#8a97b0';

// Sports — index 0 is the focal point (Cricket), then rings outward.
const SPORTS = [
  { id: 'cricket',   name: 'Cricket',    tag: 'Bat & Ball',      featured: true },
  { id: 'football',  name: 'Football',   tag: '11-a-side' },
  { id: 'kabaddi',   name: 'Kabaddi',    tag: 'Raid & Tackle' },
  { id: 'hockey',    name: 'Hockey',     tag: 'Field' },
  { id: 'badminton', name: 'Badminton',  tag: 'Racquet' },
  { id: 'tennis',    name: 'Tennis',     tag: 'Racquet' },
  { id: 'basketball',name: 'Basketball', tag: 'Court' },
  { id: 'volleyball',name: 'Volleyball', tag: 'Court' },
  { id: 'boxing',    name: 'Boxing',     tag: 'Combat' },
  { id: 'wrestling', name: 'Wrestling',  tag: 'Combat' },
  { id: 'tabletennis',name:'Table Tennis',tag:'Paddle' },
  { id: 'khokho',    name: 'Kho-Kho',    tag: 'Chase' },
  { id: 'handball',  name: 'Handball',   tag: 'Court' },
  { id: 'squash',    name: 'Squash',     tag: 'Racquet' },
  { id: 'pickleball',name: 'Pickleball', tag: 'Paddle' },
  { id: 'judo',      name: 'Judo',       tag: 'Combat' },
  { id: 'karate',    name: 'Karate',     tag: 'Combat' },
  { id: 'golf',      name: 'Golf',       tag: 'Links' },
  { id: 'archery',   name: 'Archery & Shooting', tag: 'Target' },
  { id: 'bowling',   name: 'Bowling & Billiards', tag: 'Precision' },
  { id: 'snowboard', name: 'Snowboarding',tag: 'Snow' },
  { id: 'rummy',     name: 'Rummy',       tag: '13 Cards', scored: true },
];

// ── Hex spiral (axial coords, center first) ──────────────────────────
function hexRing(radius) {
  if (radius === 0) return [{ q: 0, r: 0 }];
  const dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const out = [];
  let q = dirs[4][0] * radius, r = dirs[4][1] * radius;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      out.push({ q, r });
      q += dirs[i][0]; r += dirs[i][1];
    }
  }
  return out;
}
function hexSpiral(n) {
  const out = [];
  for (let radius = 0; out.length < n; radius++) out.push(...hexRing(radius));
  return out.slice(0, n);
}
// axial → pixel (flat rows, equal neighbour distance = `size`)
function axialToXY(q, r, size) {
  return { x: size * (q + r / 2), y: size * (Math.sqrt(3) / 2) * r };
}

// Build positioned cells — a compact, balanced honeycomb BLOB (not a spiral),
// so every cell stays adjacent to the cluster with no stragglers. Fills whole
// rings first, then spreads any remainder evenly around the next ring.
function layoutHoney(size) {
  const n = SPORTS.length;
  let cells = [];
  for (let radius = 0; cells.length < n; radius++) {
    const ring = hexRing(radius);
    if (cells.length + ring.length <= n) {
      cells = cells.concat(ring);
    } else {
      const need = n - cells.length;
      const step = ring.length / need;
      for (let i = 0; i < need; i++) cells.push(ring[Math.round(i * step) % ring.length]);
    }
  }
  return SPORTS.map((s, i) => {
    const { x, y } = axialToXY(cells[i].q, cells[i].r, size);
    return { ...s, x, y, ring: Math.max(Math.abs(cells[i].q), Math.abs(cells[i].r), Math.abs(cells[i].q + cells[i].r)) };
  });
}

Object.assign(window, { ARENA, SPORTS, hexSpiral, axialToXY, layoutHoney });
