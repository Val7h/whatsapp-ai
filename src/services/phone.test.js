/**
 * TESTES — phone.ts (extração de DDD e mascaramento p/ logs)
 */
'use strict';

const assert = require('assert');
const { extractDDD, maskPhone, normalizePhone } = require('./phone.js');

describe('extractDDD', () => {
  it('número com código do país (5583...) → 83', () => {
    assert.strictEqual(extractDDD('5583999990001'), '83');
  });
  it('número PE com 9º dígito (5581...) → 81', () => {
    assert.strictEqual(extractDDD('5581999294960'), '81');
  });
  it('sem código do país (8 dígitos locais) → DDD', () => {
    assert.strictEqual(extractDDD('8333334444'), '83');
  });
  it('JID do WhatsApp resolve o número real', () => {
    assert.strictEqual(extractDDD('5582999990003@s.whatsapp.net'), '82');
  });
  it('@lid retorna "lid"', () => {
    assert.strictEqual(extractDDD('12345@lid'), 'lid');
  });
  it('lixo retorna "invalid"', () => {
    assert.strictEqual(extractDDD('123'), 'invalid');
  });
});

describe('maskPhone', () => {
  it('mantém só os 4 últimos dígitos', () => {
    assert.strictEqual(maskPhone('5583999990001'), '*********0001');
  });
  it('normaliza JID antes de mascarar', () => {
    assert.strictEqual(maskPhone('5583999990001@s.whatsapp.net'), '*********0001');
  });
  it('curtos viram ****', () => {
    assert.strictEqual(maskPhone('12'), '****');
  });
  it('não vaza dígitos além dos 4 finais', () => {
    const masked = maskPhone('5583999990001');
    assert.ok(masked.endsWith('0001'));
    assert.ok(!masked.includes(normalizePhone('5583999990001').slice(0, 5)));
  });
});
