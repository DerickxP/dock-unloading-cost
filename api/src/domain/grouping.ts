/**
 * Agrupamento das notas por loja destinatária para o fechamento do período.
 *
 * O centro de distribuição recebe notas endereçadas a cada loja da rede; o
 * custo de descarga é rateado por loja. A chave é o CNPJ do destinatário (o
 * nome varia de fornecedor para fornecedor); o rótulo é o apelido cadastrado
 * para a loja ou, na falta dele, a razão social como veio na nota.
 */
import { normalizeCnpj } from './cnpj';
import type { Invoice } from './invoice';
import { round2, round3 } from './money';
import { UnloadingMethod, computeUnloading, invoiceWeight } from './unloading';

export const UNKNOWN_RECIPIENT_LABEL = '(destinatário não informado)';

export interface StoreGroup {
  cnpj: string;
  /** Apelido cadastrado ou razão social da nota. */
  label: string;
  legalName: string;
  /** Se a loja tem apelido cadastrado. */
  registered: boolean;
  invoices: number;
  volumes: number;
  /** kg, três casas. */
  weight: number;
  /** Soma do valor das notas, duas casas. */
  totalValue: number;
  /** Custo de descarga da loja, duas casas. */
  unloading: number;
  mismatchedInvoices: number;
  uncatalogedItems: string[];
}

export interface GroupedTotals {
  invoices: number;
  volumes: number;
  weight: number;
  totalValue: number;
  /** Soma dos subtotais por loja (não o recálculo sobre o total). */
  total: number;
}

export interface GroupedByStore {
  method: UnloadingMethod;
  unitPrice: number;
  stores: StoreGroup[];
  totals: GroupedTotals;
}

const collator = new Intl.Collator('pt-BR', {
  sensitivity: 'base',
  numeric: true,
});

export function groupByStore(
  invoices: Invoice[],
  method: UnloadingMethod,
  unitPrice: number,
  nicknames: ReadonlyMap<string, string>,
): GroupedByStore {
  const buckets = new Map<string, Invoice[]>();
  for (const invoice of invoices) {
    const key = normalizeCnpj(invoice.recipientCnpj);
    const list = buckets.get(key);
    if (list) {
      list.push(invoice);
    } else {
      buckets.set(key, [invoice]);
    }
  }

  const stores: StoreGroup[] = [];
  for (const [cnpj, group] of buckets) {
    const legalName =
      group
        .map((i) => i.recipientName.trim())
        .find(Boolean)
        ?.toUpperCase() ?? '';
    const nickname = nicknames.get(cnpj);
    const label = nickname ?? (legalName || UNKNOWN_RECIPIENT_LABEL);
    const summary = computeUnloading(group, method, unitPrice);
    stores.push({
      cnpj,
      label,
      legalName,
      registered: nickname !== undefined,
      invoices: group.length,
      volumes: summary.totalVolumes,
      weight: summary.totalWeight,
      totalValue: round2(group.reduce((sum, i) => sum + i.totalValue, 0)),
      unloading: summary.total,
      mismatchedInvoices: group.filter((i) => i.volumeMismatch).length,
      uncatalogedItems: [
        ...new Set(group.flatMap((i) => i.uncatalogedItems ?? [])),
      ],
    });
  }
  stores.sort((a, b) => collator.compare(a.label, b.label));

  return {
    method,
    unitPrice,
    stores,
    totals: {
      invoices: invoices.length,
      volumes: stores.reduce((sum, s) => sum + s.volumes, 0),
      weight: round3(invoices.reduce((sum, i) => sum + invoiceWeight(i), 0)),
      totalValue: round2(stores.reduce((sum, s) => sum + s.totalValue, 0)),
      total: round2(stores.reduce((sum, s) => sum + s.unloading, 0)),
    },
  };
}
