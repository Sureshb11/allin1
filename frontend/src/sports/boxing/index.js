import { defineSport } from '../_shape';

export default defineSport({
  id: 'boxing',
  name: 'Boxing',
  icon: 'boxing-glove',
  tag: 'Combat',
  accent: '#ef4444',
  individual: true,
  competitorLabel: 'Fighter',
  feed: {
    accent: '#ef4444',
    copy: { live: 'In the Ring', results: 'Fight Card', community: 'Ringside', compose: 'Share a boxing moment' },
  },
});
