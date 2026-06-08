/**
 * ADMIN ROUTES
 * Endpoints administrativos para gerenciamento remoto
 * Protegidos por ADMIN_SECRET
 */

import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../services/logger.js';

const execAsync = promisify(exec);
const router = Router();

// ── Validação de segredo administrativo ──────────────────────────────────
function validateAdmin(req: Request): boolean {
  const adminSecret = process.env.ADMIN_SECRET || 'cto-admin-2026-valth';
  const headerSecret = req.headers['x-admin-secret'];
  return headerSecret === adminSecret;
}

// Middleware de autenticação
router.use((req: Request, res: Response, next) => {
  if (!validateAdmin(req)) {
    logger.warn('[admin] Tentativa de acesso não autorizado');
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }
  next();
});

// ── GET /admin/status - Status geral do sistema ──────────────────────────
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const uptime = process.uptime();
    const memory = process.memoryUsage();

    res.json({
      status: 'ok',
      uptime_seconds: Math.floor(uptime),
      uptime_human: formatUptime(uptime),
      memory_mb: {
        rss: Math.round(memory.rss / 1024 / 1024),
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
      },
      node_env: process.env.NODE_ENV || 'development',
      claude_model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /admin/evolution/instances - Lista instâncias Evolution ─────────
router.get('/evolution/instances', async (_req: Request, res: Response) => {
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL || 'http://cto-evolution:8080';
    const apiKey = process.env.EVOLUTION_API_KEY || '';

    const response = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
      headers: { apikey: apiKey },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /admin/evolution/qrcode/:instance - QR Code para conectar ───────
router.get('/evolution/qrcode/:instance', async (req: Request, res: Response) => {
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL || 'http://cto-evolution:8080';
    const apiKey = process.env.EVOLUTION_API_KEY || '';
    const instance = req.params.instance;

    const response = await fetch(`${evolutionUrl}/instance/connect/${instance}`, {
      headers: { apikey: apiKey },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /admin/evolution/create-instance - Criar nova instância ────────
router.post('/evolution/create-instance', async (req: Request, res: Response) => {
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL || 'http://cto-evolution:8080';
    const apiKey = process.env.EVOLUTION_API_KEY || '';
    const { instanceName, webhookUrl } = req.body;

    if (!instanceName) {
      res.status(400).json({ error: 'instanceName é obrigatório' });
      return;
    }

    const response = await fetch(`${evolutionUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: webhookUrl ? {
          url: webhookUrl,
          events: ['MESSAGES_UPSERT'],
        } : undefined,
      }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /admin/logs - Últimas linhas dos logs ───────────────────────────
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const lines = parseInt((req.query.lines as string) || '50', 10);
    const limited = Math.min(Math.max(lines, 1), 500);

    // Tentar ler logs do arquivo ou via journalctl
    try {
      const { stdout } = await execAsync(`tail -n ${limited} /app/logs/*.log 2>/dev/null || tail -n ${limited} /var/log/syslog 2>/dev/null || echo "Logs não encontrados"`);
      res.json({ logs: stdout.split('\n').slice(-limited) });
    } catch {
      res.json({ logs: ['Logs não disponíveis via filesystem'] });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /admin/db/stats - Estatísticas do banco SQLite ──────────────────
router.get('/db/stats', async (_req: Request, res: Response) => {
  try {
    // @ts-ignore
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync('/app/data/conversations.db');
    const result = db.prepare('SELECT COUNT(*) as count FROM conversations').get();
    const recent = db.prepare(
      'SELECT phone, patient_name, user_message, created_at FROM conversations ORDER BY created_at DESC LIMIT 10'
    ).all();
    db.close();

    res.json({
      total_conversations: (result as any).count,
      recent: recent,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /admin/test - Testa o webhook internamente ──────────────────────
router.get('/test', async (req: Request, res: Response) => {
  try {
    const phone = (req.query.phone as string) || '5581999999999';
    const message = (req.query.message as string) || 'Boa noite, quero agendar';

    const webhookSecret = process.env.WEBHOOK_SECRET || '';

    const response = await fetch(`http://localhost:${process.env.PORT || 3000}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': webhookSecret,
      },
      body: JSON.stringify({ phone, name: 'Admin Test', message }),
    });
    const data = await response.json();
    res.json({ input: { phone, message }, output: data });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /admin/clear-history - Limpa histórico de um número ────────────
router.post('/clear-history', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ error: 'phone é obrigatório' });
      return;
    }
    // @ts-ignore
    const { clearHistory } = await import('../services/memory.js');
    await clearHistory(phone);
    res.json({ success: true, phone });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Helper
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export default router;
