/**
 * CNPJ: normalização, validação e máscara.
 *
 * A validação segue o algoritmo da Receita Federal sobre (código ASCII - 48) de
 * cada caractere, o que cobre de uma vez o CNPJ numérico e o alfanumérico
 * (para dígitos, ASCII - 48 é o próprio valor). Os dois DVs são sempre dígitos.
 */

/** Maiúsculas e sem máscara. Com 12 ou 13 caracteres, devolve os zeros à
 * esquerda que o Excel e o JSON numérico costumam comer; abaixo disso a entrada
 * é inválida e continua inválida. */
export function normalizeCnpj(raw: string | null | undefined): string {
  const clean = (raw ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  return clean.length === 12 || clean.length === 13
    ? clean.padStart(14, '0')
    : clean;
}

function checkDigit(chars: string, firstWeight: number): number {
  let sum = 0;
  let weight = firstWeight;
  for (const ch of chars) {
    sum += (ch.charCodeAt(0) - 48) * weight;
    weight = weight === 2 ? 9 : weight - 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Os dois dígitos verificadores dos 12 primeiros caracteres. */
export function cnpjCheckDigits(base12: string): string {
  const d1 = checkDigit(base12, 5);
  const d2 = checkDigit(base12 + d1, 6);
  return `${d1}${d2}`;
}

/** 12 alfanuméricos + 2 dígitos com DV coerente. Sequências de um mesmo dígito
 * fecham o módulo 11 em alguns casos, mas não são CNPJ de ninguém. */
export function isValidCnpj(raw: string | null | undefined): boolean {
  const c = normalizeCnpj(raw);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{11}/.test(c)) {
    return false;
  }
  return cnpjCheckDigits(c.slice(0, 12)) === c.slice(12);
}

/**
 * Documento fiscal do destinatário: CNPJ (14) ou CPF (11), só pelo formato.
 * O dado vem da própria nota, que é a autoridade; recusar por DV recusaria
 * nota legítima. O DV só é exigido onde há digitação humana (cadastro de loja).
 */
export function isValidTaxId(raw: string | null | undefined): boolean {
  const c = normalizeCnpj(raw);
  return /^\d{11}$/.test(c) || /^[0-9A-Z]{12}\d{2}$/.test(c);
}

/** 00.000.000/0000-00 */
export function formatCnpj(raw: string | null | undefined): string {
  const c = normalizeCnpj(raw);
  if (c.length !== 14) {
    return c;
  }
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
