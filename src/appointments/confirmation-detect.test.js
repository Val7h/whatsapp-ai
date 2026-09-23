/**
 * TESTES — Detector de confirmação de véspera (confirmation-detect.ts)
 */
'use strict';

const assert = require('assert');
const { interpretConfirmationReply } = require('./confirmation-detect.js');

describe('interpretConfirmationReply', () => {
  it('"sim" → confirmado', () => {
    assert.strictEqual(interpretConfirmationReply('sim'), 'confirmado');
  });
  it('"Sim, confirmo!" → confirmado', () => {
    assert.strictEqual(interpretConfirmationReply('Sim, confirmo!'), 'confirmado');
  });
  it('"pode confirmar" → confirmado', () => {
    assert.strictEqual(interpretConfirmationReply('pode confirmar sim'), 'confirmado');
  });

  it('"não" → risco_falta', () => {
    assert.strictEqual(interpretConfirmationReply('não'), 'risco_falta');
  });
  it('"não vou poder ir amanhã" → risco_falta', () => {
    assert.strictEqual(interpretConfirmationReply('não vou poder ir amanhã'), 'risco_falta');
  });
  it('"preciso cancelar" → risco_falta', () => {
    assert.strictEqual(interpretConfirmationReply('preciso cancelar minha consulta'), 'risco_falta');
  });

  it('mensagem ambígua/irrelevante → null', () => {
    assert.strictEqual(interpretConfirmationReply('qual o endereço da clínica?'), null);
  });
  it('string vazia → null', () => {
    assert.strictEqual(interpretConfirmationReply(''), null);
  });

  it('"sim" dentro de outra palavra não conta (limite de palavra)', () => {
    // "assim" contém "sim" como substring, mas não como palavra isolada
    assert.strictEqual(interpretConfirmationReply('assim está bem pra mim'), null);
  });

  it('negação tem prioridade sobre afirmação em mensagens mistas', () => {
    // contém "confirmo" (afirmativo) E "não" (negativo) — negação vence
    assert.strictEqual(interpretConfirmationReply('não, mas confirmo para semana que vem'), 'risco_falta');
  });
});
