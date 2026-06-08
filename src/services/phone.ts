/**
 * Phone utilities — normaliza telefones e extrai DDD corretamente
 * Lida com JIDs do WhatsApp (5583999@s.whatsapp.net, 12345@lid, etc)
 */

/**
 * Normaliza um telefone removendo @s.whatsapp.net, @lid, @c.us, etc
 * Retorna apenas os dígitos
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';

  // Remove qualquer sufixo de JID do WhatsApp
  let phone = rawPhone.split('@')[0];
  // Remove tudo que não for dígito
  phone = phone.replace(/\D/g, '');
  return phone;
}

/**
 * Extrai o DDD (código de área) de um telefone
 * Suporta:
 *   - 5583993476410 (com código do país 55)
 *   - 83993476410 (sem código do país)
 *   - 5583999999999@s.whatsapp.net (JID)
 *   - 12345@lid (não é telefone real - retorna 'invalid')
 *
 * Retorna 2 dígitos do DDD ou 'invalid'
 */
export function extractDDD(rawPhone: string): string {
  if (!rawPhone) return 'invalid';

  // @lid não é um telefone real - é um identificador interno do WhatsApp
  if (rawPhone.includes('@lid')) return 'invalid';

  const phone = normalizePhone(rawPhone);

  // Brasil: 55 + DDD (2 dígitos) + número (8 ou 9 dígitos)
  // Total: 12 ou 13 dígitos
  if (phone.startsWith('55') && (phone.length === 12 || phone.length === 13)) {
    return phone.slice(2, 4);
  }

  // Sem código do país: DDD (2 dígitos) + número (8 ou 9 dígitos)
  // Total: 10 ou 11 dígitos
  if (phone.length === 10 || phone.length === 11) {
    return phone.slice(0, 2);
  }

  return 'invalid';
}

/**
 * Lista de DDDs válidos do Brasil
 */
const VALID_BR_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19', // SP
  '21', '22', '24', // RJ
  '27', '28', // ES
  '31', '32', '33', '34', '35', '37', '38', // MG
  '41', '42', '43', '44', '45', '46', // PR
  '47', '48', '49', // SC
  '51', '53', '54', '55', // RS
  '61', // DF
  '62', '64', // GO
  '63', // TO
  '65', '66', // MT
  '67', // MS
  '68', // AC
  '69', // RO
  '71', '73', '74', '75', '77', // BA
  '79', // SE
  '81', '87', // PE
  '82', // AL
  '83', // PB
  '84', // RN
  '85', '88', // CE
  '86', '89', // PI
  '91', '93', '94', // PA
  '92', '97', // AM
  '95', // RR
  '96', // AP
  '98', '99', // MA
]);

export function isValidBrazilianDDD(ddd: string): boolean {
  return VALID_BR_DDDS.has(ddd);
}

/**
 * Retorna o nome da cidade/região baseado no DDD
 */
export function cityFromDDD(ddd: string, messageText: string = ''): string {
  if (ddd === 'invalid') return 'Inválido';

  const text = messageText.toLowerCase();

  // DDDs com unidades do Dr. Valth
  if (ddd === '83') return 'Campina Grande (PB)';
  if (ddd === '81' || ddd === '87') {
    if (text.includes('palmares')) return 'Palmares (PE)';
    if (text.includes('caruaru')) return 'Caruaru (PE)';
    return 'Caruaru/Palmares (PE)';
  }
  if (ddd === '82') return 'Alagoas (próximo a Palmares)';

  // Outros DDDs - retornar UF
  const ufMap: { [k: string]: string } = {
    '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
    '21': 'RJ', '22': 'RJ', '24': 'RJ',
    '27': 'ES', '28': 'ES',
    '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
    '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
    '47': 'SC', '48': 'SC', '49': 'SC',
    '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
    '61': 'DF',
    '62': 'GO', '64': 'GO', '63': 'TO',
    '65': 'MT', '66': 'MT', '67': 'MS',
    '68': 'AC', '69': 'RO',
    '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA', '79': 'SE',
    '84': 'RN', '85': 'CE', '88': 'CE', '86': 'PI', '89': 'PI',
    '91': 'PA', '93': 'PA', '94': 'PA',
    '92': 'AM', '97': 'AM',
    '95': 'RR', '96': 'AP',
    '98': 'MA', '99': 'MA',
  };

  if (ufMap[ddd]) return `Outras regiões (${ufMap[ddd]})`;
  return 'Outros';
}
