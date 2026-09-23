/**
 * Formatação para WhatsApp.
 *
 * O Claude responde em Markdown "padrão" (**negrito**, ## título, - lista),
 * mas o WhatsApp usa convenções próprias (*negrito*, sem títulos, • lista).
 * Esta função converte a resposta antes de enviá-la ao paciente.
 *
 * Conservadora de propósito: só mexe no que é seguro, para não corromper texto.
 */

/** Limite prático de tamanho de uma mensagem no WhatsApp. */
export const WHATSAPP_MAX_CHARS = 4096;

/**
 * Converte Markdown do Claude para o formato do WhatsApp.
 */
export function toWhatsApp(text: string): string {
  if (!text) return text;
  let out = text;

  // Títulos markdown (#, ##, ...) → mantém só o texto
  out = out.replace(/^#{1,6}[ \t]+/gm, '');

  // Negrito **x** → *x* (negrito do WhatsApp). Não cruza linhas.
  out = out.replace(/\*\*([^\n*]+?)\*\*/g, '*$1*');

  // Marcadores de lista "- item" / "* item" no início da linha → "• item"
  out = out.replace(/^[ \t]*[-*][ \t]+/gm, '• ');

  // Colapsa 3+ quebras de linha em 2
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
}

/**
 * Divide um texto longo em pedaços de no máximo `max` caracteres, quebrando
 * preferencialmente em parágrafos/linhas (nunca corta no meio de uma palavra).
 * Retorna sempre ao menos um item.
 */
export function splitForWhatsApp(text: string, max: number = WHATSAPP_MAX_CHARS): string[] {
  if (!text) return [''];
  if (text.length <= max) return [text];

  const parts: string[] = [];
  let buffer = '';

  for (const line of text.split('\n')) {
    // Linha sozinha maior que o limite: quebra "dura" por tamanho.
    if (line.length > max) {
      if (buffer) {
        parts.push(buffer);
        buffer = '';
      }
      for (let i = 0; i < line.length; i += max) parts.push(line.slice(i, i + max));
      continue;
    }
    const candidate = buffer ? `${buffer}\n${line}` : line;
    if (candidate.length > max) {
      parts.push(buffer);
      buffer = line;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) parts.push(buffer);
  return parts.length > 0 ? parts : [''];
}
