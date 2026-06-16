// SportDefinition shape + helper.
//
// A sport is described by ONE file: src/sports/<id>/index.js, which calls
// defineSport({...}). That single source of truth feeds every shared screen
// (picker, dashboard, setup, live scoring, find). Adding a sport = add a folder.
//
// Domains (all optional — a sport can fill in only what it needs):
//   meta:      id, name, icon (MaterialCommunityIcons), tag, color, accent
//   formats:   match formats           → SportSetupScreen
//   scoring:   { periods, maxPeriods, actions, extras, scoreLabel, oversLabel }
//                                        → SportScoringScreen
//   dashboard: { ctaSubtitle, navTabs, quickAccess, features } → HomeScreen
//   find:      { title, roles }         → FindCricketersScreen
//   start:     start-match config       → StartMatchScreen
//   custom:    { homeRoute }            → sports with dedicated screens (e.g. Rummy)

export const defineSport = (def) => ({
  // meta
  id: def.id,
  name: def.name,
  icon: def.icon || 'trophy-outline',
  tag: def.tag || '',
  color: def.color || '#22c55e',
  accent: def.accent || '#abd600',
  // individual (1v1) sports: each "team" slot is a single competitor/player.
  // Shared screens read these to relabel "Team" → "Player", etc.
  individual: def.individual || false,
  competitorLabel: def.competitorLabel || 'Team',
  // domains default to null so consumers can fall back to their generic config
  formats: def.formats || null,
  scoring: def.scoring || null,
  dashboard: def.dashboard || null,
  find: def.find || null,
  start: def.start || null,
  custom: def.custom || null,
  // Optional themed-feed overrides for the shared SportFeed template:
  //   { accent, scoreUnit, copy: { live, results, community, compose } }
  // Anything omitted auto-derives (accent ← scoring colour; default copy).
  feed: def.feed || null,
});
