/**
 * TESTES — Autodiagnóstico de configuração (config-check.ts)
 */
'use strict';

const assert = require('assert');
const { checkAppointmentsConfig } = require('./config-check.js');

describe('checkAppointmentsConfig', () => {
  it('sem nenhuma variável configurada → ok:false, todos os itens sinalizados', () => {
    const status = checkAppointmentsConfig({});
    assert.strictEqual(status.ok, false);
    assert.strictEqual(status.items.EVOLUTION_API_URL.configured, false);
    assert.strictEqual(status.items.EVOLUTION_API_KEY.configured, false);
    assert.strictEqual(status.items.DOCTOR_PHONE.configured, false);
    assert.strictEqual(status.items.FORM_BASE_URL.configured, false);
    assert.strictEqual(status.items.FORM_SECRET.configured, false);
  });

  it('URL do Evolution apontando pro docker interno conta como NÃO configurada', () => {
    const status = checkAppointmentsConfig({ EVOLUTION_API_URL: 'http://cto-evolution:8080' });
    assert.strictEqual(status.items.EVOLUTION_API_URL.configured, false);
  });

  it('URL pública do Evolution conta como configurada', () => {
    const status = checkAppointmentsConfig({ EVOLUTION_API_URL: 'https://cto-evolution.onrender.com' });
    assert.strictEqual(status.items.EVOLUTION_API_URL.configured, true);
  });

  it('FORM_BASE_URL em localhost conta como NÃO configurada', () => {
    const status = checkAppointmentsConfig({ FORM_BASE_URL: 'http://localhost:3030' });
    assert.strictEqual(status.items.FORM_BASE_URL.configured, false);
  });

  it('FORM_BASE_URL pública conta como configurada', () => {
    const status = checkAppointmentsConfig({ FORM_BASE_URL: 'https://whatsapp-ai-9fes.onrender.com' });
    assert.strictEqual(status.items.FORM_BASE_URL.configured, true);
  });

  it('com tudo configurado corretamente → ok:true', () => {
    const status = checkAppointmentsConfig({
      EVOLUTION_API_URL: 'https://cto-evolution.onrender.com',
      EVOLUTION_API_KEY: 'chave-real',
      DOCTOR_PHONE: '5581999179609',
      FORM_BASE_URL: 'https://whatsapp-ai-9fes.onrender.com',
      FORM_SECRET: 'segredo-real-longo',
    });
    assert.strictEqual(status.ok, true);
    assert.ok(Object.values(status.items).every((i) => !i.warning));
  });

  it('valores de DOCTOR_PHONE/URLs aparecem no relatório (não são segredo)', () => {
    const status = checkAppointmentsConfig({ DOCTOR_PHONE: '5581999179609' });
    assert.strictEqual(status.items.DOCTOR_PHONE.value, '5581999179609');
  });
});
