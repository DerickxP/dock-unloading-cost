/**
 * Chave de acesso da NF-e: a identidade única da nota no sistema.
 *
 * É por ela que a ingestão deduplica notas vindas de fontes diferentes e que a
 * nota digitada na doca (a partir do DANFE impresso) é reconciliada quando o
 * XML chega. Como entra por leitor de código de barras ou digitação, sempre é
 * validada.
 *
 * Layout: cUF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) tpEmis(1)
 * cNF(8) DV(1) = 44 dígitos. DV = módulo 11 com pesos 2..9 da direita para a
 * esquerda; resto 0 ou 1 dá DV 0.
 *
 * O CNPJ embutido é o do emitente do documento, que nem sempre é o fornecedor
 * da mercadoria; serve para pré-preencher, não como fonte de verdade.
 */

/** Só os dígitos (o DANFE imprime em grupos de 4). */
export function accessKeyDigits(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '');
}

export function accessKeyCheckDigit(base43: string): string {
  let sum = 0;
  let weight = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    sum += Number(base43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const dv = 11 - (sum % 11);
  return String(dv >= 10 ? 0 : dv);
}

/** 44 dígitos com DV coerente. A chave só de zeros fecha o DV, mas é o que o
 * leitor devolve quando lê lixo. */
export function isValidAccessKey(raw: string | null | undefined): boolean {
  const k = accessKeyDigits(raw);
  if (k.length !== 44 || /^0+$/.test(k)) {
    return false;
  }
  return accessKeyCheckDigit(k.slice(0, 43)) === k[43];
}

export interface AccessKey {
  key: string;
  /** Código IBGE da UF do emitente. */
  uf: string;
  yymm: string;
  year: number;
  month: number;
  issuerCnpj: string;
  /** '55' = NF-e, '65' = NFC-e. */
  model: string;
  series: number;
  number: number;
  /** '1' = emissão normal. */
  emissionType: string;
  randomCode: string;
  checkDigit: string;
}

/** Campos posicionais; `null` para chave inválida (nunca adivinha). */
export function parseAccessKey(
  raw: string | null | undefined,
): AccessKey | null {
  if (!isValidAccessKey(raw)) {
    return null;
  }
  const k = accessKeyDigits(raw);
  const yymm = k.slice(2, 6);
  return {
    key: k,
    uf: k.slice(0, 2),
    yymm,
    year: 2000 + Number(yymm.slice(0, 2)),
    month: Number(yymm.slice(2)),
    issuerCnpj: k.slice(6, 20),
    model: k.slice(20, 22),
    series: Number(k.slice(22, 25)),
    number: Number(k.slice(25, 34)),
    emissionType: k.slice(34, 35),
    randomCode: k.slice(35, 43),
    checkDigit: k[43],
  };
}

/** Grupos de 4 dígitos, como impresso no DANFE. */
export function formatAccessKey(raw: string | null | undefined): string {
  const k = accessKeyDigits(raw);
  return k.length === 44 ? (k.match(/.{4}/g) ?? []).join(' ') : k;
}
