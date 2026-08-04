/**
 * Detector de agendamento confirmado (lógica pura, sem I/O).
 *
 * Objetivo: capturar automaticamente quando o agente de agendamento CONFIRMA
 * uma consulta na conversa, para então registrar o agendamento e disparar o
 * formulário de pré-consulta. Propositalmente CONSERVADOR — prefere não
 * detectar (falso negativo, inofensivo) a detectar errado (falso positivo,
 * que geraria lembrete/formulário para uma consulta que não existe).
 *
 * Exige, ao mesmo tempo:
 *   1. Uma frase de confirmação explícita na resposta do assistente.
 *   2. Exatamente UMA clínica conhecida (grade de schedule.ts) mencionada.
 * A partir da clínica identificada, a data é resolvida deterministicamente
 * pela grade semanal (schedule.ts) — não depende de "adivinhar" o dia certo
 * a partir do texto livre.
 */

import { SCHEDULE, Slot } from '../services/schedule.js';
import { wallClock, addDaysISO, weekdayOfISO, CLINIC_TZ } from '../services/clock.js';
import { isHolidayOn } from '../services/holidays.js';

export interface DetectedBooking {
  unit: string; // "Clínica — Cidade"
  city: string;
  date: string; // 'YYYY-MM-DD'
  time: string; // 'HH:MM'
}

// ── Frases que indicam confirmação de agendamento ───────────────────────────
export const CONFIRMATION_PHRASES = [
  'confirmado',
  'confirmada',
  'consulta confirmada',
  'agendamento confirmado',
  'aguardamos voce',
  'te aguardamos',
  'reservei',
  'reservado',
  'anotado',
  'anotei sua consulta',
  'marcado para voce',
  'marcada para voce',
];

const WEEKDAY_TOKENS: Array<{ token: string; weekday: number }> = [
  { token: 'segunda', weekday: 1 },
  { token: 'terca', weekday: 2 },
  { token: 'quarta', weekday: 3 },
  { token: 'quinta', weekday: 4 },
  { token: 'sexta', weekday: 5 },
  { token: 'sabado', weekday: 6 },
  { token: 'domingo', weekday: 0 },
];

/** minúsculas + sem acentos, para casar substring de forma robusta. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Casa `phrase` como PALAVRA/FRASE inteira em `haystack` (limites de palavra
 * nas duas pontas). Evita falsos positivos como "ip" dentro de "equipe" ou
 * "participar" — crítico para apelidos curtos de clínica.
 */
function includesWord(haystack: string, phrase: string): boolean {
  return new RegExp(`\\b${escapeRegExp(phrase)}\\b`).test(haystack);
}

interface ClinicEntry {
  clinic: string;
  city: string;
  weekdays: number[];
  timeByWeekday: Record<number, string>;
  aliases: string[]; // formas curtas usadas na conversa, já normalizadas
}

// Apelidos/abreviações comuns na fala natural, além do nome completo da grade.
const CLINIC_ALIASES: Record<string, string[]> = {
  'Instituto Pernambuco (IP)': ['ip', 'instituto pernambuco'],
  'Hospital Intensiva Day': ['intensiva day', 'hospital intensiva'],
};

function buildClinicIndex(): ClinicEntry[] {
  const map = new Map<string, ClinicEntry>();
  for (const [weekdayStr, slots] of Object.entries(SCHEDULE) as Array<[string, Slot[]]>) {
    const weekday = Number(weekdayStr);
    for (const slot of slots) {
      const key = `${slot.clinic}|${slot.city}`;
      const entry =
        map.get(key) ??
        {
          clinic: slot.clinic,
          city: slot.city,
          weekdays: [],
          timeByWeekday: {},
          aliases: [normalize(slot.clinic), ...(CLINIC_ALIASES[slot.clinic] ?? []).map(normalize)],
        };
      entry.weekdays.push(weekday);
      entry.timeByWeekday[weekday] = slot.start;
      map.set(key, entry);
    }
  }
  return Array.from(map.values());
}

const CLINIC_INDEX = buildClinicIndex();

function hasConfirmationPhrase(text: string): boolean {
  return CONFIRMATION_PHRASES.some((p) => includesWord(text, p));
}

/** Clínicas mencionadas (por nome ou apelido, como palavra/frase inteira) no texto. */
function findMentionedClinics(text: string): ClinicEntry[] {
  return CLINIC_INDEX.filter((c) => c.aliases.some((alias) => includesWord(text, alias)));
}

function explicitWeekday(text: string): number | null {
  for (const { token, weekday } of WEEKDAY_TOKENS) {
    if (includesWord(text, token)) return weekday;
  }
  return null;
}

/** Próxima data (>= fromISO, até `maxDays`) cujo dia da semana seja `weekday`. */
function nearestDateForWeekday(fromISO: string, weekday: number, maxDays = 13): string {
  for (let i = 0; i <= maxDays; i++) {
    const iso = addDaysISO(fromISO, i);
    if (weekdayOfISO(iso) === weekday) return iso;
  }
  return fromISO; // inalcançável na prática (todo weekday ocorre em <=6 dias)
}

/**
 * Detecta um agendamento confirmado a partir da resposta do assistente
 * (e, em apoio, da mensagem do paciente). Retorna null quando não há sinal
 * suficiente ou há ambiguidade — nesses casos, nada é registrado.
 */
export function detectBooking(replyText: string, userMessageText: string, now: Date): DetectedBooking | null {
  const reply = normalize(replyText || '');
  if (!hasConfirmationPhrase(reply)) return null;

  let clinics = findMentionedClinics(reply);
  if (clinics.length === 0) {
    // fallback: paciente pode ter citado a unidade e o bot só confirmou
    clinics = findMentionedClinics(normalize(userMessageText || ''));
  }
  if (clinics.length !== 1) return null; // nenhuma ou ambígua → não arrisca

  const clinic = clinics[0];
  const combined = `${reply} ${normalize(userMessageText || '')}`;
  const today = wallClock(now, CLINIC_TZ).iso;

  let dateISO: string | null = null;
  if (includesWord(combined, 'hoje')) {
    if (clinic.weekdays.includes(weekdayOfISO(today))) dateISO = today;
  } else if (includesWord(combined, 'amanha')) {
    const tomorrow = addDaysISO(today, 1);
    if (clinic.weekdays.includes(weekdayOfISO(tomorrow))) dateISO = tomorrow;
  } else {
    const wd = explicitWeekday(combined);
    if (wd !== null && clinic.weekdays.includes(wd)) {
      dateISO = nearestDateForWeekday(today, wd);
    }
  }

  // Sem data explícita válida → usa o próximo dia de atendimento da clínica.
  if (dateISO === null) {
    const sorted = [...clinic.weekdays].sort((a, b) => {
      const da = (a - weekdayOfISO(today) + 7) % 7;
      const db = (b - weekdayOfISO(today) + 7) % 7;
      return da - db;
    });
    dateISO = nearestDateForWeekday(today, sorted[0]);
  }

  // Pula feriados da cidade (avança para a próxima ocorrência do mesmo weekday)
  let guard = 0;
  const weekday = weekdayOfISO(dateISO);
  while (isHolidayOn(dateISO, clinic.city) && guard < 8) {
    dateISO = addDaysISO(dateISO, 7);
    guard++;
  }

  return {
    unit: `${clinic.clinic} — ${clinic.city}`,
    city: clinic.city,
    date: dateISO,
    time: clinic.timeByWeekday[weekday] ?? clinic.timeByWeekday[clinic.weekdays[0]],
  };
}
