/** Chave PIX do recebimento. O pagador vê o nome cadastrado nesse CPF no banco. */
export const PIX_KEY = '05845141664';
export const PIX_RECEIVER_LABEL = 'Programação STOLL - Juliandro Correa';
/** O QR só aceita 25 letras. O arquivo mostra o nome completo. */
export const PIX_RECEIVER_NAME = 'STOLL JULIANDRO CORREA';
export const PIX_RECEIVER_CITY = 'BRASIL';

function tlv(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
}

function pixText(value: string, max: number) {
  const plain = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  return (plain || 'TRICOT').slice(0, max);
}

/** CRC16-CCITT (0x1021, inicial 0xFFFF), como o BR Code exige. */
export function pixCrc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function formatPixCpf(key: string) {
  const digits = key.replace(/\D/g, '');
  if (digits.length !== 11) return key;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function buildPixPayload(amount: number, txid = '***') {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('O valor do PIX precisa ser maior que zero.');
  }
  const key = PIX_KEY.replace(/\D/g, '');
  const merchant = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  const reference = txid.replace(/[^A-Za-z0-9*]/g, '').slice(0, 25) || '***';
  const body = [
    tlv('00', '01'),
    tlv('01', '11'),
    tlv('26', merchant),
    tlv('52', '0000'),
    tlv('53', '986'),
    tlv('54', amount.toFixed(2)),
    tlv('58', 'BR'),
    tlv('59', pixText(PIX_RECEIVER_NAME, 25)),
    tlv('60', pixText(PIX_RECEIVER_CITY, 15)),
    tlv('62', tlv('05', reference)),
    '6304',
  ].join('');
  return body + pixCrc16(body);
}
