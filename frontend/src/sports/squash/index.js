import { defineSport } from '../_shape';

export default defineSport({
  id: 'squash',
  name: 'Squash',
  icon: 'racquetball',
  tag: 'Racquet',
  accent: '#c084fc',
  individual: true,
  competitorLabel: 'Player',
  feed: {
    accent: '#c084fc',
    scoreUnit: 'games',
    copy: { live: 'On Court', results: 'Results & Draw', community: 'Glass Court', compose: 'Share a squash moment' },
  },
});
