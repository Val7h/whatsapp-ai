/**
 * Horário de atendimento — grade semanal por unidade, com função de
 * "está aberto agora?" e próximo atendimento. Integra com feriados
 * (data de feriado da cidade = unidade fechada, mesmo no dia normal de grade).
 *
 * Grade canônica (atendimento apenas seg–qui; sex/sáb/dom sem atendimento):
 *   Seg: CTO (Campina Grande, 08–12) | Intensiva Day (Caruaru, 17–21)
 *   Ter: Clínica Mário Bento (Palmares, 10–15)
 *   Qua: IP (Caruaru, 09–13) | Unimagem (Caruaru, 14–18)
 *   Qui: CTO (Campina Grande, 08–12) | Clínica Artro (Campina Grande, 15–19)
 *
 * Esta é a única fonte de verdade da grade horária do assistente.
 */

import { isHolidayOn } from './holidays.js';

export type SlotType = 'ordem de chegada' | 'agendado';

export interface Slot {
  city: string;
  clinic: string;
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  type: SlotType;
}

// Chave = dia da semana (0 = domingo … 6 = sábado), igual a Date.getDay()
export const SCHEDULE: Record<number, Slot[]> = {
  1: [
    { city: 'Campina Grande', clinic: 'CTO', start: '08:00', end: '12:00', type: 'ordem de chegada' },
    { city: 'Caruaru', clinic: 'Hospital Intensiva Day', start: '17:00', end: '21:00', type: 'agendado' },
  ],
  2: [
    { city: 'Palmares', clinic: 'Clínica Mário Bento', start: '10:00', end: '15:00', type: 'agendado' },
  ],
  3: [
    { city: 'Caruaru', clinic: 'Instituto Pernambuco (IP)', start: '09:00', end: '13:00', type: 'ordem de chegada' },
    { city: 'Caruaru', clinic: 'Unimagem', start: '14:00', end: '18:00', type: 'ordem de chegada' },
  ],
  4: [
    { city: 'Campina Grande', clinic: 'CTO', start: '08:00', end: '12:00', type: 'ordem de chegada' },
    { city: 'Campina Grande', clinic: 'Clínica Artro', start: '15:00', end: '19:00', type: 'agendado' },
  ],
};

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// ── Helpers de tempo (sempre em horário "de parede" / local) ────────────────
const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const localISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmt = (hhmm: string): string => hhmm.replace(':', 'h').replace('h00', 'h');

/**
 * Slots de atendimento de um dia, já removendo unidades fechadas por feriado.
 */
export function slotsForDay(date: Date): Slot[] {
  const iso = localISO(date);
  return (SCHEDULE[date.getDay()] ?? []).filter((s) => !isHolidayOn(iso, s.city));
}

/**
 * Slots abertos exatamente no instante `date` (dia + hora), respeitando feriados.
 */
export function openSlotsAt(date: Date): Slot[] {
  const nowMin = date.getHours() * 60 + date.getMinutes();
  return slotsForDay(date).filter((s) => toMin(s.start) <= nowMin && nowMin < toMin(s.end));
}

/** Conveniência: há alguma unidade aberta neste instante? */
export function isOpenNow(date: Date): boolean {
  return openSlotsAt(date).length > 0;
}

/**
 * Próximo atendimento a partir de `date` (varre até 14 dias), opcionalmente
 * filtrando por cidade. Retorna o slot mais cedo e a data correspondente.
 */
export function nextOpening(date: Date, city?: string): { date: Date; slot: Slot } | null {
  const nowMin = date.getHours() * 60 + date.getMinutes();
  for (let i = 0; i < 14; i++) {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() + i);
    const slots = slotsForDay(day)
      .filter((s) => !city || s.city === city)
      .filter((s) => i > 0 || toMin(s.start) > nowMin) // hoje: só slots que ainda vão começar
      .sort((a, b) => toMin(a.start) - toMin(b.start));
    if (slots.length > 0) return { date: day, slot: slots[0] };
  }
  return null;
}

/**
 * Bloco de contexto de horário para injetar no prompt. Informa o estado AGORA
 * (aberto/fechado), a grade do dia e o próximo atendimento quando fechado.
 */
export function buildScheduleContext(now: Date): string {
  const dow = WEEKDAYS[now.getDay()];
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = slotsForDay(now);
  const openNow = openSlotsAt(now);

  const lines: string[] = [`[HORÁRIO — agora é ${dow} ${hhmm}.]`];

  if (today.length === 0) {
    lines.push('Hoje NÃO há atendimento em nenhuma unidade.');
  } else if (openNow.length > 0) {
    for (const s of openNow) {
      lines.push(`ABERTO AGORA: ${s.clinic} (${s.city}) até ${fmt(s.end)} — ${s.type}.`);
    }
  } else {
    lines.push('Nenhuma unidade aberta neste momento.');
    const grade = today.map((s) => `${s.clinic} (${s.city}) ${fmt(s.start)}-${fmt(s.end)}`).join(' | ');
    lines.push(`Grade de hoje: ${grade}.`);
  }

  if (openNow.length === 0) {
    const next = nextOpening(now);
    if (next) {
      const nd = WEEKDAYS[next.date.getDay()];
      lines.push(
        `Próximo atendimento: ${nd} ${fmt(next.slot.start)} — ${next.slot.clinic} (${next.slot.city}).`,
      );
    }
    lines.push('NÃO oriente o paciente a comparecer fora do horário de atendimento.');
  }

  return lines.join('\n');
}
