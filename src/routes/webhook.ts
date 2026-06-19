import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  getHistory,
  appendToHistory,
  clearHistory,
  getProcessedReply,
  setProcessedReply,
} from '../services/memory.js';
import { askClaude } from '../services/claude.js';
import { logConversation } from '../db/sqlite.js';
import { logger } from '../services/logger.js';
import { RateLimitMap, WebhookResponse } from '../types.js';
import { loadAgents } from '../agents/loader.js';
import { getSystemPrompt } from '../prompts/system.js';
import { buildHolidayContext } from '../services/holidays.js';
import { buildScheduleContext } from '../services/schedule.js';
import { CLINIC_TZ } from '../services/clock.js';
import { withLock } from '../services/lock.js';

// ── Carregar agentes em runtime
const { pm, AGENTS } = loadAgents();

const router = Router();

// ── Validação de payload ──────────────────────────────────────────────────
const WebhookSchema = z.object({
  phone: z.string().min(8).max(20),
  name: z.string().min(1).max(100).optional().default('Paciente'),
  message: z.string().min(1).max(4000),
  instance: z.string().optional(), // cto-caruaru | cto-campina | cto-geral
  messageId: z.string().min(1).max(128).optional(), // id da mensagem (dedupe de reentregas)
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
  // Extrai DDD corretamente: remove non-digits, pula +55, pega primeiros 2 dígitos
  let numeros = phone.replace(/\D/g, '');
  // Se começa com 55 (código Brasil), pular e pegar os próximos 2 (DDD)
  if (numeros.startsWith('55')) {
    numeros = numeros.slice(2);
  }
  const ddd = numeros.slice(0, 2);

  const dddMapping: { [key: string]: string } = {
    '81': 'ddd-81-choice',    // Pernambuco (Caruaru OU Palmares) - prompt específico
    '82': 'ddd-82-palmares',  // Alagoas (Palmares é mais próximo) - prioriza Palmares
    '83': 'ddd-83-campina',   // Paraíba (Campina Grande) - prioriza Campina
    '85': 'cto-geral',        // Ceará
    '84': 'cto-geral',        // Rio Grande do Norte
    '86': 'cto-geral',        // Piauí
    '87': 'cto-geral',        // Pernambuco interior
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
  const { messageId } = parsed.data;

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

  // 5b. PRIORIDADE: Se instance é DDD específico (ddd-81-choice, ddd-82-palmares),
  //                 USE o prompt de location em vez do agent genérico
  let agentPrompt: string;
  if (instance && instance.startsWith('ddd-')) {
    agentPrompt = getSystemPrompt(instance);
    logger.info(`[webhook] Usando prompt de localização DDD: ${instance}`);
  } else {
    agentPrompt = agent.getSystemPrompt();
    logger.info(`[pm-coordinator] Usando agente: ${agent.name} (confiança: ${(detection.confidence * 100).toFixed(0)}%)`);
  }

  // 7. Injetar contexto de data/hora e DDD no prompt (sempre no fuso da clínica)
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: CLINIC_TZ });
  const dateStr = now.toLocaleDateString('pt-BR', { timeZone: CLINIC_TZ });
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: CLINIC_TZ });

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

  // Blocos de contexto temporal: horário de atendimento (agora) + feriados (60d).
  // Degradam para vazio em caso de erro — nunca derrubam a resposta ao paciente.
  let scheduleContext = '';
  let holidayContext = '';
  try {
    scheduleContext = buildScheduleContext(now);
    holidayContext = buildHolidayContext(now);
  } catch (err) {
    logger.warn(`[webhook] Falha ao montar contexto temporal: ${String(err)}`);
  }
  const enhancedPrompt = [agentPrompt, contextMessage, scheduleContext, holidayContext]
    .filter(Boolean)
    .join('\n\n');

  // 8. Processamento serializado por telefone (evita corrida no histórico) +
  //    idempotência por message-id (deduplica reentregas do n8n/Evolution).
  try {
    const reply = await withLock(phone, async (): Promise<string> => {
      // Dedupe: se este message-id já foi processado, devolve a mesma resposta.
      if (messageId) {
        const cached = await getProcessedReply(messageId);
        if (cached !== null) {
          logger.info(`[webhook] Idempotência: message-id ${messageId} já processado — reusando resposta`);
          return cached;
        }
      }

      const history = await getHistory(phone);

      // Chamar Claude com o prompt do agente especializado (já tem fallback interno)
      const { reply: rawReply, tokens_input, tokens_output } = await askClaude(
        history,
        message,
        enhancedPrompt,
        instance,
      );

      // ── PM COORDINATOR: Validar resposta ──────────────────────────────────
      const validation = pm.validateResponse(rawReply, detection.type);
      if (!validation.ok) {
        logger.warn(`[pm-coordinator] Validação falhou para ${detection.type}: ${validation.issues.join(', ')}`);
      }
      const finalReply = validation.ok ? rawReply : pm.adjustResponse(rawReply, validation.issues);

      // Salvar histórico + idempotência + log (dentro do lock)
      await appendToHistory(phone, message, finalReply);
      if (messageId) await setProcessedReply(messageId, finalReply);

      logConversation({
        phone,
        patient_name: name,
        user_message: message,
        assistant_reply: finalReply,
        tokens_input,
        tokens_output,
      });

      logger.info(
        `[webhook] Resposta enviada para ${phone} — tokens: ${tokens_input}in / ${tokens_output}out`,
      );
      return finalReply;
    });

    const response: WebhookResponse = { reply };
    res.json(response);
  } catch (err) {
    logger.error(`[webhook] Erro ao processar mensagem de ${phone}: ${String(err)}`);
    res.status(500).json({ error: 'Erro interno ao processar a mensagem' });
  }
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
