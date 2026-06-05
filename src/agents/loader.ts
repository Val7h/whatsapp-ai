/**
 * Agent Loader — Carrega agentes em runtime
 */

// @ts-ignore
export function loadAgents() {
  // @ts-ignore
  const pm = require('./pm-coordinator.js');

  const AGENTS: Record<string, any> = {
    // @ts-ignore
    [pm.PROBLEM_TYPES.URGENCIA]: require('./urgencia-agent.js'),
    // @ts-ignore
    [pm.PROBLEM_TYPES.ACOLHIMENTO]: require('./acolhimento-agent.js'),
    // @ts-ignore
    [pm.PROBLEM_TYPES.AGENDAMENTO]: require('./agendamento-agent.js'),
    // @ts-ignore
    [pm.PROBLEM_TYPES.CLINICO]: require('./clinico-agent.js'),
    // @ts-ignore
    [pm.PROBLEM_TYPES.COMERCIAL]: require('./comercial-agent.js'),
    // @ts-ignore
    [pm.PROBLEM_TYPES.FAQ]: require('./faq-agent.js'),
    // @ts-ignore
    [pm.PROBLEM_TYPES.POS_OP]: require('./pos-op-agent.js'),
    // @ts-ignore
    [pm.PROBLEM_TYPES.RETORNO]: require('./retorno-agent.js'),
  };

  return { pm, AGENTS };
}
