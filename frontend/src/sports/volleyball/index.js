import { defineSport } from '../_shape';

export default defineSport({
  id: 'volleyball',
  name: 'Volleyball',
  icon: 'volleyball',
  tag: 'Court',
  accent: '#3b82f6',
  feed: {
    accent: '#3b82f6',
    scoreUnit: 'sets',
    copy: { live: 'On the Net', results: 'Results & Fixtures', community: 'Net Chatter', compose: 'Share a volleyball moment' },
  },
});
