/**
 * Relógio da clínica — fonte única do fuso horário e da "hora de parede".
 *
 * Toda a lógica temporal (horário de atendimento, feriados, contexto do prompt)
 * deve derivar dia/hora a partir daqui, e NÃO de getHours()/getDay() crus, que
 * dependem do TZ do processo. Em produção o container deve rodar com
 * TZ=America/Recife, mas este helper garante correção mesmo se o TZ vier errado.
 */

export const CLINIC_TZ = 'America/Recife'; // GMT-3, sem horário de verão

export interface Wall {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: number; // 0 = domingo … 6 = sábado (igual a Date.getDay)
  hour: number; // 0-23
  minute: number; // 0-59
  iso: string; // 'YYYY-MM-DD' no fuso da clínica
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Decompõe um instante (Date) nos componentes de "hora de parede" no fuso da
 * clínica, independentemente do fuso do processo.
 */
export function wallClock(date: Date, tz: string = CLINIC_TZ): Wall {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);

  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0; // alguns ambientes retornam '24' à meia-noite
  const minute = Number(get('minute'));
  const weekday = WD[get('weekday')] ?? 0;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { year, month, day, weekday, hour, minute, iso };
}

/** Dia da semana (0-6) de uma data ISO 'YYYY-MM-DD' (estável, via meio-dia UTC). */
export function weekdayOfISO(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** ISO 'YYYY-MM-DD' deslocada em N dias (estável, via meio-dia UTC). */
export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const weekdayName = (weekday: number): string => WEEKDAY_NAMES[weekday] ?? '';
