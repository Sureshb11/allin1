import { defineSport } from '../_shape';

export default defineSport({
  id: 'badminton',
  name: 'Badminton',
  icon: 'badminton',
  tag: 'Racquet',
  accent: '#0d9488',
  individual: true,
  competitorLabel: 'Player',
  feed: {
    accent: '#2dd4bf',
    scoreUnit: 'games',
    copy: { live: 'On Court', results: 'Results & Fixtures', community: 'Court-side', compose: 'Share a badminton moment' },
  },
});
