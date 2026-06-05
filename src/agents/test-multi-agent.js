/**
 * TESTES AUTOMATIZADOS — Sistema Multi-Agente
 *
 * Como rodar:
 * npm test -- test-multi-agent.js
 *
 * Testa:
 * 1. Detecção de tipo (PM)
 * 2. Validação de resposta (PM)
 * 3. Cada agente com múltiplos cenários
 */

"use strict";

const pm = require('./pm-coordinator');
const assert = require('assert');

// ════════════════════════════════════════════════════════════════════════════════
// TESTES — PM COORDINATOR
// ════════════════════════════════════════════════════════════════════════════════

describe('PM Coordinator', () => {
    describe('detectProblemType()', () => {
        it('deve detectar URGÊNCIA com alta confiança', () => {
            const msgs = [
                'caí e fraturei o braço',
                'não consigo andar, luxei o joelho',
                'tenho formigamento nos dedos',
                'perda de força súbita',
            ];
            msgs.forEach(msg => {
                const result = pm.detectProblemType(msg);
                assert.strictEqual(result.type, pm.PROBLEM_TYPES.URGENCIA);
                assert(result.confidence > 0.8, `Confiança baixa para: ${msg}`);
            });
        });

        it('deve detectar ACOLHIMENTO quando paciente menciona internação', () => {
            const msgs = [
                'estou internado no hospital público aguardando cirurgia',
                'estou na UTI, preciso de cirurgia particular',
                'aguardando cirurgia no SUS, alternativa privada',
            ];
            msgs.forEach(msg => {
                const result = pm.detectProblemType(msg);
                assert.strictEqual(result.type, pm.PROBLEM_TYPES.ACOLHIMENTO);
                assert(result.confidence > 0.8, `Confiança baixa para: ${msg}`);
            });
        });

        it('deve detectar PÓS-OP quando paciente menciona cirurgia recente', () => {
            const msgs = [
                'operei há 3 dias e tenho inchaço',
                'após a cirurgia estou com febre',
                'pós-operatório com dor intensa',
            ];
            msgs.forEach(msg => {
                const result = pm.detectProblemType(msg);
                assert.strictEqual(result.type, pm.PROBLEM_TYPES.POS_OP);
                assert(result.confidence > 0.7, `Confiança baixa para: ${msg}`);
            });
        });

        it('deve detectar AGENDAMENTO quando paciente quer marcar', () => {
            const msgs = [
                'quero agendar uma consulta',
                'como faço pra marcar com o Dr. Valth?',
                'segunda-feira tem disponível?',
                'qual é o horário de atendimento?',
            ];
            msgs.forEach(msg => {
                const result = pm.detectProblemType(msg);
                assert.strictEqual(result.type, pm.PROBLEM_TYPES.AGENDAMENTO);
                assert(result.confidence > 0.6, `Confiança baixa para: ${msg}`);
            });
        });

        it('deve detectar COMERCIAL quando pergunta sobre preço', () => {
            const msgs = [
                'qual é o valor da consulta?',
                'quanto custa a cirurgia?',
                'vocês aceitam convênio Unimed?',
                'tem desconto para primeira consulta?',
            ];
            msgs.forEach(msg => {
                const result = pm.detectProblemType(msg);
                assert.strictEqual(result.type, pm.PROBLEM_TYPES.COMERCIAL);
                assert(result.confidence > 0.65, `Confiança baixa para: ${msg}`);
            });
        });

        it('deve detectar CLÍNICO quando pergunta sobre condição', () => {
            const msgs = [
                'qual a diferença entre artrose e artrite?',
                'como funciona a viscossuplementação?',
                'o que é lesão de menisco?',
            ];
            msgs.forEach(msg => {
                const result = pm.detectProblemType(msg);
                assert.strictEqual(result.type, pm.PROBLEM_TYPES.CLINICO);
                assert(result.confidence > 0.5, `Confiança baixa para: ${msg}`);
            });
        });

        it('deve detectar FAQ quando pergunta rotina', () => {
            const msgs = [
                'qual o endereço de vocês?',
                'qual o horário de funcionamento?',
                'preciso levar algum documento?',
                'como chego aí?',
            ];
            msgs.forEach(msg => {
                const result = pm.detectProblemType(msg);
                assert.strictEqual(result.type, pm.PROBLEM_TYPES.FAQ);
                assert(result.confidence > 0.5, `Confiança baixa para: ${msg}`);
            });
        });
    });

    describe('validateResponse()', () => {
        it('deve aceitar resposta válida', () => {
            const reply = 'O Dr. Valth atende segundas e quintas em Campina Grande.';
            const result = pm.validateResponse(reply, pm.PROBLEM_TYPES.AGENDAMENTO);
            assert.strictEqual(result.ok, true);
            assert.strictEqual(result.issues.length, 0);
        });

        it('deve rejeitar resposta vazia', () => {
            const reply = '';
            const result = pm.validateResponse(reply, pm.PROBLEM_TYPES.FAQ);
            assert.strictEqual(result.ok, false);
            assert(result.humanTakeover === true);
        });

        it('deve detectar emojis proibidos', () => {
            const reply = 'Tudo bem! 😊 Como posso ajudar? 👍';
            const result = pm.validateResponse(reply, pm.PROBLEM_TYPES.FAQ);
            assert.strictEqual(result.ok, false);
            assert(result.issues.some(i => i.includes('Emojis')));
        });

        it('deve detectar palavras proibidas', () => {
            const reply = 'Infelizmente o Dr. Valth não atende aos sábados.';
            const result = pm.validateResponse(reply, pm.PROBLEM_TYPES.FAQ);
            assert.strictEqual(result.ok, false);
            assert(result.issues.some(i => i.includes('infelizmente')));
        });

        it('deve exigir PS/SAMU em resposta de URGÊNCIA', () => {
            const reply = 'Você pode agendar uma consulta para segunda-feira.';
            const result = pm.validateResponse(reply, pm.PROBLEM_TYPES.URGENCIA);
            assert.strictEqual(result.ok, false);
            assert(result.issues.some(i => i.includes('PS/SAMU')));
        });

        it('deve exigir contato humano em resposta de ACOLHIMENTO', () => {
            const reply = 'O Dr. Valth avalia casos assim regularmente.';
            const result = pm.validateResponse(reply, pm.PROBLEM_TYPES.ACOLHIMENTO);
            assert.strictEqual(result.ok, false);
            assert(result.issues.some(i => i.includes('contato humano')));
        });
    });

    describe('adjustResponse()', () => {
        it('deve remover emojis', () => {
            const reply = 'Olá! 😊 Como você está? 👋';
            const adjusted = pm.adjustResponse(reply, ['Emojis detectados']);
            assert(!adjusted.includes('😊'));
            assert(!adjusted.includes('👋'));
            assert(adjusted.includes('Olá'));
        });

        it('deve remover palavras proibidas', () => {
            const reply = 'Infelizmente não há desconto. Ótimo caso para avaliação.';
            const adjusted = pm.adjustResponse(reply, ['Palavras proibidas']);
            assert(!adjusted.toLowerCase().includes('infelizmente'));
            assert(!adjusted.toLowerCase().includes('ótimo!'));
        });
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// TESTES — AGENTES ESPECÍFICOS (validação de prompts)
// ════════════════════════════════════════════════════════════════════════════════

describe('Agentes Especializados', () => {
    const URGENCIA = require('./urgencia-agent');
    const ACOLHIMENTO = require('./acolhimento-agent');
    const AGENDAMENTO = require('./agendamento-agent');
    const COMERCIAL = require('./comercial-agent');
    const CLINICO = require('./clinico-agent');
    const FAQ = require('./faq-agent');
    const POS_OP = require('./pos-op-agent');
    const RETORNO = require('./retorno-agent');

    describe('URGÊNCIA', () => {
        it('deve ter getSystemPrompt() que menciona PS/SAMU', () => {
            const prompt = URGENCIA.getSystemPrompt();
            assert(prompt.includes('PS') || prompt.includes('SAMU'));
            assert(prompt.includes('pronto-socorro'));
        });

        it('deve ter name e description', () => {
            assert.strictEqual(URGENCIA.name, 'urgencia');
            assert(URGENCIA.description.length > 0);
        });
    });

    describe('ACOLHIMENTO', () => {
        it('deve ter getSystemPrompt() que menciona contato humano', () => {
            const prompt = ACOLHIMENTO.getSystemPrompt();
            assert(prompt.includes('secretária') || prompt.includes('+55'));
            assert(prompt.includes('internado'));
        });

        it('deve ter name e description', () => {
            assert.strictEqual(ACOLHIMENTO.name, 'acolhimento');
            assert(ACOLHIMENTO.description.length > 0);
        });
    });

    describe('AGENDAMENTO', () => {
        it('deve ter getSystemPrompt() com fluxo de agendamento', () => {
            const prompt = AGENDAMENTO.getSystemPrompt();
            assert(prompt.includes('FLUXO') || prompt.includes('motivo'));
            assert(prompt.includes('CTO'));
        });

        it('deve ter name e description', () => {
            assert.strictEqual(AGENDAMENTO.name, 'agendamento');
            assert(AGENDAMENTO.description.length > 0);
        });
    });

    describe('COMERCIAL', () => {
        it('deve ter getSystemPrompt() com informações de preço', () => {
            const prompt = COMERCIAL.getSystemPrompt();
            assert(prompt.includes('R$') || prompt.includes('400'));
            assert(prompt.includes('convênio') || prompt.includes('Unimed'));
        });

        it('deve ter name e description', () => {
            assert.strictEqual(COMERCIAL.name, 'comercial');
            assert(COMERCIAL.description.length > 0);
        });
    });

    describe('CLÍNICO', () => {
        it('deve ter getSystemPrompt() com regras clínicas', () => {
            const prompt = CLINICO.getSystemPrompt();
            assert(prompt.includes('diagnóstico') || prompt.includes('NUNCA'));
            assert(prompt.includes('prescreva'));
        });

        it('deve ter name e description', () => {
            assert.strictEqual(CLINICO.name, 'clinico');
            assert(CLINICO.description.length > 0);
        });
    });

    describe('FAQ', () => {
        it('deve ter getSystemPrompt() com informações fixas', () => {
            const prompt = FAQ.getSystemPrompt();
            assert(prompt.includes('endereço') || prompt.includes('horário'));
            assert(prompt.includes('telefone') || prompt.includes('contato'));
        });

        it('deve ter name e description', () => {
            assert.strictEqual(FAQ.name, 'faq');
            assert(FAQ.description.length > 0);
        });
    });

    describe('PÓS-OP', () => {
        it('deve ter getSystemPrompt() com cuidados pós-operatório', () => {
            const prompt = POS_OP.getSystemPrompt();
            assert(prompt.includes('febre') || prompt.includes('inchaço'));
            assert(prompt.includes('PS') || prompt.includes('alerta'));
        });

        it('deve ter name e description', () => {
            assert.strictEqual(POS_OP.name, 'pos-op');
            assert(POS_OP.description.length > 0);
        });
    });

    describe('RETORNO', () => {
        it('deve ter getSystemPrompt() com avaliação de evolução', () => {
            const prompt = RETORNO.getSystemPrompt();
            assert(prompt.includes('retorno') || prompt.includes('evolução'));
            assert(prompt.includes('melhorou') || prompt.includes('piora'));
        });

        it('deve ter name e description', () => {
            assert.strictEqual(RETORNO.name, 'retorno');
            assert(RETORNO.description.length > 0);
        });
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// TESTES DE INTEGRAÇÃO — Cenários Completos
// ════════════════════════════════════════════════════════════════════════════════

describe('Cenários de Integração', () => {
    it('T1: Paciente com urgência → URGÊNCIA', () => {
        const message = 'caí e meu joelho saiu do lugar, não consigo andar!';
        const detection = pm.detectProblemType(message);
        assert.strictEqual(detection.type, pm.PROBLEM_TYPES.URGENCIA);
        assert(detection.confidence > 0.85);
    });

    it('T2: Paciente internado → ACOLHIMENTO', () => {
        const message = 'estou na UTI do hospital público com lesão no joelho, preciso de cirurgia particular';
        const detection = pm.detectProblemType(message);
        assert.strictEqual(detection.type, pm.PROBLEM_TYPES.ACOLHIMENTO);
        assert(detection.confidence > 0.80);
    });

    it('T3: Pós-operatório com complicação → PÓS-OP', () => {
        const message = 'operei há 3 dias e estou com muita febre';
        const detection = pm.detectProblemType(message);
        assert.strictEqual(detection.type, pm.PROBLEM_TYPES.POS_OP);
    });

    it('T4: Pergunta de agendamento → AGENDAMENTO', () => {
        const message = 'quero marcar uma consulta para segunda-feira';
        const detection = pm.detectProblemType(message);
        assert.strictEqual(detection.type, pm.PROBLEM_TYPES.AGENDAMENTO);
    });

    it('T5: Pergunta sobre preço → COMERCIAL', () => {
        const message = 'quanto custa uma cirurgia de menisco?';
        const detection = pm.detectProblemType(message);
        assert.strictEqual(detection.type, pm.PROBLEM_TYPES.COMERCIAL);
    });

    it('T6: Pergunta clínica → CLÍNICO', () => {
        const message = 'qual a diferença entre artrose e artrite?';
        const detection = pm.detectProblemType(message);
        assert.strictEqual(detection.type, pm.PROBLEM_TYPES.CLINICO);
    });

    it('T7: Pergunta rotina → FAQ', () => {
        const message = 'qual o endereço de vocês?';
        const detection = pm.detectProblemType(message);
        assert.strictEqual(detection.type, pm.PROBLEM_TYPES.FAQ);
    });

    it('T8: Retorno de paciente → RETORNO', () => {
        const message = 'fui operado há 3 meses e continuo com dor';
        const detection = pm.detectProblemType(message);
        assert.strictEqual(detection.type, pm.PROBLEM_TYPES.RETORNO);
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// TESTES DE REGRESSÃO — Casos que causaram problemas antes
// ════════════════════════════════════════════════════════════════════════════════

describe('Regressão', () => {
    it('não deve confundir "segunda" com agendamento quando é dia de semana', () => {
        const message = 'qual é segunda-feira próxima para agendar?';
        const detection = pm.detectProblemType(message);
        assert.strictEqual(detection.type, pm.PROBLEM_TYPES.AGENDAMENTO);
    });

    it('não deve confundir internação com urgência', () => {
        const message = 'estou internado aguardando cirurgia';
        const detection = pm.detectProblemType(message);
        assert.strictEqual(detection.type, pm.PROBLEM_TYPES.ACOLHIMENTO);
        assert(detection.confidence > pm.detectProblemType('estou internado').confidence);
    });

    it('não deve confundir "consulta" com agendamento quando é FAQ', () => {
        const message = 'quanto tempo dura uma consulta?';
        const detection = pm.detectProblemType(message);
        // Pode ser CLINICO ou FAQ, ambos aceitáveis
        assert([pm.PROBLEM_TYPES.CLINICO, pm.PROBLEM_TYPES.FAQ].includes(detection.type));
    });

    it('deve respeitar resposta nula como modo humano', () => {
        const reply = '';
        const validation = pm.validateResponse(reply, pm.PROBLEM_TYPES.FAQ);
        assert.strictEqual(validation.ok, false);
        assert.strictEqual(validation.humanTakeover, true);
    });

    it('deve remover emojis mas manter conteúdo', () => {
        const original = 'Ótimo! 😊 Agende agora! 🎉';
        const adjusted = pm.adjustResponse(original, ['Emojis', 'Palavras']);
        assert(adjusted.includes('Agende'));
        assert(!adjusted.includes('😊'));
        assert(!adjusted.includes('Ótimo'));
    });
});

// ════════════════════════════════════════════════════════════════════════════════
// SUMÁRIO
// ════════════════════════════════════════════════════════════════════════════════

console.log(`
✅ Sistema Multi-Agente — Testes Prontos

Executar com:
  npm test -- test-multi-agent.js

Testes incluem:
  ✓ Detecção de tipo (PM)
  ✓ Validação de resposta (PM)
  ✓ 8 agentes especializados
  ✓ 8 cenários de integração
  ✓ 6 testes de regressão

Total: 30+ testes

Cobertura:
  • URGÊNCIA: fratura, luxação, PS/SAMU
  • ACOLHIMENTO: internados, UTI, cirurgia privada
  • PÓS-OP: febre, inchaço, sinais de alerta
  • AGENDAMENTO: marcação, datas, horários
  • COMERCIAL: preços, convênios
  • CLÍNICO: educação, diferenças
  • FAQ: endereço, horário, documentação
  • RETORNO: evolução, complicações
`);

module.exports = { pm };
