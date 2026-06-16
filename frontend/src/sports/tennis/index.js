import { defineSport } from '../_shape';

export default defineSport({
  id: 'tennis',
  name: 'Tennis',
  icon: 'tennis',
  tag: 'Racquet',
  accent: '#65a30d',
  individual: true,
  competitorLabel: 'Player',
  feed: {
    accent: '#bef264',
    scoreUnit: 'sets',
    copy: { live: 'On Court', results: 'Results & Draw', community: 'Baseline Banter', compose: 'Share a tennis moment' },
  },
});
