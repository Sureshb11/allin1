import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { prisma } from './lib/prisma.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import matchRoutes from './routes/matches.js';
import newsRoutes from './routes/news.js';
import marketplaceRoutes from './routes/marketplace.js';
import notificationsRoutes from './routes/notifications.js';
import badgesRoutes from './routes/badges.js';
import tournamentsRoutes from './routes/tournaments.js';
import streamsRoutes from './routes/streams.js';
import searchRoutes from './routes/search.js';
import teamsRoutes from './routes/teams.js';
import playersRoutes from './routes/players.js';
import groundsRoutes from './routes/grounds.js';
import quizzesRoutes from './routes/quizzes.js';
import clubsRoutes from './routes/clubs.js';
import chatRoutes from './routes/chat.js';
import videosRoutes from './routes/videos.js';
import lookingForRoutes from './routes/looking-for.js';
import coachingRoutes from './routes/coaching.js';
import umpiresRoutes from './routes/umpires.js';
import scorersRoutes from './routes/scorers.js';
import postsRoutes from './routes/posts.js';
import rummyRoutes from './routes/sports/rummy.js';
import sportConfigRoutes from './routes/sportConfig.js';
import feedRoutes from './routes/feed.js';
import uploadRoutes from './routes/upload.js';
import galleryRoutes from './routes/gallery.js';
import pincodeRoutes from './routes/pincodes.js';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '12mb' }));   // allow base64 image uploads
app.use(morgan('dev'));

app.get('/', (req, res) => res.json({
  service: 'local-legends-api',
  status: 'ok',
  version: '1.0.1',
  health: '/health',
}));

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: 'local-legends-api', version: '1.0.1' });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'db' });
  }
});

app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/teams', teamsRoutes);
app.use('/players', playersRoutes);
app.use('/matches', matchRoutes);
app.use('/news', newsRoutes);
app.use('/marketplace', marketplaceRoutes);
app.use('/notifications', notificationsRoutes);
app.use('/badges', badgesRoutes);
app.use('/tournaments', tournamentsRoutes);
app.use('/streams', streamsRoutes);
app.use('/search', searchRoutes);
app.use('/grounds', groundsRoutes);
app.use('/quizzes', quizzesRoutes);
app.use('/clubs', clubsRoutes);
app.use('/chat', chatRoutes);
app.use('/videos', videosRoutes);
app.use('/looking-for', lookingForRoutes);
app.use('/coaching', coachingRoutes);
app.use('/umpires', umpiresRoutes);
app.use('/scorers', scorersRoutes);
app.use('/posts', postsRoutes);
app.use('/rummy', rummyRoutes);
app.use('/sports', sportConfigRoutes);
app.use('/feed', feedRoutes);
app.use('/upload', uploadRoutes);
app.use('/gallery', galleryRoutes);
app.use('/pincodes', pincodeRoutes);

// Not found
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

// Local dev: listen on port
// Vercel: exports the app as a serverless function
if (!process.env.VERCEL) {
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`AllIn1 API listening on http://localhost:${port}`);
  });
}

export default app;
