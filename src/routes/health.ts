import { Router, Request, Response } from 'express';
import { getMemoryMode } from '../services/memory.js';
import { checkAppointmentsConfig } from '../services/config-check.js';
import { HealthResponse } from '../types.js';

const router = Router();

// GET /health
router.get('/', (_req: Request, res: Response) => {
  const payload: HealthResponse & { appointmentsConfig: ReturnType<typeof checkAppointmentsConfig> } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    redis: getMemoryMode(),
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
    appointmentsConfig: checkAppointmentsConfig(),
  };

  res.json(payload);
});

export default router;
