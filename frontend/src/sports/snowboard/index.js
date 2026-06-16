import { defineSport } from '../_shape';

export default defineSport({
  id: 'snowboard',
  name: 'Snowboarding',
  icon: 'snowboard',
  tag: 'Snow',
  accent: '#7dd3fc',
  individual: true,
  competitorLabel: 'Rider',
  feed: {
    accent: '#7dd3fc',
    copy: { live: 'On the Slopes', results: 'Results & Runs', community: 'The Base Lodge', compose: 'Share a snowboarding moment' },
  },
});
