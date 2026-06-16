import { defineSport } from '../_shape';

export default defineSport({
  id: 'rummy',
  name: 'Rummy',
  icon: 'cards-playing-outline',
  tag: '13 Cards',
  accent: '#c4f82a',
  // Rummy has its own dedicated flow instead of the shared feed/scoring screens.
  custom: { homeRoute: 'RummyHome' },
});
