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
import { getSystemPrompt, hasSystemPrompt } from '../prompts/system.js';
import { buildHolidayContext } from '../services/holidays.js';
import { buildScheduleContext } from '../services/schedule.js';
import { CLINIC_TZ } from '../services/clock.js';
import { withLock } from '../services/lock.js';
import { toWhatsApp } from '../services/whatsapp-format.js';
import { extractDDD, maskPhone } from '../services/phone.js';
import { appointmentStore } from '../appointments/store.js';
import { detectBooking } from '../appointments/booking-detect.js';
import { interpretConfirmationReply } from '../appointments/confirmation-detect.js';
import { buildFormLink, buildBookingSuffix } from '../appointments/messages.js';

// Janela (em dias) de feriados injetada no prompt — configurável via env.
const HOLIDAY_WINDOW_DAYS = parseInt(process.env.HOLIDAY_WINDOW_DAYS ?? '21', 10);

// URL pública do formulário de pré-consulta (mesmo default usado em pre-consulta/routes.ts)
const FORM_BASE_URL = process.env.FORM_BASE_URL || 'http://localhost:3030';
// Instância Evolution usada para enviar lembretes quando não sabemos a real
// (ex.: quando o n8n não informou `instance` e tivemos que inferir por DDD
// apenas para escolher o PROMPT — "ddd-81-choice" etc. não são instâncias reais).
const REMINDER_INSTANCE_FALLBACK = process.env.REPORT_INSTANCE || 'cto-geral';

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
  // Usa a extração robusta de phone.ts (lida com 55, 9º dígito, @lid, etc.)
  const ddd = extractDDD(phone);

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
  // Fail-closed: sem segredo configurado, RECUSA (não deixa o webhook aberto).
  if (!secret) {
    logger.error('[webhook] WEBHOOK_SECRET não configurado — recusando requisição. Defina WEBHOOK_SECRET no ambiente.');
    return false;
  }

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
  // Nome REAL da instância Evolution, se o n8n informou (antes de qualquer
  // inferência por DDD abaixo, que serve só para ESCOLHER o prompt).
  const clientProvidedInstance = instance;

  // ── Inferir instance do DDD se não fornecido ────────────────────────────
  if (!instance) {
    instance = inferInstanceFromDDD(phone);
    logger.info(`[webhook] Instance inferido do DDD: ${instance}`);
  }

  // 3. Whitelist
  if (!isAllowedPhone(phone)) {
    logger.warn(`[webhook] Número não permitido: ${maskPhone(phone)}`);
    res.status(403).json({ error: 'Número não autorizado' });
    return;
  }

  // 4. Rate limiting
  if (isRateLimited(phone)) {
    logger.warn(`[webhook] Rate limit atingido para: ${maskPhone(phone)}`);
    res.status(429).json({ error: 'Muitas mensagens. Aguarde um momento.' });
    return;
  }

  // LGPD: não logamos o conteúdo da mensagem (sintomas) nem o telefone completo.
  logger.info(`[webhook] Mensagem recebida de ${maskPhone(phone)} [${instance}] — ${message.length} chars`);

  // 5. ── PM COORDINATOR: Detectar tipo de problema ────────────────────────
  const detection = pm.detectProblemType(message);
  pm.logRouting(maskPhone(phone), message, detection);

  // Buscar agente especializado
  const agent = AGENTS[detection.type];
  if (!agent) {
    logger.error(`[webhook] Agente não encontrado para tipo: ${detection.type}`);
    res.status(500).json({ error: 'Agente não configurado' });
    return;
  }

  // 5b. PRIORIDADE: se a instância tem prompt de localização mapeado
  //     (cto-caruaru, cto-campina, cto-geral, ddd-81-choice…), usa ele.
  //     Caso contrário, usa o prompt do agente especializado (PM coordinator).
  let agentPrompt: string;
  if (hasSystemPrompt(instance)) {
    agentPrompt = getSystemPrompt(instance);
    logger.info(`[webhook] Usando prompt da instância: ${instance}`);
  } else {
    agentPrompt = agent.getSystemPrompt();
    logger.info(`[pm-coordinator] Usando agente: ${agent.name} (confiança: ${(detection.confidence * 100).toFixed(0)}%)`);
  }

  // 7. Injetar contexto de data/hora e DDD no prompt (sempre no fuso da clínica)
  const now = new Date();
  const dayOfWeek = now.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: CLINIC_TZ });
  const dateStr = now.toLocaleDateString('pt-BR', { timeZone: CLINIC_TZ });
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: CLINIC_TZ });

  // Extrair DDD do telefone (mesma função robusta usada no roteamento)
  const ddd = extractDDD(phone);
  let locationHint = '';
  if (ddd === '81') {
    locationHint = '\n[DICA: Este cliente é de DDD 81 (Pernambuco). Ofereça Caruaru OU Palmares, não Campina Grande.]';
  } else if (ddd === '82') {
    locationHint = '\n[DICA: Este cliente é de DDD 82 (Alagoas/fronteira com PE). Palmares é a opção mais próxima - ofereça Palmares preferencialmente.]';
  } else if (ddd === '83') {
    locationHint = '\n[DICA: Este cliente é de DDD 83 (Paraíba). Priorize Campina Grande.]';
  }

  const contextMessage = `[CONTEXTO ATUAL: ${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)}, ${dateStr}, ${timeStr}]${locationHint}`;

  // Blocos de contexto temporal: horário de atendimento (agora) + feriados.
  // Degradam para vazio em caso de erro — nunca derrubam a resposta ao paciente.
  let scheduleContext = '';
  let holidayContext = '';
  try {
    scheduleContext = buildScheduleContext(now);
    holidayContext = buildHolidayContext(now, HOLIDAY_WINDOW_DAYS);
  } catch (err) {
    logger.warn(`[webhook] Falha ao montar contexto temporal: ${String(err)}`);
  }
  // Contexto volátil (muda a cada minuto) — vai SEPARADO do prompt estável para
  // não invalidar o prompt caching da Anthropic.
  const volatileContext = [contextMessage, scheduleContext, holidayContext]
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

      // ── Confirmação de véspera (SIM/NÃO) ──────────────────────────────────
      // Best-effort: nunca interrompe o fluxo normal do chat se algo falhar.
      try {
        const pending = appointmentStore.findActiveForPhone(phone);
        if (pending && pending.sent_eve === 1 && pending.status === 'agendado') {
          const verdict = interpretConfirmationReply(message);
          if (verdict) {
            appointmentStore.updateStatus(pending.id, verdict);
            logger.info(
              `[appointments] ${maskPhone(phone)} respondeu à véspera: ${verdict} (agendamento #${pending.id})`,
            );
          }
        }
      } catch (err) {
        logger.warn(`[appointments] Falha ao processar confirmação de véspera: ${String(err)}`);
      }

      // Chamar Claude com o prompt do agente especializado (já tem fallback interno)
      const { reply: rawReply, tokens_input, tokens_output } = await askClaude(
        history,
        message,
        agentPrompt, // prompt estável (cacheável)
        volatileContext, // data/hora/horário/feriados (sem cache)
      );

      // ── PM COORDINATOR: Validar resposta ──────────────────────────────────
      const validation = pm.validateResponse(rawReply, detection.type);
      if (!validation.ok) {
        logger.warn(`[pm-coordinator] Validação falhou para ${detection.type}: ${validation.issues.join(', ')}`);
      }
      const adjusted = validation.ok ? rawReply : pm.adjustResponse(rawReply, validation.issues);

      // ── Detecção de agendamento confirmado (best-effort) ──────────────────
      // Só tenta em mensagens de AGENDAMENTO; nunca quebra a resposta ao paciente.
      let bookingSuffix = '';
      if (detection.type === pm.PROBLEM_TYPES.AGENDAMENTO) {
        try {
          const detected = detectBooking(adjusted, message, now);
          if (detected && !appointmentStore.findActiveForPhoneOnDate(phone, detected.date)) {
            const evoInstance = clientProvidedInstance || REMINDER_INSTANCE_FALLBACK;
            const appt = appointmentStore.create({
              phone,
              name,
              instance: evoInstance,
              unit: detected.unit,
              date: detected.date,
              time: detected.time,
            });
            const { url, token } = buildFormLink(appt, FORM_BASE_URL, Date.now());
            appointmentStore.setFormToken(appt.id, token);
            appointmentStore.markReminderSent(appt.id, 'booking');
            bookingSuffix = buildBookingSuffix(appt, url);
            logger.info(
              `[appointments] Agendamento registrado #${appt.id} — ${detected.unit} em ${detected.date} (${maskPhone(phone)})`,
            );
          }
        } catch (err) {
          logger.warn(`[appointments] Falha ao detectar/registrar agendamento: ${String(err)}`);
        }
      }

      // Converte Markdown do Claude para o formato do WhatsApp (*negrito*, • listas)
      const finalReply = toWhatsApp(bookingSuffix ? `${adjusted}\n\n${bookingSuffix}` : adjusted);

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
        `[webhook] Resposta enviada para ${maskPhone(phone)} — tokens: ${tokens_input}in / ${tokens_output}out`,
      );
      return finalReply;
    });

    const response: WebhookResponse = { reply };
    res.json(response);
  } catch (err) {
    logger.error(`[webhook] Erro ao processar mensagem de ${maskPhone(phone)}: ${String(err)}`);
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

  logger.info(`[webhook] Histórico limpo manualmente para ${maskPhone(phone)}`);
  res.json({ success: true, message: `Histórico de ${phone} removido.` });
});

export default router;
