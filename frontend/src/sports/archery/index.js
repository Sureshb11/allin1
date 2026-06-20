import { defineSport } from '../_shape';

export default defineSport({
  id: 'archery',
  name: 'Archery & Shooting',
  icon: 'bow-arrow',
  tag: 'Target',
  accent: '#a3e635',
  individual: true,
  competitorLabel: 'Player',
  feed: {
    accent: '#a3e635',
    scoreUnit: 'pts',
    copy: { live: 'On the Range', results: 'Results & Ends', community: 'The Range', compose: 'Share an archery moment' },
  },
});
