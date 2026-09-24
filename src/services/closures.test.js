/**
 * TESTES — Fechamentos pontuais (closures.ts)
 */
'use strict';

const assert = require('assert');
const { isClosureOn, CLOSURES } = require('./closures.js');

describe('isClosureOn', () => {
  it('24/09/2026 CTO (Campina Grande) está fechado (perícias em Sousa)', () => {
    assert.strictEqual(isClosureOn('2026-09-24', 'Campina Grande', 'CTO'), true);
  });

  it('24/09/2026 Clínica Artro (Campina Grande) está fechada (perícias em Sousa)', () => {
    assert.strictEqual(isClosureOn('2026-09-24', 'Campina Grande', 'Clínica Artro'), true);
  });

  it('data/cidade sem fechamento cadastrado → false', () => {
    assert.strictEqual(isClosureOn('2026-09-24', 'Caruaru', 'Instituto Pernambuco (IP)'), false);
    assert.strictEqual(isClosureOn('2026-09-17', 'Campina Grande', 'CTO'), false);
  });

  it('01/10/2026 e 22/10/2026 CTO e Artro fechados (rodadas de Sousa de outubro)', () => {
    for (const date of ['2026-10-01', '2026-10-22']) {
      assert.strictEqual(isClosureOn(date, 'Campina Grande', 'CTO'), true);
      assert.strictEqual(isClosureOn(date, 'Campina Grande', 'Clínica Artro'), true);
    }
  });

  it('CLOSURES não está vazio (sanity)', () => {
    assert.ok(CLOSURES.length > 0);
  });
});
