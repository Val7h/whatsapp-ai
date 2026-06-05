/**
 * PM Coordinator — Orquestra o comportamento multi-agente
 * Responsável por:
 * 1. Detectar tipo de problema da mensagem
 * 2. Rotear para agente especializado
 * 3. Validar resposta (tom, política, segurança)
 * 4. Aplicar regras globais (conflitos de interesse, etc)
 */

const logger = require('../services/logger').logger;

// ── Tipos de problema que o sistema pode detectar ──────────────────────────────
const PROBLEM_TYPES = {
    URGENCIA: 'urgencia',           // Emergência, pronto-socorro, SAMU
    AGENDAMENTO: 'agendamento',     // Marcação, datas, horários
    CLINICO: 'clinico',             // Dúvidas sobre procedimentos, diagnóstico
    COMERCIAL: 'comercial',         // Preços, convênios, orçamentos
    ACOLHIMENTO: 'acolhimento',     // Internados, situações delicadas
    FAQ: 'faq',                     // Perguntas rotina (endereço, horário)
    POS_OP: 'pos-op',               // Cuidados pós-operatório
    RETORNO: 'retorno',             // Retornos, complicações
    CONFLITO: 'conflito',           // Problema não-resolvível por bots
};

// ── Palavras-chave por tipo ────────────────────────────────────────────────────
const KEYWORDS = {
    [PROBLEM_TYPES.URGENCIA]: {
        keywords: [
            'urgência', 'urgente', 'pronto-socorro', 'ps', 'samu',
            'fratura suspeita', 'luxação', 'trauma agudo', 'acidente',
            'dor intensa', 'febre alta', 'formigamento', 'perda de força',
            'caiu', 'acidente', 'pancada', 'não consigo andar', 'não consigo mexer',
            'sangue', 'hemorragia', 'inconsciente', 'desmaio',
        ],
        confidence: 0.9, // Alta confiança
    },
    [PROBLEM_TYPES.ACOLHIMENTO]: {
        keywords: [
            'internado', 'internada', 'hospital', 'público', 'sus',
            'aguardando cirurgia', 'em fila', 'uti', 'enfermaria', 'leito',
            'particular', 'privado', 'alternativa',
            'operação', 'cirurgia particular',
        ],
        confidence: 0.85,
    },
    [PROBLEM_TYPES.POS_OP]: {
        keywords: [
            'operei', 'operado', 'pós-op', 'pós operação', 'recuperação',
            'febre após', 'após a cirurgia', 'após a operação',
            'muleta', 'gesso', 'fisioterapia',
            'pontos', 'cicatriz', 'inchaço após',
            'dias de operado', 'dias de cirurgia',
        ],
        confidence: 0.8,
    },
    [PROBLEM_TYPES.RETORNO]: {
        keywords: [
            'retorno', 'segunda consulta', 'voltei', 'continuo com', 'ainda dói',
            'complicação', 'piora', 'piorou', 'sintoma novo',
            'revisão', 'acompanhamento', 'evolução',
        ],
        confidence: 0.75,
    },
    [PROBLEM_TYPES.COMERCIAL]: {
        keywords: [
            'preço', 'quanto custa', 'valor', 'orçamento', 'custo',
            'convênio', 'plano', 'unimed', 'bradesco', 'sul américa', 'caixa',
            'desconto', 'promoção', 'financiamento',
            'consulta', 'cirurgia', 'procedimento',
        ],
        confidence: 0.7,
    },
    [PROBLEM_TYPES.CLINICO]: {
        keywords: [
            'o que é', 'como funciona', 'diferença', 'qual a diferença',
            'artrose', 'artrite', 'menisco', 'lca', 'manguito',
            'sintomas de', 'causa de', 'razão da', 'por que',
            'viscossuplementação', 'plasma rico', 'prp',
            'diagnóstico', 'é possível', 'pode tratar',
        ],
        confidence: 0.6,
    },
    [PROBLEM_TYPES.AGENDAMENTO]: {
        keywords: [
            'agendar', 'marcar', 'consulta', 'horário', 'segunda', 'terça', 'quarta', 'quinta', 'sexta',
            'data', 'quando', 'qual dia', 'próximo', 'disponível',
            'unidade', 'campina', 'caruaru', 'palmares', 'cto', 'artro',
            'teleconsulta', 'videochamada',
            'confirmação', 'confirmar',
        ],
        confidence: 0.65,
    },
    [PROBLEM_TYPES.FAQ]: {
        keywords: [
            'endereço', 'horário', 'funcionamento', 'localização',
            'telefone', 'contato', 'como chego',
            'estacionamento', 'preciso levar', 'o que levar', 'documentação',
            'resultado', 'laudo', 'exame', 'acompanhante',
            'preparo', 'preparar',
        ],
        confidence: 0.6,
    },
};

/**
 * Detecta o tipo de problema analisando a mensagem
 * Retorna: { type, confidence, primaryKeywords }
 */
function detectProblemType(message) {
    if (!message || message.length === 0) {
        return { type: PROBLEM_TYPES.FAQ, confidence: 0.3, primaryKeywords: [] };
    }

    const msg = message.toLowerCase();
    const scores = {};

    // ── Calcula score para cada tipo ────────────────────────────────────────
    for (const [type, config] of Object.entries(KEYWORDS)) {
        let matches = 0;
        const found = [];
        for (const keyword of config.keywords) {
            if (msg.includes(keyword)) {
                matches++;
                found.push(keyword);
            }
        }
        if (matches > 0) {
            scores[type] = {
                matches,
                found,
                confidence: config.confidence * (1 + (matches - 1) * 0.1), // bonus por múltiplos matches
            };
        }
    }

    // ── Retorna o tipo com maior score ──────────────────────────────────────
    if (Object.keys(scores).length === 0) {
        return { type: PROBLEM_TYPES.FAQ, confidence: 0.3, primaryKeywords: [] };
    }

    const winner = Object.entries(scores).sort((a, b) => b[1].confidence - a[1].confidence)[0];
    return {
        type: winner[0],
        confidence: Math.min(winner[1].confidence, 1.0),
        primaryKeywords: winner[1].found.slice(0, 3),
    };
}

/**
 * Valida a resposta do agente antes de enviar
 * Retorna: { ok: boolean, issues: string[] }
 */
function validateResponse(reply, problemType, context = {}) {
    const issues = [];

    // ── Verifica se a resposta é vazia/nula ─────────────────────────────────
    if (!reply || reply.trim().length === 0) {
        issues.push('Resposta vazia — modo humano ativado');
        return { ok: false, issues, humanTakeover: true };
    }

    // ── Proibições globais ──────────────────────────────────────────────────
    const prohibitedEmojis = /[😊😁🎉❤️🎂👍🥳]/g;
    if (prohibitedEmojis.test(reply)) {
        issues.push(`Emojis emocionais detectados (${reply.match(prohibitedEmojis).join(', ')})`);
    }

    const prohibitedWords = ['infelizmente', 'ótimo!', 'claro!', 'com prazer', 'fico feliz', 'estou por aqui'];
    for (const word of prohibitedWords) {
        if (reply.toLowerCase().includes(word)) {
            issues.push(`Palavra proibida detectada: "${word}"`);
        }
    }

    // ── Validações específicas por tipo ────────────────────────────────────
    if (problemType === PROBLEM_TYPES.URGENCIA) {
        // Em urgência, DEVE indicar PS ou SAMU de forma explícita
        const urgencyPhrases = ['pronto-socorro', 'ps', 'samu', 'emergência', 'ir ao hospital agora'];
        const hasUrgency = urgencyPhrases.some(p => reply.toLowerCase().includes(p));
        if (!hasUrgency && !context.isMedicalProfessional) {
            issues.push('Resposta de urgência não menciona PS/SAMU adequadamente');
        }
    }

    if (problemType === PROBLEM_TYPES.ACOLHIMENTO) {
        // Em acolhimento, DEVE oferecer contato humano
        const humanPhrases = ['secretária', 'dr. valth', 'contactar', 'conectar', 'ligar', '+55'];
        const hasHuman = humanPhrases.some(p => reply.toLowerCase().includes(p));
        if (!hasHuman) {
            issues.push('Resposta de acolhimento não oferece contato humano direto');
        }
    }

    if (problemType === PROBLEM_TYPES.COMERCIAL) {
        // Comercial não deve soar pusher/agressivo
        const aggressiveWords = ['aproveite', 'não perca', 'urgente', 'agora', 'só hoje'];
        for (const word of aggressiveWords) {
            if (reply.toLowerCase().includes(word)) {
                issues.push(`Tom comercial muito agressivo: "${word}"`);
            }
        }
    }

    return {
        ok: issues.length === 0,
        issues,
        humanTakeover: false,
    };
}

/**
 * Ajusta a resposta para corrigir problemas validados
 * (implementação simples — em produção seria mais sofisticado)
 */
function adjustResponse(reply, issues) {
    let adjusted = reply;

    // Remove emojis emocionais
    adjusted = adjusted.replace(/[😊😁🎉❤️🎂👍🥳]/g, '');

    // Remove palavras proibidas (simplificado)
    adjusted = adjusted.replace(/infelizmente\s+/gi, '');
    adjusted = adjusted.replace(/\bótimo!\s*/gi, '');
    adjusted = adjusted.replace(/\bclaro!\s*/gi, '');

    return adjusted.trim();
}

/**
 * Log detalhado do roteamento
 */
function logRouting(phone, message, detection) {
    logger.info(
        `[pm-coordinator] ${phone} | tipo: ${detection.type} (${(detection.confidence * 100).toFixed(0)}%) ` +
        `| keywords: ${detection.primaryKeywords.join(', ') || '—'}`
    );
}

// ── Exports ────────────────────────────────────────────────────────────────────
module.exports = {
    PROBLEM_TYPES,
    detectProblemType,
    validateResponse,
    adjustResponse,
    logRouting,
};
