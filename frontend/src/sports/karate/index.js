import { defineSport } from '../_shape';

export default defineSport({
  id: 'karate',
  name: 'Karate',
  icon: 'karate',
  tag: 'Combat',
  accent: '#fb7185',
  individual: true,
  competitorLabel: 'Fighter',
  feed: {
    accent: '#fb7185',
    copy: { live: 'On the Tatami', results: 'Results & Bouts', community: 'Dojo Talk', compose: 'Share a karate moment' },
  },
});
