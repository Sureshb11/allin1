import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = Router();

// Get the daily quiz (most recent active quiz)
router.get('/daily', async (req, res) => {
  const quiz = await prisma.quiz.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!quiz) return res.json({ quiz: null });
  res.json({ quiz });
});

const SubmitSchema = z.object({
  quizId: z.string(),
  answers: z.any(),
});

router.post('/submit', authMiddleware, async (req, res) => {
  try {
    const { quizId, answers } = SubmitSchema.parse(req.body);
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    // Score the quiz
    const questions = quiz.questions;
    let correct = 0;
    (questions || []).forEach((q, i) => {
      if (answers[i] === q.correct) correct++;
    });
    const score = correct * 10;
    const total = (questions || []).length * 10;

    const result = await prisma.quizResult.create({
      data: { quizId, userId: req.user.sub, score, total },
    });

    // Get rank
    const rank = await prisma.quizResult.count({
      where: { quizId, score: { gt: score } },
    });

    res.json({ score, total, rank: rank + 1, points: score, resultId: result.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
