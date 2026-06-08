/**
 * Scheduler — agenda envio automático dos relatórios via WhatsApp
 * - Diário: 20h todo dia
 * - Semanal: domingo 20h
 * - Mensal: dia 1 às 9h
 */

import { logger } from '../services/logger.js';
import { generateStats } from './analytics.js';
import { formatDaily, formatWeekly, formatMonthly } from './formatters.js';

const DOCTOR_PHONE = process.env.DOCTOR_PHONE || '92779950694580@lid';
const INSTANCE_NAME = process.env.REPORT_INSTANCE || 'cto-geral';
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://cto-evolution:8080';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || '';

/**
 * Envia mensagem via Evolution API
 */
async function sendWhatsAppMessage(text: string): Promise<boolean> {
  try {
    const response = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_KEY,
      },
      body: JSON.stringify({
        number: DOCTOR_PHONE,
        text,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error(`[reports] Falha ao enviar via Evolution: ${err}`);
      return false;
    }

    logger.info(`[reports] Mensagem enviada para ${DOCTOR_PHONE}`);
    return true;
  } catch (err) {
    logger.error(`[reports] Erro ao enviar WhatsApp: ${String(err)}`);
    return false;
  }
}

/**
 * Envia o relatório DIÁRIO (do dia atual)
 */
export async function sendDailyReport(): Promise<void> {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const stats = generateStats(start, end);
    const message = formatDaily(stats);
    await sendWhatsAppMessage(message);
    logger.info('[reports] Relatório diário enviado');
  } catch (err) {
    logger.error(`[reports] Erro no relatório diário: ${String(err)}`);
  }
}

/**
 * Envia o relatório SEMANAL (últimos 7 dias)
 */
export async function sendWeeklyReport(): Promise<void> {
  try {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    // Semana anterior para comparação
    const prevEnd = new Date(start);
    prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - 6);
    prevStart.setHours(0, 0, 0, 0);

    const stats = generateStats(start, end);
    const prevStats = generateStats(prevStart, prevEnd);
    const message = formatWeekly(stats, prevStats);
    await sendWhatsAppMessage(message);
    logger.info('[reports] Relatório semanal enviado');
  } catch (err) {
    logger.error(`[reports] Erro no relatório semanal: ${String(err)}`);
  }
}

/**
 * Envia o relatório MENSAL (mês anterior)
 */
export async function sendMonthlyReport(): Promise<void> {
  try {
    const now = new Date();
    // Mês ANTERIOR completo
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Mês anterior ao anterior (para comparação)
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);

    const stats = generateStats(start, end);
    const prevStats = generateStats(prevStart, prevEnd);
    const message = formatMonthly(stats, prevStats);
    await sendWhatsAppMessage(message);
    logger.info('[reports] Relatório mensal enviado');
  } catch (err) {
    logger.error(`[reports] Erro no relatório mensal: ${String(err)}`);
  }
}

/**
 * Inicializa os agendadores
 * - Verifica a cada minuto se é hora de enviar algum relatório
 */
export function initReportScheduler(): void {
  logger.info('[reports] Scheduler inicializado');
  logger.info(`[reports] Destinatário: ${DOCTOR_PHONE}`);
  logger.info(`[reports] Instância: ${INSTANCE_NAME}`);

  let lastDailySent = '';
  let lastWeeklySent = '';
  let lastMonthlySent = '';

  setInterval(async () => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const dayOfWeek = now.getDay(); // 0 = domingo
    const dayOfMonth = now.getDate();
    const today = now.toISOString().slice(0, 10);
    const thisWeek = `${now.getFullYear()}-W${Math.ceil(dayOfMonth / 7)}`;
    const thisMonth = now.toISOString().slice(0, 7);

    // DIÁRIO: 20h todo dia
    if (hour === 20 && minute === 0 && lastDailySent !== today) {
      lastDailySent = today;
      logger.info('[reports] Hora do relatório diário (20h)');
      await sendDailyReport();
    }

    // SEMANAL: domingo às 20h (DEPOIS do diário)
    if (dayOfWeek === 0 && hour === 20 && minute === 5 && lastWeeklySent !== thisWeek) {
      lastWeeklySent = thisWeek;
      logger.info('[reports] Hora do relatório semanal (domingo 20h05)');
      await sendWeeklyReport();
    }

    // MENSAL: dia 1 às 9h
    if (dayOfMonth === 1 && hour === 9 && minute === 0 && lastMonthlySent !== thisMonth) {
      lastMonthlySent = thisMonth;
      logger.info('[reports] Hora do relatório mensal (dia 1 às 9h)');
      await sendMonthlyReport();
    }
  }, 60_000); // verifica a cada 1 minuto
}
