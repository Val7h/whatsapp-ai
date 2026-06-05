import Redis from 'ioredis';
import { Message } from '../types.js';
import { logger } from './logger.js';

// ── Configuração ──────────────────────────────────────────────────────────
const MAX_TURNS = parseInt(process.env.MAX_HISTORY_TURNS ?? '20', 10);
const MAX_MESSAGES = MAX_TURNS * 2; // cada turno = 1 user + 1 assistant
const REDIS_TTL_SECONDS = 48 * 60 * 60; // 48 horas
const KEY_PREFIX = 'whatsapp_history:';

// ── Estado ────────────────────────────────────────────────────────────────
let redisClient: Redis | null = null;
let usingRedis = false;

// Fallback em memória
const memoryStore = new Map<string, Message[]>();

// ── Indicador público do modo ativo ──────────────────────────────────────
export function getMemoryMode(): 'connected' | 'in-memory' {
  return usingRedis ? 'connected' : 'in-memory';
}

// ── Inicialização Redis ───────────────────────────────────────────────────
export async function initMemory(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.warn('[memory] REDIS_URL não configurado — usando Map em memória');
    return;
  }

  try {
    redisClient = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    });

    await redisClient.connect();
    usingRedis = true;
    logger.info('[memory] Redis conectado com sucesso');
  } catch (err) {
    logger.warn(`[memory] Redis indisponível — usando Map em memória. Erro: ${String(err)}`);
    redisClient = null;
    usingRedis = false;
  }
}

// ── Helpers Redis ─────────────────────────────────────────────────────────
async function redisGet(phone: string): Promise<Message[]> {
  if (!redisClient) return [];
  try {
    const raw = await redisClient.get(`${KEY_PREFIX}${phone}`);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch (err) {
    logger.error(`[memory] Erro ao ler Redis: ${String(err)}`);
    return [];
  }
}

async function redisSet(phone: string, messages: Message[]): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.set(
      `${KEY_PREFIX}${phone}`,
      JSON.stringify(messages),
      'EX',
      REDIS_TTL_SECONDS,
    );
  } catch (err) {
    logger.error(`[memory] Erro ao escrever Redis: ${String(err)}`);
  }
}

async function redisDel(phone: string): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.del(`${KEY_PREFIX}${phone}`);
  } catch (err) {
    logger.error(`[memory] Erro ao deletar Redis: ${String(err)}`);
  }
}

// ── API pública ───────────────────────────────────────────────────────────

/**
 * Retorna o histórico de mensagens de um número.
 */
export async function getHistory(phone: string): Promise<Message[]> {
  if (usingRedis) {
    return redisGet(phone);
  }
  return memoryStore.get(phone) ?? [];
}

/**
 * Acrescenta um par user/assistant ao histórico e aplica sliding window.
 */
export async function appendToHistory(
  phone: string,
  userMsg: string,
  assistantMsg: string,
): Promise<void> {
  const history = await getHistory(phone);

  history.push({ role: 'user', content: userMsg });
  history.push({ role: 'assistant', content: assistantMsg });

  // Sliding window — descarta os turnos mais antigos
  const trimmed =
    history.length > MAX_MESSAGES ? history.slice(history.length - MAX_MESSAGES) : history;

  if (usingRedis) {
    await redisSet(phone, trimmed);
  } else {
    memoryStore.set(phone, trimmed);
  }
}

/**
 * Limpa o histórico de um número.
 */
export async function clearHistory(phone: string): Promise<void> {
  if (usingRedis) {
    await redisDel(phone);
  } else {
    memoryStore.delete(phone);
  }
  logger.info(`[memory] Histórico limpo para ${phone}`);
}
