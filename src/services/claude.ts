import Anthropic from '@anthropic-ai/sdk';
import { Message, ClaudeResponse } from '../types.js';
import { logger } from './logger.js';

// ── Cliente Anthropic ─────────────────────────────────────────────────────
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: parseInt(process.env.CLAUDE_MAX_RETRIES ?? '2', 10),
  timeout: parseInt(process.env.CLAUDE_TIMEOUT_MS ?? '60000', 10),
});

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS ?? '1024', 10);

const FALLBACK_REPLY =
  'No momento não consigo processar sua mensagem. Por favor, ligue para a clínica.';

/**
 * Chama a API do Claude com o histórico e retorna a resposta + tokens.
 *
 * @param history        - Histórico de mensagens anteriores
 * @param userMessage    - Mensagem atual do paciente
 * @param systemPrompt   - Prompt ESTÁVEL do agente (marcado para prompt caching)
 * @param volatileContext - Contexto volátil (data/hora, horário, feriados). Vai
 *                          num bloco separado, SEM cache, para não invalidar o
 *                          prefixo cacheado a cada minuto.
 */
export async function askClaude(
  history: Message[],
  userMessage: string,
  systemPrompt: string,
  volatileContext?: string,
): Promise<ClaudeResponse> {
  // System em blocos: parte estável cacheável + parte volátil sem cache.
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
  ];
  if (volatileContext && volatileContext.trim()) {
    system.push({ type: 'text', text: volatileContext });
  }

  // Monta o array de mensagens: histórico anterior + mensagem atual
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages,
    });

    const tokens_input = response.usage.input_tokens;
    const tokens_output = response.usage.output_tokens;

    const cacheRead = response.usage.cache_read_input_tokens ?? 0;
    const cacheWrite = response.usage.cache_creation_input_tokens ?? 0;
    logger.info(
      `[claude] Modelo: ${response.model} — tokens input: ${tokens_input}, output: ${tokens_output}, ` +
      `cache(read/write): ${cacheRead}/${cacheWrite}, stop: ${response.stop_reason}`,
    );

    if (response.stop_reason === 'max_tokens') {
      logger.warn(`[claude] Resposta truncada por max_tokens (${MAX_TOKENS})`);
    }

    // Extrai o texto da resposta
    const firstBlock = response.content[0];
    if (firstBlock.type !== 'text') {
      logger.warn('[claude] Primeiro bloco de resposta não é texto');
      return { reply: FALLBACK_REPLY, tokens_input, tokens_output };
    }

    return {
      reply: firstBlock.text,
      tokens_input,
      tokens_output,
    };
  } catch (err) {
    logger.error(`[claude] Erro na API Anthropic: ${String(err)}`);
    return {
      reply: FALLBACK_REPLY,
      tokens_input: 0,
      tokens_output: 0,
    };
  }
}
