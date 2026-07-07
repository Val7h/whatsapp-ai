/**
 * Resumo diário dos formulários de pré-consulta preenchidos, enviado ao
 * médico via WhatsApp — GARANTE que ele saiba quem preencheu, mesmo que a
 * integração com n8n/Sheets/Drive falhe (o registro local em submissions.ts
 * é a fonte usada aqui, independente daquela integração).
 */

import { logger } from '../services/logger.js';
import { sendWhatsAppMessage } from '../services/evolution.js';
import { submissionsStore, SubmissionRow } from '../pre-consulta/submissions.js';
import { wallClock, CLINIC_TZ } from '../services/clock.js';

const DOCTOR_PHONE = process.env.DOCTOR_PHONE || '92779950694580@lid';
const INSTANCE_NAME = process.env.REPORT_INSTANCE || 'cto-geral';
const DIGEST_HOUR = parseInt(process.env.FORMS_DIGEST_HOUR ?? '19', 10);

/** Monta o texto do resumo (função pura). */
export function buildDigestMessage(rows: SubmissionRow[], dateLabel: string): string {
  if (rows.length === 0) {
    return `Pré-consulta — ${dateLabel}: nenhum formulário preenchido hoje.`;
  }
  const lines = rows.map((r, i) => `${i + 1}. ${r.name} — ${r.pdf_url}`);
  return [`Pré-consulta — ${dateLabel}: ${rows.length} formulário(s) preenchido(s) hoje.`, ...lines].join('\n');
}

/**
 * Envia o resumo do dia. Quando não há submissões, NÃO envia (evita ruído
 * diário) — apenas registra em log.
 */
export async function sendDailyFormsDigest(now: Date = new Date()): Promise<void> {
  try {
    const today = wallClock(now, CLINIC_TZ).iso;
    const rows = submissionsStore.listForDay(today);

    if (rows.length === 0) {
      logger.info('[reports] Resumo diário de formulários: nada preenchido hoje, envio dispensado');
      return;
    }

    const [y, m, d] = today.split('-');
    const message = buildDigestMessage(rows, `${d}/${m}/${y}`);
    const result = await sendWhatsAppMessage(INSTANCE_NAME, DOCTOR_PHONE, message);

    if (result.ok) {
      logger.info(`[reports] Resumo diário de formulários enviado (${rows.length} submissões)`);
    } else {
      logger.warn(`[reports] Falha ao enviar resumo diário de formulários: ${result.error}`);
    }
  } catch (err) {
    logger.error(`[reports] Erro ao montar/enviar resumo diário de formulários: ${String(err)}`);
  }
}

/** Agenda o envio diário, uma vez por dia, na hora configurada (padrão 19h). */
export function initDailyFormsDigestScheduler(): void {
  logger.info(`[reports] Scheduler de resumo diário de formulários inicializado (às ${DIGEST_HOUR}h)`);

  let lastSent = '';
  setInterval(() => {
    const now = new Date();
    const w = wallClock(now, CLINIC_TZ);
    if (w.hour === DIGEST_HOUR && w.minute === 0 && lastSent !== w.iso) {
      lastSent = w.iso;
      sendDailyFormsDigest(now).catch((err) => {
        logger.error(`[reports] Erro no tick do resumo diário de formulários: ${String(err)}`);
      });
    }
  }, 60_000);
}
