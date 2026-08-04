/**
 * TESTES — roteamento de prompt por instância (system.ts)
 */
'use strict';

const assert = require('assert');
const { getSystemPrompt, hasSystemPrompt } = require('./system.js');

describe('hasSystemPrompt', () => {
  it('reconhece as instâncias cto-*', () => {
    assert.strictEqual(hasSystemPrompt('cto-caruaru'), true);
    assert.strictEqual(hasSystemPrompt('cto-campina'), true);
    assert.strictEqual(hasSystemPrompt('cto-geral'), true);
  });
  it('reconhece as instâncias ddd-*', () => {
    assert.strictEqual(hasSystemPrompt('ddd-81-choice'), true);
    assert.strictEqual(hasSystemPrompt('ddd-83-campina'), true);
  });
  it('rejeita instância desconhecida e vazia', () => {
    assert.strictEqual(hasSystemPrompt('xpto'), false);
    assert.strictEqual(hasSystemPrompt(''), false);
    assert.strictEqual(hasSystemPrompt(undefined), false);
  });
});

describe('getSystemPrompt', () => {
  it('cto-caruaru retorna um prompt específico (diferente do geral)', () => {
    assert.notStrictEqual(getSystemPrompt('cto-caruaru'), getSystemPrompt('cto-geral'));
  });
  it('instância desconhecida cai no prompt geral', () => {
    assert.strictEqual(getSystemPrompt('xpto'), getSystemPrompt('cto-geral'));
  });
  it('todos os prompts de localização trazem as regras médicas (PS/SAMU)', () => {
    for (const inst of ['cto-caruaru', 'cto-campina', 'cto-geral', 'ddd-81-choice']) {
      const p = getSystemPrompt(inst);
      assert.ok(/PS|SAMU/.test(p), `prompt ${inst} sem regra de urgência`);
    }
  });
});
