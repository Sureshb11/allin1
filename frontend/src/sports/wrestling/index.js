import { defineSport } from '../_shape';

export default defineSport({
  id: 'wrestling',
  name: 'Wrestling',
  icon: 'arm-flex',
  tag: 'Combat',
  accent: '#f87171',
  individual: true,
  competitorLabel: 'Fighter',
  feed: {
    accent: '#f87171',
    copy: { live: 'On the Mat', results: 'Results & Bouts', community: 'Mat Talk', compose: 'Share a wrestling moment' },
  },
});
