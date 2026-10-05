/**
 * Unidades comerciais (uCom) que aparecem nos itens da NF-e.
 *
 * A regra de volumes depende de saber em que "família" a unidade cai: a que já
 * é uma embalagem física (conta direto), a medida contínua (não vira volume) ou
 * a unidade avulsa (UN), que precisa ser convertida pela embalagem de compra.
 */

/** Unidades que já representam uma embalagem física descarregada. */
export const PACKAGING_UNITS: ReadonlySet<string> = new Set([
  'CX',
  'CAIXA',
  'FD',
  'FARDO',
  'PCT',
  'PACOTE',
  'DZ',
  'DUZIA',
  'BDL',
  'BUNDLE',
  'BAG',
  'SC',
  'SACO',
  'TP',
  'TAMBOR',
  'PC',
  'PÇ',
  'PEC',
  'KIT',
  'DISPLAY',
  'MASTER',
  'BALDE',
  'LATA',
  'GALAO',
  'GALON',
]);

/** Medidas contínuas: não existem como volume discreto na doca. */
export const CONTINUOUS_UNITS: ReadonlySet<string> = new Set([
  'KG',
  'G',
  'L',
  'LT',
  'ML',
  'M',
  'MT',
  'M2',
  'M3',
]);

/**
 * Unidades de massa. Quando a transportadora não informa o peso bruto, o peso
 * da nota sai da soma desses itens (caso típico: hortifrúti vendido em KG).
 */
export const MASS_UNITS: ReadonlySet<string> = new Set(['KG', 'G']);

/**
 * Unidade "base": maiúscula, sem espaços e sem o sufixo numérico que alguns
 * emissores anexam ("UN1" → "UN", "CX12" → "CX"). Sem isso "KG1" deixaria de
 * ser reconhecido como medida contínua e contaria como volume.
 *
 * Exceção: M2 e M3 são unidades legítimas, mas como M também é medida contínua
 * o resultado da classificação é o mesmo.
 */
export function baseUnit(unit: string | null | undefined): string {
  const u = (unit ?? '').toUpperCase().trim();
  return u.replace(/\d+$/, '') || u;
}
