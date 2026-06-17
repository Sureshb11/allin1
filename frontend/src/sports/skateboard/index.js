import { defineSport } from '../_shape';

export default defineSport({
  id: 'skateboard',
  name: 'Skateboarding',
  icon: 'skateboard',
  tag: 'Street',
  accent: '#fb923c',
  individual: true,
  competitorLabel: 'Skater',
  feed: {
    accent: '#fb923c',
    copy: { live: 'At the Park', results: 'Results & Runs', community: 'The Skate Spot', compose: 'Share a skate moment' },
  },
});
