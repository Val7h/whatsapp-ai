import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getHistory, appendToHistory, clearHistory } from '../services/memory.js';
import { askClaude } from '../services/claude.js';
import { logConversation } from '../db/sqlite.js';
import { logger } from '../services/logger.js';
import { RateLimitMap, WebhookResponse } from '../types.js';
import { loadAgents } from '../agents/loader.js';

// ── Carregar agentes em runtime
const { pm, AGENTS } = loadAgents();

const router = Router();

// ── Validação de payload ──────────────────────────────────────────────────
const WebhookSchema = z.object({
  phone: z.string().min(8).max(20),
  name: z.string().min(1).max(100).optional().default('Paciente'),
  message: z.string().min(1).max(4000),
  instance: z.string().optional(), // cto-caruaru | cto-campina | cto-geral
});

// ── Rate limiting por telefone (máx. 10 msg/minuto) ───────────────────────
const rateLimitMap: RateLimitMap = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuto

function isRateLimited(phone: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(phone) ?? [];

  // Remove timestamps fora da janela
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(phone, recent);
    return true;
  }

  recent.push(now);
  rateLimitMap.set(phone, recent);
  return false;
}

// ── Whitelist de números ──────────────────────────────────────────────────
function isAllowedPhone(phone: string): boolean {
  const rawList = process.env.ALLOWED_PHONES ?? '';
  if (!rawList.trim()) return true; // whitelist vazia = todos permitidos

  const allowed = rawList
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return allowed.includes(phone);
}

// ── Detecção de urgência (migrada para PM Coordinator) ──────────────────
// Mantém compatibilidade se necessário, mas agora usa URGENCIA agent

// ── Detecção de DDD e Instance ────────────────────────────────────────────
function inferInstanceFromDDD(phone: string): string {
  // Extrai os primeiros 2 dígitos após '55' ou dos primeiros 2
  const ddd = phone.replace(/\D/g, '').slice(-10, -8);

  const dddMapping: { [key: string]: string } = {
    // 81 = Pernambuco (Caruaru OU Palmares) → deixar para bot oferecer opções
    '81': 'cto-geral',        // Pernambuco ambíguo - oferece Caruaru/Palmares/Campina
    '82': 'cto-geral',        // Alagoas (fronteira) - oferece opções
    '83': 'cto-campina',      // Paraíba (Campina Grande) - região clara
    '85': 'cto-geral',        // Ceará
    '84': 'cto-geral',        // Rio Grande do Norte
    '86': 'cto-geral',        // Piauí
    '87': 'cto-geral',        // Pernambuco interior - oferece opções
  };

  return dddMapping[ddd] ?? 'cto-geral';
}

// ── Validação do Webhook Secret ───────────────────────────────────────────
function validateSecret(req: Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true; // sem segredo configurado, permite tudo

  const headerSecret = req.headers['x-webhook-secret'];
  return headerSecret === secret;
}

// ─────────────────────────────────────────────────────────────────────────
// POST /webhook
// ─────────────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  // 1. Validar segredo
  if (!validateSecret(req)) {
    logger.warn('[webhook] Tentativa sem x-webhook-secret válido');
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  // 2. Validar payload
  const parsed = WebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn(`[webhook] Payload inválido: ${JSON.stringify(parsed.error.flatten())}`);
    res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
    return;
  }

  let { phone, name, message, instance } = parsed.data;

  // ── Inferir instance do DDD se não fornecido ────────────────────────────
  if (!instance) {
    instance = inferInstanceFromDDD(phone);
    logger.info(`[webhook] Instance inferido do DDD: ${instance}`);
  }

  // 3. Whitelist
  if (!isAllowedPhone(phone)) {
    logger.warn(`[webhook] Número não permitido: ${phone}`);
    res.status(403).json({ error: 'Número não autorizado' });
    return;
  }

  // 4. Rate limiting
  if (isRateLimited(phone)) {
    logger.warn(`[webhook] Rate limit atingido para: ${phone}`);
    res.status(429).json({ error: 'Muitas mensagens. Aguarde um momento.' });
    return;
  }

  logger.info(`[webhook] Mensagem recebida de ${phone} (${name}) [${instance}]: "${message.slice(0, 60)}..."`);

  // 5. ── PM COORDINATOR: Detectar tipo de problema ────────────────────────
  const detection = pm.detectProblemType(message);
  pm.logRouting(phone, message, detection);

  // Buscar agente especializado
  const agent = AGENTS[detection.type];
  if (!agent) {
    logger.error(`[webhook] Agente não encontrado para tipo: ${detection.type}`);
    res.status(500).json({ error: 'Agente não configurado' });
    return;
  }

  const agentPrompt = agent.getSystemPrompt();
  logger.info(`[pm-coordinator] Usando agente: ${agent.name} (confiança: ${(detection.confidence * 100).toFixed(0)}%)`);

  // 6. Buscar histórico
  const history = await getHistory(phone);

  // 7. Injetar contexto de data/hora e DDD no prompt
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Extrair DDD do telefone
  const ddd = phone.replace(/\D/g, '').slice(-10, -8);
  let locationHint = '';
  if (ddd === '81') {
    locationHint = '\n[DICA: Este cliente é de DDD 81 (Pernambuco). Ofereça Caruaru OU Palmares, não Campina Grande.]';
  } else if (ddd === '82') {
    locationHint = '\n[DICA: Este cliente é de DDD 82 (Alagoas/fronteira com PE). Palmares é a opção mais próxima - ofereça Palmares preferencialmente.]';
  } else if (ddd === '83') {
    locationHint = '\n[DICA: Este cliente é de DDD 83 (Paraíba). Priorize Campina Grande.]';
  }

  const contextMessage = `[CONTEXTO ATUAL: ${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)}, ${dateStr}, ${timeStr}]${locationHint}`;
  const enhancedPrompt = `${agentPrompt}\n\n${contextMessage}`;

  // 8. Chamar Claude com o prompt do agente especializado
  // Claude.askClaude() detecta se é prompt customizado (>200 chars ou contém "AGENTE")
  const { reply: rawReply, tokens_input, tokens_output } = await askClaude(
    history,
    message,
    enhancedPrompt, // ← Prompt customizado + contexto de data/hora
    instance
  );

  // 8. ── PM COORDINATOR: Validar resposta ────────────────────────────────
  const validation = pm.validateResponse(rawReply, detection.type);
  if (!validation.ok) {
    logger.warn(`[pm-coordinator] Validação falhou para ${detection.type}: ${validation.issues.join(', ')}`);
  }

  const reply = validation.ok ? rawReply : pm.adjustResponse(rawReply, validation.issues);

  // 8. Salvar histórico + log
  await appendToHistory(phone, message, reply);

  logConversation({
    phone,
    patient_name: name,
    user_message: message,
    assistant_reply: reply,
    tokens_input,
    tokens_output,
  });

  logger.info(
    `[webhook] Resposta enviada para ${phone} — tokens: ${tokens_input}in / ${tokens_output}out`,
  );

  // 9. Retornar resposta
  const response: WebhookResponse = { reply };
  res.json(response);
});

// ─────────────────────────────────────────────────────────────────────────
// POST /clear/:phone — limpar histórico (uso administrativo)
// ─────────────────────────────────────────────────────────────────────────
router.post('/clear/:phone', async (req: Request, res: Response): Promise<void> => {
  if (!validateSecret(req)) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  const { phone } = req.params;
  await clearHistory(phone);

  logger.info(`[webhook] Histórico limpo manualmente para ${phone}`);
  res.json({ success: true, message: `Histórico de ${phone} removido.` });
});

export default router;
