// SportIcon.js — renders the best-fit MaterialCommunityIcons glyph for a sport.
// The sport registry (src/sports/<id>/index.js → `icon`) is the single source of
// truth, so every screen shows the same icon. A local map mirrors those names as
// a fallback for ids that aren't in the registry (and documents the full set).
// Colour + size flow straight through to the icon font.
//
//   <SportIcon id="cricket" size={34} color="#c4f82a" />

import React from 'react';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getSport } from '../sports';

// Canonical MaterialCommunityIcons name per sport. A few sports have no exact MCI
// glyph, so they reuse the closest recognizable one:
//   squash → racquetball · pickleball → table-tennis (paddle) · judo → karate
//   wrestling → arm-flex · kabaddi/kho-kho → running figures.
const MCI = {
  cricket: 'cricket', football: 'soccer', kabaddi: 'run-fast', hockey: 'hockey-sticks',
  badminton: 'badminton', tennis: 'tennis', basketball: 'basketball', volleyball: 'volleyball',
  boxing: 'boxing-glove', wrestling: 'arm-flex', tabletennis: 'table-tennis', khokho: 'run',
  handball: 'handball', squash: 'racquetball', pickleball: 'table-tennis', judo: 'karate',
  karate: 'karate', golf: 'golf', archery: 'bow-arrow', bowling: 'bowling',
  skateboard: 'skateboard', rummy: 'cards-playing-outline',
};

export default function SportIcon({ id, size = 34, color = '#c4f82a', style }) {
  const name = getSport(id)?.icon || MCI[id] || 'trophy-variant-outline';
  return <Icon name={name} size={size} color={color} style={style} />;
}
