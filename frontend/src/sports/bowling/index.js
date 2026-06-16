import { defineSport } from '../_shape';

export default defineSport({
  id: 'bowling',
  name: 'Bowling & Billiards',
  icon: 'bowling',
  tag: 'Precision',
  accent: '#34d399',
  individual: true,
  competitorLabel: 'Player',
  feed: {
    accent: '#34d399',
    copy: { live: 'At the Table', results: 'Results & Frames', community: 'The Break Room', compose: 'Share a moment' },
  },
});
