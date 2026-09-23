/**
 * TESTES — Formatação WhatsApp
 */
'use strict';

const assert = require('assert');
const { toWhatsApp, splitForWhatsApp, WHATSAPP_MAX_CHARS } = require('./whatsapp-format.js');

describe('toWhatsApp', () => {
  it('converte **negrito** em *negrito*', () => {
    assert.strictEqual(toWhatsApp('**Bom dia**, João'), '*Bom dia*, João');
  });

  it('converte múltiplos negritos na mesma linha', () => {
    assert.strictEqual(toWhatsApp('**A** e **B**'), '*A* e *B*');
  });

  it('remove títulos markdown mantendo o texto', () => {
    assert.strictEqual(toWhatsApp('## Horários\nSegunda 08h'), 'Horários\nSegunda 08h');
  });

  it('converte listas "-"/"*" em "•"', () => {
    assert.strictEqual(toWhatsApp('- Campina\n- Caruaru'), '• Campina\n• Caruaru');
    assert.strictEqual(toWhatsApp('* Palmares'), '• Palmares');
  });

  it('não altera itálico _x_ (igual nos dois)', () => {
    assert.strictEqual(toWhatsApp('_importante_'), '_importante_');
  });

  it('colapsa quebras de linha em excesso', () => {
    assert.strictEqual(toWhatsApp('a\n\n\n\nb'), 'a\n\nb');
  });

  it('texto vazio é no-op', () => {
    assert.strictEqual(toWhatsApp(''), '');
  });

  it('caso combinado realista', () => {
    const input = '**Bom dia, João.** O Dr. Valth atende em:\n- Campina Grande\n- Caruaru';
    const out = toWhatsApp(input);
    assert.ok(out.includes('*Bom dia, João.*'));
    assert.ok(!out.includes('**'));
    assert.ok(out.includes('• Campina Grande'));
  });
});

describe('splitForWhatsApp', () => {
  it('texto curto fica em uma única parte', () => {
    assert.deepStrictEqual(splitForWhatsApp('curto'), ['curto']);
  });

  it('divide texto longo respeitando o limite', () => {
    const linha = 'x'.repeat(100);
    const texto = Array(60).fill(linha).join('\n'); // ~6000 chars
    const partes = splitForWhatsApp(texto, WHATSAPP_MAX_CHARS);
    assert.ok(partes.length > 1);
    assert.ok(partes.every((p) => p.length <= WHATSAPP_MAX_CHARS));
    // Nada se perde: junta de volta tem o mesmo conteúdo (sem contar separadores)
    assert.strictEqual(partes.join('\n').replace(/\n/g, ''), texto.replace(/\n/g, ''));
  });

  it('quebra dura quando uma linha excede o limite', () => {
    const partes = splitForWhatsApp('y'.repeat(50), 20);
    assert.ok(partes.every((p) => p.length <= 20));
    assert.strictEqual(partes.join(''), 'y'.repeat(50));
  });
});
