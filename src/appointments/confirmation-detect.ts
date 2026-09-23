/**
 * Detector de resposta a confirmação de véspera (SIM/NÃO) — lógica pura.
 *
 * Quando o estágio 'eve' já foi enviado para um agendamento e o paciente
 * ainda não respondeu (status ainda 'agendado'), a próxima mensagem dele é
 * checada por esta função para decidir se confirma ou sinaliza risco de falta.
 */

export type ConfirmationVerdict = 'confirmado' | 'risco_falta' | null;

const AFFIRMATIVE = [
  'sim',
  'confirmo',
  'confirmado',
  'confirmada',
  'pode confirmar',
  'vou sim',
  'com certeza',
];

const NEGATIVE = [
  'nao',
  'nao vou',
  'nao posso',
  'nao consigo',
  'nao vou poder',
  'preciso cancelar',
  'quero cancelar',
  'vou cancelar',
  'cancelar',
  'desmarcar',
];

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesWord(haystack: string, phrase: string): boolean {
  return new RegExp(`\\b${escapeRegExp(phrase)}\\b`).test(haystack);
}

/**
 * Interpreta uma mensagem do paciente como confirmação ou desistência.
 * Retorna null quando a mensagem não é claramente nem SIM nem NÃO (não decide
 * nada — o status do agendamento permanece como está).
 *
 * Checa negação primeiro: uma mensagem como "não posso, mas confirmo outro dia"
 * seria ambígua, mas o caso comum "não vou poder ir" não deve ser lido como
 * afirmativo só por conter alguma palavra parecida.
 */
export function interpretConfirmationReply(message: string): ConfirmationVerdict {
  const text = normalize(message);
  if (!text) return null;

  if (NEGATIVE.some((p) => includesWord(text, p))) return 'risco_falta';
  if (AFFIRMATIVE.some((p) => includesWord(text, p))) return 'confirmado';
  return null;
}
