import { defineSport } from '../_shape';

export default defineSport({
  id: 'golf',
  name: 'Golf',
  icon: 'golf',
  tag: 'Links',
  accent: '#4ade80',
  individual: true,
  competitorLabel: 'Player',
  feed: {
    accent: '#4ade80',
    copy: { live: 'On the Course', results: 'Leaderboard', community: 'The Clubhouse', compose: 'Share a golf moment' },
  },
});
