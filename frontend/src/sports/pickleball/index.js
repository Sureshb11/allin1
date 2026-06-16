import { defineSport } from '../_shape';

export default defineSport({
  id: 'pickleball',
  name: 'Pickleball',
  icon: 'table-tennis',
  tag: 'Paddle',
  accent: '#fbbf24',
  individual: true,
  competitorLabel: 'Player',
  feed: {
    accent: '#fbbf24',
    scoreUnit: 'games',
    copy: { live: 'On Court', results: 'Results & Draw', community: 'The Dink Zone', compose: 'Share a pickleball moment' },
  },
});
