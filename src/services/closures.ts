/**
 * Fechamentos pontuais — dias em que uma unidade específica não atende por
 * um motivo que NÃO é feriado (perícia judicial, congresso, férias, evento
 * imprevisto, etc.). Diferente de holidays.ts (datas fixas recorrentes),
 * aqui são datas avulsas cadastradas manualmente conforme a agenda do
 * Dr. Valth muda.
 *
 * ⚠️ Sem uma entrada aqui, o bot assume a grade normal (schedule.ts) e pode
 * confirmar consulta num dia em que o médico não está — foi exatamente isso
 * que aconteceu em 24/09/2026 (perícias em Sousa fecharam CTO/Artro sem que
 * o assistente soubesse). Esta lista é a ÚNICA fonte de verdade pra
 * fechamentos pontuais — mantenha atualizada assim que souber de uma data.
 */

export interface Closure {
  date: string; // 'YYYY-MM-DD'
  city: string;
  clinic?: string; // se omitido, fecha TODAS as unidades da cidade nesse dia
  reason: string;
}

export const CLOSURES: Closure[] = [
  {
    date: '2026-09-24',
    city: 'Campina Grande',
    clinic: 'CTO',
    reason: 'Dr. Valth em perícias federais (Sousa)',
  },
  {
    date: '2026-09-24',
    city: 'Campina Grande',
    clinic: 'Clínica Artro',
    reason: 'Dr. Valth em perícias federais (Sousa)',
  },
];

/** A unidade (ou, sem `clinic`, a cidade inteira) está fechada nessa data por motivo avulso? */
export function isClosureOn(date: string, city: string, clinic?: string): boolean {
  return CLOSURES.some((c) => {
    if (c.date !== date || c.city !== city) return false;
    return !c.clinic || !clinic || c.clinic === clinic;
  });
}
