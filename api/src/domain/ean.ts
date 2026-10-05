/**
 * Variantes de EAN/GTIN para casar o item da nota com o cadastro.
 */

/** Dígito verificador GS1 (mód 10, pesos 3,1,3,1… da direita para a esquerda). */
export function gs1CheckDigit(data: string): string {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const digit = Number(data[data.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return String((10 - (sum % 10)) % 10);
}

/**
 * Todas as formas pelas quais o mesmo produto pode estar cadastrado:
 *
 * 1. Zeros à esquerda: GTIN-8/12/13/14 são o mesmo número com padding. A nota
 *    traz "07890000000017" e o cadastro tem "7890000000017", ou o contrário.
 * 2. GTIN-14 de caixa (indicador 1 a 8): é o GTIN-13 da unidade com um dígito
 *    na frente e o verificador recalculado. Derivar a unidade permite casar a
 *    caixa com o produto cadastrado só pela unidade. O indicador 9 significa
 *    quantidade variável e não deriva nada.
 */
export function eanVariants(ean: string | null | undefined): string[] {
  const raw = (ean ?? '').trim();
  if (!raw) {
    return [];
  }
  if (!/^\d+$/.test(raw)) {
    return [raw]; // "SEM GTIN" e afins: só o literal
  }

  const roots = [raw];
  if (raw.length === 14 && raw[0] >= '1' && raw[0] <= '8') {
    const unitData = raw.slice(1, 13);
    roots.push(unitData + gs1CheckDigit(unitData));
  }

  const variants = new Set<string>();
  for (const root of roots) {
    const stripped = root.replace(/^0+/, '') || '0';
    variants.add(root);
    variants.add(stripped);
    for (const len of [8, 12, 13, 14]) {
      if (stripped.length <= len) {
        variants.add(stripped.padStart(len, '0'));
      }
    }
  }
  return [...variants];
}
