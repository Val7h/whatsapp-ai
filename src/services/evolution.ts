/**
 * Envio de mensagens via Evolution API — usado para mensagens PROATIVAS
 * (lembretes de consulta, relatórios ao médico) que não são resposta direta
 * a um webhook recebido. Respostas normais do chat continuam saindo pelo
 * fluxo existente (n8n envia o campo `reply` do POST /webhook).
 */

import { logger } from './logger.js';

export interface SendResult {
  ok: boolean;
  error?: string;
}

/**
 * Envia uma mensagem de texto via Evolution API para `to` através de `instance`.
 * `fetchImpl` é injetável para testes (default: fetch global do runtime).
 */
export async function sendWhatsAppMessage(
  instance: string,
  to: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const baseUrl = process.env.EVOLUTION_API_URL || 'http://cto-evolution:8080';
  const apiKey = process.env.EVOLUTION_API_KEY || '';

  try {
    const response = await fetchImpl(`${baseUrl}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({ number: to, text }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error(`[evolution] Falha ao enviar (${response.status}) via ${instance} para ${to}: ${body}`);
      return { ok: false, error: `HTTP ${response.status}` };
    }

    logger.info(`[evolution] Mensagem enviada via ${instance}`);
    return { ok: true };
  } catch (err) {
    logger.error(`[evolution] Erro ao enviar via ${instance}: ${String(err)}`);
    return { ok: false, error: String(err) };
  }
}
