import crypto from 'crypto';

const SECRET = process.env.FORM_SECRET || 'dev-secret-change-in-prod';

export function gerarToken(agendamento_id: string, exp: number): string {
  return crypto
    .createHmac('sha256', SECRET)
    .update(`${agendamento_id}:${exp}`)
    .digest('hex');
}

export function validarToken(
  agendamento_id: string,
  exp: string | number,
  token: string
): { valido: boolean; motivo: string | null } {
  const expNum = parseInt(String(exp));

  if (Date.now() > expNum) {
    return { valido: false, motivo: 'expirado' };
  }

  const esperado = crypto
    .createHmac('sha256', SECRET)
    .update(`${agendamento_id}:${expNum}`)
    .digest('hex');

  const valido = crypto.timingSafeEqual(
    Buffer.from(token, 'hex'),
    Buffer.from(esperado, 'hex')
  );

  return { valido, motivo: valido ? null : 'invalido' };
}
