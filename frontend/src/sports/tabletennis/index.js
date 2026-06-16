import { defineSport } from '../_shape';

export default defineSport({
  id: 'tabletennis',
  name: 'Table Tennis',
  icon: 'table-tennis',
  tag: 'Paddle',
  accent: '#a78bfa',
  individual: true,
  competitorLabel: 'Player',
  feed: {
    accent: '#a78bfa',
    scoreUnit: 'games',
    copy: { live: 'On the Table', results: 'Results & Draw', community: 'Around the Table', compose: 'Share a table tennis moment' },
  },
});
