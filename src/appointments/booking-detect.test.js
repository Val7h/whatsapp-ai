/**
 * TESTES — Detector de agendamento confirmado (booking-detect.ts)
 *
 * Grade (schedule.ts): Seg=CTO(Campina,08h)+Intensiva Day(Caruaru,17h) |
 * Ter=Mário Bento(Palmares,10h) | Qua=IP(Caruaru,09h)+Unimagem(Caruaru,14h) |
 * Qui=CTO(Campina,08h)+Clínica Artro(Campina,15h).
 *
 * Referência de dias em 2026-06: 15=seg 16=ter 17=qua 18=qui 19=sex 20=sab
 * 21=dom 22=seg 23=ter 24=qua(feriado São João) 25=qui.
 */
'use strict';

const assert = require('assert');
const { detectBooking, CONFIRMATION_PHRASES } = require('./booking-detect.js');

const at = (iso) => new Date(`${iso}-03:00`);

describe('detectBooking — gates de segurança', () => {
  it('sem frase de confirmação → null', () => {
    const r = detectBooking('Vamos para o CTO então.', 'quero ir no CTO', at('2026-06-15T10:00:00'));
    assert.strictEqual(r, null);
  });

  it('confirmação sem nenhuma clínica mencionada → null', () => {
    const r = detectBooking('Confirmado! Te aguardamos.', 'ok', at('2026-06-15T10:00:00'));
    assert.strictEqual(r, null);
  });

  it('confirmação com DUAS clínicas mencionadas (ambíguo) → null', () => {
    const r = detectBooking(
      'Confirmado! CTO ou Clínica Artro, como preferir.',
      'tanto faz',
      at('2026-06-15T10:00:00'),
    );
    assert.strictEqual(r, null);
  });

  it('CONFIRMATION_PHRASES não está vazio (sanity)', () => {
    assert.ok(CONFIRMATION_PHRASES.length > 5);
  });
});

describe('detectBooking — resolução por dia da semana explícito', () => {
  it('menciona weekday válido para a clínica → usa a próxima ocorrência', () => {
    // now = segunda 15/06; "quinta" + Clínica Artro (só quinta) → próxima quinta = 18/06
    const r = detectBooking(
      'Confirmado para quinta na Clínica Artro em Campina Grande.',
      'pode ser quinta',
      at('2026-06-15T10:00:00'),
    );
    assert.ok(r);
    assert.strictEqual(r.date, '2026-06-18');
    assert.strictEqual(r.time, '15:00');
    assert.strictEqual(r.city, 'Campina Grande');
  });

  it('menciona weekday que a clínica NÃO atende → ignora o palpite e usa o próximo dia real', () => {
    // now = segunda 15/06; texto diz "segunda" mas IP só atende quarta → próxima quarta = 17/06
    const r = detectBooking(
      'Confirmado na IP para segunda.',
      'segunda-feira mesmo',
      at('2026-06-15T09:00:00'),
    );
    assert.ok(r);
    assert.strictEqual(r.date, '2026-06-17');
    assert.strictEqual(r.time, '09:00');
    assert.strictEqual(r.city, 'Caruaru');
  });
});

describe('detectBooking — "hoje" e "amanhã"', () => {
  it('"hoje" quando bate com o dia da clínica → usa hoje', () => {
    const r = detectBooking(
      'Confirmado, você será atendido hoje na Clínica Artro.',
      'hoje mesmo',
      at('2026-06-18T10:00:00'), // quinta
    );
    assert.ok(r);
    assert.strictEqual(r.date, '2026-06-18');
  });

  it('"hoje" quando NÃO bate com o dia da clínica → ignora e usa o próximo dia real', () => {
    const r = detectBooking(
      'Confirmado hoje na Clínica Artro.',
      'hoje',
      at('2026-06-17T10:00:00'), // quarta — Artro só atende quinta
    );
    assert.ok(r);
    assert.strictEqual(r.date, '2026-06-18'); // quinta seguinte (amanhã)
  });

  it('"amanhã" quando bate com o dia da clínica → usa amanhã', () => {
    const r = detectBooking(
      'Confirmado para amanhã no CTO.',
      'amanha',
      at('2026-06-17T10:00:00'), // quarta; amanhã = quinta, CTO atende quinta
    );
    assert.ok(r);
    assert.strictEqual(r.date, '2026-06-18');
    assert.strictEqual(r.time, '08:00');
  });
});

describe('detectBooking — sem sinal de data (usa o próximo dia da clínica)', () => {
  it('sem weekday/hoje/amanhã → próxima ocorrência da clínica', () => {
    // now = segunda 15/06; Clínica Mário Bento (Palmares) só atende terça → 16/06
    const r = detectBooking(
      'Reservado na Clínica Mário Bento para você.',
      'ok',
      at('2026-06-15T10:00:00'),
    );
    assert.ok(r);
    assert.strictEqual(r.date, '2026-06-16');
    assert.strictEqual(r.time, '10:00');
  });
});

describe('detectBooking — feriado empurra para a próxima semana', () => {
  it('quando a próxima ocorrência cai em feriado, avança 7 dias', () => {
    // now = sexta 19/06; próxima quarta (IP) seria 24/06 = São João (feriado) → 01/07
    const r = detectBooking('Confirmado na IP.', 'ok', at('2026-06-19T10:00:00'));
    assert.ok(r);
    assert.strictEqual(r.date, '2026-07-01');
    assert.strictEqual(r.time, '09:00');
  });
});

describe('detectBooking — apelidos e limites de palavra', () => {
  it('"IP" isolado é reconhecido como a clínica', () => {
    const r = detectBooking('Confirmado, IP quarta-feira.', 'ok', at('2026-06-15T10:00:00'));
    assert.ok(r);
    assert.strictEqual(r.city, 'Caruaru');
  });

  it('"equipe"/"participar" (contêm "ip") NÃO disparam falso positivo', () => {
    const r = detectBooking(
      'Confirmado! Nossa equipe vai te ajudar a participar da consulta.',
      'ok',
      at('2026-06-15T10:00:00'),
    );
    assert.strictEqual(r, null);
  });
});

describe('detectBooking — fallback para a mensagem do paciente', () => {
  it('clínica mencionada só na mensagem do paciente ainda é detectada', () => {
    const r = detectBooking(
      'Perfeito, está confirmado! Nos vemos em breve.',
      'quero ir na Clínica Artro',
      at('2026-06-15T10:00:00'),
    );
    assert.ok(r);
    assert.strictEqual(r.unit, 'Clínica Artro — Campina Grande');
  });
});
