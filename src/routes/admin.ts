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

// ── GET /admin/evolution/webhook/:instance - Ver webhook configurado ────
router.get('/evolution/webhook/:instance', async (req: Request, res: Response) => {
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL || 'http://cto-evolution:8080';
    const apiKey = process.env.EVOLUTION_API_KEY || '';
    const instance = req.params.instance;

    const response = await fetch(`${evolutionUrl}/webhook/find/${instance}`, {
      headers: { apikey: apiKey },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /admin/evolution/webhook/:instance - Configurar webhook ────────
router.post('/evolution/webhook/:instance', async (req: Request, res: Response) => {
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL || 'http://cto-evolution:8080';
    const apiKey = process.env.EVOLUTION_API_KEY || '';
    const instance = req.params.instance;
    const { url, events } = req.body;

    const response = await fetch(`${evolutionUrl}/webhook/set/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: url || 'http://cto-whatsapp-ai:3000/webhook',
          events: events || ['MESSAGES_UPSERT'],
          webhook_by_events: false,
          webhook_base64: false,
        },
      }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /admin/db/inspect-55 - Investiga mensagens "DDD 55" ────────────
router.get('/db/inspect-55', async (_req: Request, res: Response) => {
  try {
    // @ts-ignore
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync('/app/data/conversations.db');

    // Pega exemplos dos "DDD 55" para análise
    const all = db.prepare(
      `SELECT phone, patient_name, user_message, created_at FROM conversations
       ORDER BY created_at DESC LIMIT 1000`
    ).all() as any[];

    const samples55: any[] = [];
    const sampleLid: any[] = [];
    const sampleLong: any[] = [];

    for (const row of all) {
      const phone = (row.phone || '').replace(/\D/g, '');
      const digits = phone.length;

      // Coleta amostras de DDD 55
      if (phone.startsWith('55') && digits >= 12) {
        const ddd = phone.slice(2, 4);
        if (ddd === '55' && samples55.length < 10) {
          samples55.push({
            phone: row.phone,
            digits,
            patient_name: row.patient_name,
            message: row.user_message?.slice(0, 80),
            created_at: row.created_at,
          });
        }
      }

      // Coleta amostras de @lid
      if ((row.phone || '').includes('@lid') && sampleLid.length < 10) {
        sampleLid.push({
          phone: row.phone,
          patient_name: row.patient_name,
          message: row.user_message?.slice(0, 80),
          created_at: row.created_at,
        });
      }

      // Telefones suspeitosamente longos
      if (digits > 13 && sampleLong.length < 10) {
        sampleLong.push({
          phone: row.phone,
          digits,
          patient_name: row.patient_name,
          message: row.user_message?.slice(0, 80),
        });
      }
    }

    db.close();
    res.json({
      samples_ddd_55: samples55,
      samples_lid: sampleLid,
      samples_long_phones: sampleLong,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /admin/db/by-ddd - Estatísticas por DDD ─────────────────────────
router.get('/db/by-ddd', async (_req: Request, res: Response) => {
  try {
    // @ts-ignore
    const { DatabaseSync } = await import('node:sqlite');
    const { extractDDD, cityFromDDD, isValidBrazilianDDD } = await import('../services/phone.js');
    const db = new DatabaseSync('/app/data/conversations.db');

    const all = db.prepare(`SELECT phone, user_message FROM conversations`).all() as any[];
    const byDdd: { [key: string]: number } = {};
    const byCity: { [key: string]: number } = {};
    let invalidJids = 0;
    let lidPatients = 0;

    for (const row of all) {
      const ddd = extractDDD(row.phone || '');
      if (ddd === 'invalid') {
        invalidJids++;
        continue;
      }
      if (ddd === 'lid') lidPatients++;
      byDdd[ddd] = (byDdd[ddd] || 0) + 1;
      const city = cityFromDDD(ddd, row.user_message || '');
      byCity[city] = (byCity[city] || 0) + 1;
    }

    // Mensagens nas últimas 24h
    const last24h = db.prepare(
      `SELECT phone, user_message FROM conversations WHERE created_at >= datetime('now', '-1 day')`
    ).all() as any[];
    const byDdd24h: { [key: string]: number } = {};
    const byCity24h: { [key: string]: number } = {};
    let invalidJids24h = 0;
    let lidPatients24h = 0;

    for (const row of last24h) {
      const ddd = extractDDD(row.phone || '');
      if (ddd === 'invalid') {
        invalidJids24h++;
        continue;
      }
      if (ddd === 'lid') lidPatients24h++;
      byDdd24h[ddd] = (byDdd24h[ddd] || 0) + 1;
      const city = cityFromDDD(ddd, row.user_message || '');
      byCity24h[city] = (byCity24h[city] || 0) + 1;
    }

    db.close();
    res.json({
      total: all.length,
      invalid_messages: invalidJids,
      lid_patients_total: lidPatients,
      by_ddd_total: byDdd,
      by_city_total: byCity,
      last_24h: last24h.length,
      invalid_messages_24h: invalidJids24h,
      lid_patients_24h: lidPatients24h,
      by_ddd_last_24h: byDdd24h,
      by_city_last_24h: byCity24h,
    });
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

// ── GET /admin/report/daily/preview - Preview do relatório diário ───────
router.get('/report/daily/preview', async (_req: Request, res: Response) => {
  try {
    const { generateStats } = await import('../reports/analytics.js');
    const { formatDaily } = await import('../reports/formatters.js');
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const stats = generateStats(start, end);
    const message = formatDaily(stats);
    res.json({ stats, message });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /admin/evolution/test-send - Testa envio de mensagem ──────────
router.post('/evolution/test-send', async (req: Request, res: Response) => {
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL || 'http://cto-evolution:8080';
    const apiKey = process.env.EVOLUTION_API_KEY || '';
    const instance = req.body.instance || 'cto-geral';
    const number = req.body.number || process.env.DOCTOR_PHONE || '5583993476410';
    const text = req.body.text || 'Teste de envio do bot - ' + new Date().toLocaleTimeString('pt-BR');

    logger.info(`[admin] Testando envio: ${instance} -> ${number}`);
    const response = await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number,
        text,
      }),
    });

    const status = response.status;
    const responseText = await response.text();
    let parsed: any = responseText;
    try { parsed = JSON.parse(responseText); } catch {}

    res.json({
      http_status: status,
      ok: response.ok,
      instance,
      number,
      text_sent: text,
      response: parsed,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /admin/evolution/check-number - Verifica se número existe no WhatsApp
router.get('/evolution/check-number/:instance/:number', async (req: Request, res: Response) => {
  try {
    const evolutionUrl = process.env.EVOLUTION_API_URL || 'http://cto-evolution:8080';
    const apiKey = process.env.EVOLUTION_API_KEY || '';
    const { instance, number } = req.params;

    const response = await fetch(`${evolutionUrl}/chat/whatsappNumbers/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({ numbers: [number] }),
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /admin/report/daily/send - Força envio do relatório diário ─────
router.post('/report/daily/send', async (_req: Request, res: Response) => {
  try {
    const { sendDailyReport } = await import('../reports/scheduler.js');
    await sendDailyReport();
    res.json({ success: true, message: 'Relatório diário enviado' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /admin/report/weekly/send - Força envio do relatório semanal ───
router.post('/report/weekly/send', async (_req: Request, res: Response) => {
  try {
    const { sendWeeklyReport } = await import('../reports/scheduler.js');
    await sendWeeklyReport();
    res.json({ success: true, message: 'Relatório semanal enviado' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /admin/report/monthly/send - Força envio do relatório mensal ───
router.post('/report/monthly/send', async (_req: Request, res: Response) => {
  try {
    const { sendMonthlyReport } = await import('../reports/scheduler.js');
    await sendMonthlyReport();
    res.json({ success: true, message: 'Relatório mensal enviado' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Identifica se uma mensagem é de teste (critério CONSERVADOR — só apaga se TEM certeza)
 *
 * Apenas considera TESTE se:
 * 1. Telefone tem padrão claramente fake: 5581111111111, 5583333333333, 5581900000XXX
 * 2. Nome explicitamente é "Teste", "Test", "T81", "T82", "DDD81"
 *
 * NÃO apaga nomes comuns como "Maria", "João", "Pedro" (podem ser pacientes reais)
 */
function isTestMessage(phone: string, name: string): boolean {
  const phoneDigits = (phone || '').replace(/\D/g, '');
  const nameTrim = (name || '').trim();

  // Telefones com dígitos repetidos (5581111111111, 5582222222222, etc)
  if (/^55(\d)\1{8,}$/.test(phoneDigits)) return true;
  if (/^55\d(\d)\1{7,}$/.test(phoneDigits)) return true;

  // Telefones com padrão 558X9000000XX (faixa de testes manuais)
  if (/^558[1-9]900000\d{3}$/.test(phoneDigits)) return true;

  // Telefones específicos de teste (que usei explicitamente)
  if (/^5583991234567$/.test(phoneDigits)) return true;
  if (/^5581999000111$/.test(phoneDigits)) return true;

  // Nome começando explicitamente com "Teste" ou "Test"
  if (/^(teste|test)\s/i.test(nameTrim)) return true;
  if (/^(teste|test)$/i.test(nameTrim)) return true;

  // Nomes que eu usei nos testes (curtos e específicos)
  if (/^(t8[1-9]|ddd8[1-9]|premium8[1-9])$/i.test(nameTrim)) return true;
  if (/^(hi|preco|urg|memory|hora|comercial|faq|novo|admin|premium81|caruaru2|alagoas)$/i.test(nameTrim)) return true;

  return false;
}

// ── GET /admin/db/test-data-preview - Preview do que será limpo ─────────
router.get('/db/test-data-preview', async (_req: Request, res: Response) => {
  try {
    // @ts-ignore
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync('/app/data/conversations.db');

    const all = db.prepare(
      `SELECT id, phone, patient_name, user_message, created_at FROM conversations`
    ).all() as any[];

    const testIds: number[] = [];
    const realIds: number[] = [];

    for (const row of all) {
      const isTest = isTestMessage(row.phone || '', row.patient_name || '');
      if (isTest) testIds.push(row.id);
      else realIds.push(row.id);
    }

    db.close();
    res.json({
      total: all.length,
      to_delete: testIds.length,
      to_keep: realIds.length,
      sample_to_delete: all
        .filter((r) => testIds.includes(r.id))
        .slice(0, 30)
        .map((r) => ({
          phone: r.phone,
          name: r.patient_name,
          message: r.user_message?.slice(0, 60),
        })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /admin/db/clean-test-data - Limpa dados de teste ───────────────
router.post('/db/clean-test-data', async (_req: Request, res: Response) => {
  try {
    // @ts-ignore
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync('/app/data/conversations.db');

    const all = db.prepare(
      `SELECT id, phone, patient_name FROM conversations`
    ).all() as any[];

    const testIds: number[] = [];
    for (const row of all) {
      if (isTestMessage(row.phone || '', row.patient_name || '')) testIds.push(row.id);
    }

    let deleted = 0;
    if (testIds.length > 0) {
      const stmt = db.prepare('DELETE FROM conversations WHERE id = ?');
      for (const id of testIds) {
        stmt.run(id);
        deleted++;
      }
    }

    const remaining = db.prepare(`SELECT COUNT(*) as count FROM conversations`).get();
    db.close();

    logger.info(`[admin] Limpeza de testes: ${deleted} apagadas, ${(remaining as any).count} mantidas`);
    res.json({
      deleted,
      remaining: (remaining as any).count,
    });
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
