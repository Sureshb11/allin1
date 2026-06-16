import { defineSport } from '../_shape';

export default defineSport({
  id: 'judo',
  name: 'Judo',
  icon: 'karate',
  tag: 'Combat',
  accent: '#60a5fa',
  individual: true,
  competitorLabel: 'Fighter',
  feed: {
    accent: '#60a5fa',
    copy: { live: 'On the Tatami', results: 'Results & Bouts', community: 'The Dojo', compose: 'Share a judo moment' },
  },
});
