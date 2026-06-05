import Anthropic from '@anthropic-ai/sdk';
import { Message, ClaudeResponse } from '../types.js';
import { getSystemPrompt } from '../prompts/system.js';
import { logger } from './logger.js';

// ── Cliente Anthropic ─────────────────────────────────────────────────────
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1024;

const FALLBACK_REPLY =
  'No momento não consigo processar sua mensagem. Por favor, ligue para a clínica.';

/**
 * Chama a API do Claude com o histórico de mensagens e retorna a resposta
 * junto com os tokens utilizados.
 *
 * @param history - Histórico de mensagens anteriores
 * @param userMessage - Mensagem do usuário
 * @param systemPromptOrInstance - System prompt customizado OU instance name
 * @param instance - Instance name (usado se systemPromptOrInstance é um string genérico)
 *
 * Suporta:
 * - askClaude(history, msg) → usa getSystemPrompt()
 * - askClaude(history, msg, "cto-campina") → usa getSystemPrompt("cto-campina")
 * - askClaude(history, msg, customPrompt, instance) → usa customPrompt direto
 */
export async function askClaude(
  history: Message[],
  userMessage: string,
  systemPromptOrInstance?: string,
  instance?: string,
): Promise<ClaudeResponse> {
  // Se systemPromptOrInstance contém "agent" ou tem mais de 200 chars, é um prompt customizado
  const isCustomPrompt = systemPromptOrInstance &&
    (systemPromptOrInstance.includes('AGENTE') ||
     systemPromptOrInstance.includes('Você é') ||
     systemPromptOrInstance.length > 200);

  const systemPrompt = isCustomPrompt
    ? systemPromptOrInstance
    : getSystemPrompt(systemPromptOrInstance || instance);
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
      system: systemPrompt,
      messages,
    });

    const tokens_input = response.usage.input_tokens;
    const tokens_output = response.usage.output_tokens;

    logger.info(
      `[claude] Tokens usados — input: ${tokens_input}, output: ${tokens_output}`,
    );

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
