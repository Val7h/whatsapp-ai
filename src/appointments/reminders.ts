/**
 * Motor de lembretes (lógica pura, sem I/O — 100% testável).
 *
 * Decide, para um agendamento e um instante `now`, QUAIS lembretes devem ser
 * enviados agora. Regras acordadas:
 *   • Na marcação: confirmação + link do formulário  (stage 'booking')
 *   • 48h antes:   lembrete + reforço do formulário   (stage 'h48')
 *   • Véspera:     confirmação ATIVA (SIM/NÃO)         (stage 'eve')
 *   • No dia (~3h antes): lembrete curto               (stage 'day')
 *   • Janela de envio: 05h–23h (fuso da clínica). Fora disso, não envia.
 *
 * Idempotência: cada estágio tem um flag `sent_*` no agendamento; um estágio só
 * é devido se ainda não foi enviado E o instante está dentro da sua janela.
 * Se o scheduler ficar fora do ar, o estágio dispara no próximo tick dentro da
 * janela (não "perde" o lembrete, e nunca envia duplicado).
 */

import { wallClock, CLINIC_TZ } from '../services/clock.js';

export type ReminderStage = 'booking' | 'h48' | 'eve' | 'day';
export const REMINDER_STAGES: ReminderStage[] = ['booking', 'h48', 'eve', 'day'];

export interface Appointment {
  id: number;
  phone: string;
  name: string;
  unit: string;
  date: string; // 'YYYY-MM-DD' (fuso da clínica)
  time: string | null; // 'HH:MM' ou null (ordem de chegada)
  status: string; // agendado | confirmado | risco_falta | cancelado | compareceu
  form_filled: number; // 0 | 1
  sent_booking: number;
  sent_h48: number;
  sent_eve: number;
  sent_day: number;
}

const HOUR_MS = 3_600_000;
const DEFAULT_TIME = '09:00'; // usado quando não há horário (ordem de chegada)
const QUIET_START_HOUR = 5; // não envia antes das 05h
const QUIET_END_HOUR = 23; // não envia às 23h ou depois

const SENT_FLAG: Record<ReminderStage, keyof Appointment> = {
  booking: 'sent_booking',
  h48: 'sent_h48',
  eve: 'sent_eve',
  day: 'sent_day',
};

/** Epoch ms do agendamento no fuso da clínica (Recife, GMT-3 sem horário de verão). */
export function appointmentMs(date: string, time: string | null): number {
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : DEFAULT_TIME;
  return new Date(`${date}T${t}:00-03:00`).getTime();
}

/** Está no horário de silêncio (fora de 05h–23h)? */
export function isQuietHours(now: Date): boolean {
  const h = wallClock(now, CLINIC_TZ).hour;
  return h < QUIET_START_HOUR || h >= QUIET_END_HOUR;
}

/** O estágio está dentro da sua janela de disparo para o instante `nowMs`? */
function inWindow(stage: ReminderStage, apptMs: number, nowMs: number): boolean {
  switch (stage) {
    case 'booking':
      return nowMs < apptMs; // qualquer momento antes da consulta (enviado 1x)
    case 'h48':
      return nowMs >= apptMs - 48 * HOUR_MS && nowMs < apptMs - 24 * HOUR_MS;
    case 'eve':
      return nowMs >= apptMs - 24 * HOUR_MS && nowMs < apptMs - 3 * HOUR_MS;
    case 'day':
      return nowMs >= apptMs - 3 * HOUR_MS && nowMs < apptMs;
    default:
      return false;
  }
}

/**
 * Retorna os estágios de lembrete devidos AGORA para o agendamento.
 * Vazio se: cancelado/compareceu, já passou, horário de silêncio, ou nada na janela.
 */
export function dueStages(appt: Appointment, now: Date): ReminderStage[] {
  if (appt.status === 'cancelado' || appt.status === 'compareceu') return [];
  if (isQuietHours(now)) return [];

  const apptMs = appointmentMs(appt.date, appt.time);
  const nowMs = now.getTime();
  if (nowMs >= apptMs) return []; // consulta já passou

  return REMINDER_STAGES.filter((s) => !appt[SENT_FLAG[s]] && inWindow(s, apptMs, nowMs));
}
