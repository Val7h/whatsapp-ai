/**
 * Textos das mensagens de lembrete/confirmação + link do formulário de
 * pré-consulta. Funções puras (sem I/O) — fáceis de testar e de ajustar o
 * texto sem mexer no scheduler/webhook.
 */

import { gerarToken } from '../pre-consulta/token.js';
import { AppointmentRow } from './store.js';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const FORM_TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72h — mesmo prazo já usado no projeto

function weekdayNameOf(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatTime(time: string | null): string {
  if (!time) return 'ordem de chegada';
  return `${time.replace(':', 'h')}`;
}

/**
 * Gera o link do formulário de pré-consulta para um agendamento, junto do
 * token e do instante de expiração (para persistir/reenviar se necessário).
 */
export function buildFormLink(
  appt: Pick<AppointmentRow, 'id' | 'name' | 'phone' | 'date'>,
  baseUrl: string,
  now: number,
): { url: string; token: string; exp: number } {
  const exp = now + FORM_TOKEN_TTL_MS;
  const aid = String(appt.id);
  const token = gerarToken(aid, exp);
  const params = new URLSearchParams({
    nome: appt.name,
    tel: appt.phone,
    data: appt.date,
    aid,
    exp: String(exp),
    token,
  });
  return { url: `${baseUrl}/pre-consulta?${params.toString()}`, token, exp };
}

/** Mensagem enviada como complemento da confirmação de agendamento, com o link do formulário. */
export function buildBookingSuffix(appt: AppointmentRow, formUrl: string): string {
  const dia = weekdayNameOf(appt.date);
  return (
    `Para agilizar seu atendimento, preencha a pré-consulta antes do dia ` +
    `${formatDateBR(appt.date)} (${dia}): ${formUrl}`
  );
}

/** Lembrete de 48h antes (reforça o formulário se ainda não preenchido). */
export function buildH48Message(appt: AppointmentRow, formUrl?: string): string {
  const dia = weekdayNameOf(appt.date);
  const base =
    `Lembrete: sua consulta é ${dia}, ${formatDateBR(appt.date)}, ` +
    `${formatTime(appt.time)}, em ${appt.unit}.`;
  if (appt.form_filled || !formUrl) return base;
  return `${base} Se ainda não preencheu, a pré-consulta ajuda a agilizar: ${formUrl}`;
}

/** Véspera — confirmação ATIVA (pede resposta SIM/NÃO). */
export function buildEveMessage(appt: AppointmentRow): string {
  const dia = weekdayNameOf(appt.date);
  return (
    `Sua consulta é amanhã (${dia}), ${formatDateBR(appt.date)}, ` +
    `${formatTime(appt.time)}, em ${appt.unit}. ` +
    `Confirma sua presença? Responda SIM ou NÃO.`
  );
}

/** No dia, poucas horas antes — lembrete curto. */
export function buildDayMessage(appt: AppointmentRow): string {
  return `Hoje é o dia da sua consulta: ${formatTime(appt.time)}, em ${appt.unit}. Te esperamos.`;
}
