/**
 * Scheduler de lembretes de consulta — roda a cada minuto, decide (via
 * reminders.ts) quais estágios estão devidos para cada agendamento ativo, e
 * envia a mensagem correspondente via Evolution API.
 *
 * `planDueSends` é pura (fácil de testar); `runReminderTick`/`init...` fazem
 * a parte de I/O (banco + rede) e são só um fino glue por cima dela.
 */

import { logger } from '../services/logger.js';
import { sendWhatsAppMessage } from '../services/evolution.js';
import { appointmentStore, AppointmentRow } from './store.js';
import { dueStages, ReminderStage } from './reminders.js';
import {
  buildH48Message,
  buildEveMessage,
  buildDayMessage,
  buildBookingStandaloneMessage,
  buildFormLink,
} from './messages.js';

const FORM_BASE_URL = process.env.FORM_BASE_URL || 'http://localhost:3030';
const TICK_MS = 60_000;

export interface PlannedSend {
  appt: AppointmentRow;
  stage: ReminderStage;
  message: string;
  /** Presente quando um novo token de formulário foi gerado e precisa ser persistido. */
  newFormToken?: string;
}

/**
 * Decide, para uma lista de agendamentos e um instante `now`, quais envios
 * estão devidos e monta o texto de cada um. Não faz I/O.
 */
export function planDueSends(appointments: AppointmentRow[], now: Date, formBaseUrl: string = FORM_BASE_URL): PlannedSend[] {
  const sends: PlannedSend[] = [];

  for (const appt of appointments) {
    for (const stage of dueStages(appt, now)) {
      if (stage === 'booking') {
        const { url, token } = buildFormLink(appt, formBaseUrl, now.getTime());
        sends.push({ appt, stage, message: buildBookingStandaloneMessage(appt, url), newFormToken: token });
      } else if (stage === 'h48') {
        if (appt.form_filled) {
          sends.push({ appt, stage, message: buildH48Message(appt) });
        } else {
          const { url, token } = buildFormLink(appt, formBaseUrl, now.getTime());
          sends.push({ appt, stage, message: buildH48Message(appt, url), newFormToken: token });
        }
      } else if (stage === 'eve') {
        sends.push({ appt, stage, message: buildEveMessage(appt) });
      } else if (stage === 'day') {
        sends.push({ appt, stage, message: buildDayMessage(appt) });
      }
    }
  }

  return sends;
}

/** Executa um tick: calcula os envios devidos e realmente os envia + persiste. */
export async function runReminderTick(now: Date = new Date()): Promise<void> {
  const appointments = appointmentStore.listActive();
  const sends = planDueSends(appointments, now);

  for (const send of sends) {
    const result = await sendWhatsAppMessage(send.appt.instance, send.appt.phone, send.message);
    if (result.ok) {
      appointmentStore.markReminderSent(send.appt.id, send.stage);
      if (send.newFormToken) appointmentStore.setFormToken(send.appt.id, send.newFormToken);
      logger.info(`[appointments] Lembrete '${send.stage}' enviado (agendamento #${send.appt.id})`);
    } else {
      logger.warn(
        `[appointments] Falha ao enviar lembrete '${send.stage}' (agendamento #${send.appt.id}): ${result.error}`,
      );
    }
  }
}

export function initAppointmentReminderScheduler(): void {
  logger.info('[appointments] Scheduler de lembretes inicializado (verifica a cada 60s)');
  setInterval(() => {
    runReminderTick().catch((err) => {
      logger.error(`[appointments] Erro no tick de lembretes: ${String(err)}`);
    });
  }, TICK_MS);
}
