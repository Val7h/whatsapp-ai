/**
 * Feriados — nacionais, estaduais (PB/PE) e municipais por unidade.
 *
 * Unidades e localização:
 *   • Campina Grande — Paraíba (PB)
 *   • Caruaru        — Pernambuco (PE)
 *   • Palmares       — Pernambuco (PE)
 *
 * Datas fixas em 'MM-DD'. Datas móveis (Carnaval, Sexta Santa, Corpus Christi)
 * são calculadas a partir da Páscoa (algoritmo de Computus).
 *
 * ⚠️ Os municipais marcados com "(confirmar)" devem ser validados com cada
 *    prefeitura — emancipações e datas de padroeiro(a) variam. Ajuste à vontade:
 *    este arquivo é a única fonte de verdade dos feriados do assistente.
 */

export type UF = 'PB' | 'PE';
export type Scope = 'nacional' | 'estadual' | 'municipal';

export interface Holiday {
  date: string; // 'YYYY-MM-DD'
  name: string;
  scope: Scope;
  cities: string[]; // unidades afetadas (sem atendimento)
}

// ── Cidades das unidades ────────────────────────────────────────────────────
export const CITY_UF: Record<string, UF> = {
  'Campina Grande': 'PB',
  'Caruaru': 'PE',
  'Palmares': 'PE',
};
const ALL_CITIES = Object.keys(CITY_UF);
const citiesOfUF = (uf: UF): string[] => ALL_CITIES.filter((c) => CITY_UF[c] === uf);

// ── Feriados nacionais fixos (MM-DD) ────────────────────────────────────────
const NATIONAL_FIXED: Array<{ md: string; name: string }> = [
  { md: '01-01', name: 'Confraternização Universal' },
  { md: '04-21', name: 'Tiradentes' },
  { md: '05-01', name: 'Dia do Trabalho' },
  { md: '09-07', name: 'Independência do Brasil' },
  { md: '10-12', name: 'Nossa Senhora Aparecida' },
  { md: '11-02', name: 'Finados' },
  { md: '11-15', name: 'Proclamação da República' },
  { md: '11-20', name: 'Dia da Consciência Negra' }, // nacional desde 2024 (Lei 14.759/2023)
  { md: '12-25', name: 'Natal' },
];

// ── Feriados estaduais fixos (MM-DD) ────────────────────────────────────────
const STATE_FIXED: Record<UF, Array<{ md: string; name: string }>> = {
  PB: [{ md: '08-05', name: 'Fundação do Estado da Paraíba' }],
  PE: [{ md: '03-06', name: 'Data Magna de Pernambuco (Revolução de 1817)' }],
};

// ── Feriados municipais fixos (MM-DD) por cidade ────────────────────────────
const MUNICIPAL_FIXED: Record<string, Array<{ md: string; name: string }>> = {
  'Campina Grande': [
    { md: '06-24', name: 'São João' },
    { md: '10-11', name: 'Emancipação Política de Campina Grande' },
    { md: '12-08', name: 'Nossa Senhora da Conceição (padroeira) (confirmar)' },
  ],
  'Caruaru': [
    { md: '05-18', name: 'Emancipação Política de Caruaru' },
    { md: '06-24', name: 'São João' },
    { md: '09-15', name: 'Nossa Senhora das Dores (padroeira)' },
  ],
  'Palmares': [
    { md: '06-24', name: 'São João' },
    { md: '08-13', name: 'Emancipação Política de Palmares (confirmar)' },
    { md: '10-07', name: 'Nossa Senhora do Rosário (padroeira) (confirmar)' },
  ],
};

// ── Páscoa (Computus — Meeus/Jones/Butcher) ─────────────────────────────────
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const toISO = (d: Date): string => d.toISOString().slice(0, 10);
const mdToISO = (year: number, md: string): string => `${year}-${md}`;

// ── Feriados móveis nacionais (todos sem atendimento na clínica) ────────────
function nationalMovable(year: number): Array<{ iso: string; name: string }> {
  const easter = easterSunday(year);
  return [
    { iso: toISO(addDays(easter, -48)), name: 'Carnaval (segunda)' },
    { iso: toISO(addDays(easter, -47)), name: 'Carnaval (terça)' },
    { iso: toISO(addDays(easter, -2)), name: 'Sexta-feira Santa (Paixão de Cristo)' },
    { iso: toISO(addDays(easter, 60)), name: 'Corpus Christi' },
  ];
}

/**
 * Retorna todos os feriados de um ano (nacionais, estaduais, municipais),
 * já consolidados com as cidades afetadas. Datas iguais em escopos diferentes
 * são mescladas (ex.: São João em Campina + Caruaru + Palmares).
 */
export function holidaysForYear(year: number): Holiday[] {
  const map = new Map<string, Holiday>();

  const add = (iso: string, name: string, scope: Scope, cities: string[]): void => {
    const existing = map.get(iso);
    if (existing) {
      existing.cities = Array.from(new Set([...existing.cities, ...cities]));
      return;
    }
    map.set(iso, { date: iso, name, scope, cities: [...cities] });
  };

  // Nacionais (todas as cidades)
  for (const { md, name } of NATIONAL_FIXED) add(mdToISO(year, md), name, 'nacional', ALL_CITIES);
  for (const { iso, name } of nationalMovable(year)) add(iso, name, 'nacional', ALL_CITIES);

  // Estaduais (cidades da respectiva UF)
  (Object.keys(STATE_FIXED) as UF[]).forEach((uf) => {
    for (const { md, name } of STATE_FIXED[uf]) add(mdToISO(year, md), name, 'estadual', citiesOfUF(uf));
  });

  // Municipais (apenas a cidade)
  for (const city of ALL_CITIES) {
    for (const { md, name } of MUNICIPAL_FIXED[city] ?? []) {
      add(mdToISO(year, md), name, 'municipal', [city]);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Lista os feriados num intervalo [from, from+days], cobrindo virada de ano.
 */
export function getUpcomingHolidays(from: Date, days = 60): Holiday[] {
  const fromISO = toISO(from);
  const toISODate = toISO(addDays(from, days));
  const years = new Set([from.getUTCFullYear(), addDays(from, days).getUTCFullYear()]);

  const all: Holiday[] = [];
  years.forEach((y) => all.push(...holidaysForYear(y)));

  return all
    .filter((h) => h.date >= fromISO && h.date <= toISODate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Verifica se uma data é feriado. Se `city` for informada, considera apenas os
 * feriados que afetam aquela unidade; caso contrário, qualquer feriado.
 */
export function isHoliday(date: Date, city?: string): Holiday | null {
  const iso = toISO(date);
  const found = holidaysForYear(date.getUTCFullYear()).find((h) => h.date === iso);
  if (!found) return null;
  if (city && !found.cities.includes(city)) return null;
  return found;
}

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/**
 * Monta o bloco de contexto de feriados para injetar no prompt do assistente.
 * Retorna '' quando não há feriados na janela (evita poluir o prompt).
 */
export function buildHolidayContext(today: Date, days = 60): string {
  const upcoming = getUpcomingHolidays(today, days);
  if (upcoming.length === 0) return '';

  const lines = upcoming.map((h) => {
    const [y, m, d] = h.date.split('-').map(Number);
    const dow = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    const where = h.cities.length === ALL_CITIES.length ? 'todas as unidades' : h.cities.join(', ');
    return `• ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} (${dow}) — ${h.name} [${h.scope}] → SEM atendimento em: ${where}`;
  });

  return [
    '[FERIADOS — NÃO há atendimento nas unidades indicadas. NUNCA confirme agendamento nessas datas; ofereça o próximo dia de atendimento da unidade.]',
    ...lines,
  ].join('\n');
}
