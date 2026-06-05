import 'dotenv/config';
import express from 'express';
import path from 'path';
import { initMemory } from './services/memory.js';
import { logger } from './services/logger.js';
import webhookRouter from './routes/webhook.js';
import healthRouter from './routes/health.js';
import preConsultaRouter from './pre-consulta/routes.js';

// Inicializa banco SQLite (efeito colateral do import)
import './db/sqlite.js';

// Build timestamp: 2026-06-05 23:45 — Production Redis fallback enabled

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ── Middlewares globais ───────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Arquivos estáticos (uploads gerados + HTML do formulário)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use(express.static(path.join(process.cwd(), 'public')));

// Log de cada requisição recebida
app.use((req, _res, next) => {
  logger.info(`[http] ${req.method} ${req.path}`);
  next();
});

// ── Rotas ─────────────────────────────────────────────────────────────────
app.use('/health', healthRouter);
app.use('/webhook', webhookRouter);
app.use('/', preConsultaRouter);

// Rota raiz para confirmação rápida
app.get('/', (_req, res) => {
  res.json({
    service: 'whatsapp-ai',
    clinic: 'Clínica CTO – Centro de Trauma e Ortopedia',
    status: 'running',
  });
});

// Handler de rota não encontrada
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Handler de erros globais
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`[http] Erro não tratado: ${err.message}`, err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ── Inicialização ─────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  // Inicializar PostgreSQL se DATABASE_URL estiver configurada
  if (process.env.DATABASE_URL) {
    const { initPostgreSQL } = await import('./db/sqlite.js');
    await initPostgreSQL();
  }

  await initMemory();

  app.listen(PORT, () => {
    logger.info(`[server] WhatsApp AI rodando na porta ${PORT}`);
    logger.info(`[server] Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`[server] Database: ${process.env.DATABASE_URL ? 'PostgreSQL (dual-write ativado)' : 'SQLite (local apenas)'}`);
    logger.info(`[server] Health: http://localhost:${PORT}/health`);
    logger.info(`[server] Webhook: POST http://localhost:${PORT}/webhook`);
  });
}

bootstrap().catch((err: unknown) => {
  logger.error(`[server] Falha ao iniciar: ${String(err)}`);
  process.exit(1);
});
