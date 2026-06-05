import { Router, Request, Response } from 'express';
import { getMemoryMode } from '../services/memory.js';
import { HealthResponse } from '../types.js';

const router = Router();

// GET /health
router.get('/', (_req: Request, res: Response) => {
  const payload: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    redis: getMemoryMode(),
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',
  };

  res.json(payload);
});

export default router;
