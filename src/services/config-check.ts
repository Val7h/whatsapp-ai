/**
 * Autodiagnóstico de configuração — em vez de pedir para alguém checar o
 * painel do Render manualmente, o próprio app relata (no boot e via
 * /health) se as variáveis necessárias para lembretes/formulário/resumo
 * diário estão configuradas de verdade, ou se caiu num fallback que não
 * funciona em produção.
 */

export interface ConfigItemStatus {
  configured: boolean;
  value?: string; // só para valores não-sensíveis (URLs, nomes de instância)
  warning?: string;
}

export interface AppointmentsConfigStatus {
  ok: boolean;
  items: Record<string, ConfigItemStatus>;
}

/**
 * Verifica as variáveis necessárias para o fluxo de agendamento/lembretes
 * funcionar de ponta a ponta em produção (não em dev/teste local).
 */
export function checkAppointmentsConfig(env: NodeJS.ProcessEnv = process.env): AppointmentsConfigStatus {
  const items: Record<string, ConfigItemStatus> = {};

  const evolutionUrl = env.EVOLUTION_API_URL;
  const isDockerInternalUrl = !evolutionUrl || /^http:\/\/cto-evolution(:|$)/.test(evolutionUrl);
  items.EVOLUTION_API_URL = isDockerInternalUrl
    ? {
        configured: false,
        value: evolutionUrl,
        warning: 'usando endereço interno do docker-compose — em produção (Render) precisa ser a URL pública do Evolution',
      }
    : { configured: true, value: evolutionUrl };

  items.EVOLUTION_API_KEY = env.EVOLUTION_API_KEY
    ? { configured: true }
    : { configured: false, warning: 'sem chave, o envio via Evolution API será rejeitado' };

  const doctorPhone = env.DOCTOR_PHONE;
  items.DOCTOR_PHONE = doctorPhone
    ? { configured: true, value: doctorPhone }
    : {
        configured: false,
        warning: 'usando fallback interno (@lid) — pode não ser o número correto do médico',
      };

  const formBaseUrl = env.FORM_BASE_URL;
  const isLocalhostUrl = !formBaseUrl || /^https?:\/\/localhost/.test(formBaseUrl);
  items.FORM_BASE_URL = isLocalhostUrl
    ? {
        configured: false,
        value: formBaseUrl,
        warning: 'usando localhost — o link do formulário enviado ao paciente ficará quebrado em produção',
      }
    : { configured: true, value: formBaseUrl };

  items.FORM_SECRET = env.FORM_SECRET
    ? { configured: true }
    : { configured: false, warning: 'usando segredo padrão de desenvolvimento — troque em produção' };

  const ok = Object.values(items).every((i) => i.configured);
  return { ok, items };
}
