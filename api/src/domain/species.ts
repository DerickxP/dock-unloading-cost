/**
 * Espécie dos volumes de uma nota, para o relatório de descarga.
 *
 * O campo "esp" do transporte costuma vir genérico ("VOLUMES", "UN"); a
 * embalagem mais frequente entre os itens descreve melhor o que foi
 * descarregado. Quando há mistura, o sufixo "+" avisa que não é só aquilo.
 */
export interface SpeciesItem {
  packagingUsed?: string | null;
  unit?: string | null;
}

export const DEFAULT_SPECIES = 'UN';

export function invoiceSpecies(
  items: SpeciesItem[] | null | undefined,
  carrierSpecies: string | null | undefined,
): string {
  const counts = new Map<string, number>();
  for (const item of items ?? []) {
    const label = speciesLabel(item.packagingUsed ?? item.unit);
    if (label) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    return speciesLabel(carrierSpecies) || DEFAULT_SPECIES;
  }

  const [winner] = [...counts.entries()].sort(
    ([labelA, countA], [labelB, countB]) =>
      countB - countA || labelA.localeCompare(labelB),
  )[0];
  return counts.size > 1 ? `${winner}+` : winner;
}

/** Maiúsculas, sem espaços e sem o marcador "*" de item sem cadastro. */
function speciesLabel(raw: string | null | undefined): string {
  return (raw ?? '').toUpperCase().replace(/\*/g, '').trim();
}
