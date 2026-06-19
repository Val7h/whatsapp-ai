/**
 * Horário de atendimento — grade semanal por unidade, com função de
 * "está aberto agora?" e próximo atendimento. Integra com feriados
 * (data de feriado da cidade = unidade fechada, mesmo no dia normal de grade).
 *
 * Toda a leitura de dia/hora é feita no fuso da clínica (clock.ts), de modo que
 * o resultado independe do TZ do processo (UTC no container, p. ex.).
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
import { wallClock, weekdayOfISO, addDaysISO, weekdayName } from './clock.js';

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

// ── Helpers de tempo ────────────────────────────────────────────────────────
const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const fmt = (hhmm: string): string => hhmm.replace(':', 'h').replace('h00', 'h');

/** Slots de um dia (por ISO + weekday), removendo unidades fechadas por feriado. */
function slotsForISO(iso: string, weekday: number): Slot[] {
  return (SCHEDULE[weekday] ?? []).filter((s) => !isHolidayOn(iso, s.city));
}

/**
 * Slots de atendimento de um dia, já removendo unidades fechadas por feriado.
 */
export function slotsForDay(date: Date): Slot[] {
  const w = wallClock(date);
  return slotsForISO(w.iso, w.weekday);
}

/**
 * Slots abertos exatamente no instante `date` (dia + hora), respeitando feriados.
 */
export function openSlotsAt(date: Date): Slot[] {
  const w = wallClock(date);
  const nowMin = w.hour * 60 + w.minute;
  return slotsForISO(w.iso, w.weekday).filter((s) => toMin(s.start) <= nowMin && nowMin < toMin(s.end));
}

/** Conveniência: há alguma unidade aberta neste instante? */
export function isOpenNow(date: Date): boolean {
  return openSlotsAt(date).length > 0;
}

/**
 * Próximo atendimento a partir de `date` (varre até 14 dias), opcionalmente
 * filtrando por cidade. Retorna o slot mais cedo e a data (meio-dia UTC do dia).
 */
export function nextOpening(date: Date, city?: string): { date: Date; weekday: number; slot: Slot } | null {
  const w = wallClock(date);
  const nowMin = w.hour * 60 + w.minute;
  for (let i = 0; i < 14; i++) {
    const iso = addDaysISO(w.iso, i);
    const weekday = weekdayOfISO(iso);
    const slots = slotsForISO(iso, weekday)
      .filter((s) => !city || s.city === city)
      .filter((s) => i > 0 || toMin(s.start) > nowMin) // hoje: só slots que ainda vão começar
      .sort((a, b) => toMin(a.start) - toMin(b.start));
    if (slots.length > 0) return { date: new Date(`${iso}T12:00:00Z`), weekday, slot: slots[0] };
  }
  return null;
}

/**
 * Bloco de contexto de horário para injetar no prompt. Informa o estado AGORA
 * (aberto/fechado), a grade do dia e o próximo atendimento quando fechado.
 */
export function buildScheduleContext(now: Date): string {
  const w = wallClock(now);
  const hhmm = `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
  const today = slotsForISO(w.iso, w.weekday);
  const openNow = openSlotsAt(now);

  const lines: string[] = [`[HORÁRIO — agora é ${weekdayName(w.weekday)} ${hhmm}.]`];

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
      lines.push(
        `Próximo atendimento: ${weekdayName(next.weekday)} ${fmt(next.slot.start)} — ${next.slot.clinic} (${next.slot.city}).`,
      );
    }
    lines.push('NÃO oriente o paciente a comparecer fora do horário de atendimento.');
  }

  return lines.join('\n');
}
