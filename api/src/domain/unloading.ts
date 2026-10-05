/**
 * Recálculo de uma nota e custo de descarga de um conjunto de notas.
 *
 * O custo é cobrado ou por volume ou por peso, nunca os dois: quem descarrega
 * uma carga de hortifrúti em KG cobra pelo peso; quem descarrega mercearia em
 * caixas cobra pelo volume. A nota guarda os dois totais e o método é
 * escolhido na hora de fechar o período.
 */
import type { Invoice, InvoiceItem } from './invoice';
import { round2, round3 } from './money';
import { MASS_UNITS, baseUnit } from './units';
import type { ItemVolumes, VolumeItem } from './volumes';

/** O que o recálculo precisa saber fazer; pode ser síncrono (memória) ou
 * assíncrono (serviço com banco). */
export interface VolumeConverter {
  itemVolumes(item: VolumeItem): ItemVolumes | Promise<ItemVolumes>;
}

export type RecalculatedItem = InvoiceItem & ItemVolumes;

export type RecalculatedInvoice = Omit<
  Invoice,
  | 'items'
  | 'volumes'
  | 'itemVolumes'
  | 'volumeMismatch'
  | 'itemsWeight'
  | 'unloadWeight'
  | 'uncatalogedItems'
> & {
  items: RecalculatedItem[];
  volumes: number;
  itemVolumes: number;
  volumeMismatch: boolean;
  itemsWeight: number;
  unloadWeight: number;
  uncatalogedItems: string[];
};

/** Peso em kg de um item de massa; zero para os demais. */
function itemMassKg(item: InvoiceItem): number {
  const base = baseUnit(item.unit);
  if (!MASS_UNITS.has(base) || !Number.isFinite(item.quantity)) {
    return 0;
  }
  return base === 'G' ? item.quantity / 1000 : item.quantity;
}

/**
 * Devolve uma cópia da nota com volumes, pesos e status por item. A nota
 * original não é alterada.
 *
 * - Volumes: a contagem da transportadora prevalece quando informada, porque
 *   foi ela quem conferiu a carga; a soma dos itens é guardada para comparar.
 *   Divergência só é sinalizada quando a nota não tem medida contínua, porque
 *   aí a soma dos itens não é comparável.
 * - Peso: o bruto do transporte quando informado; senão, a soma dos itens em
 *   massa (hortifrúti costuma vir sem pesoB).
 */
export async function recalculateInvoice(
  invoice: Invoice,
  converter: VolumeConverter,
): Promise<RecalculatedInvoice> {
  const items: RecalculatedItem[] = [];
  for (const item of invoice.items) {
    const result = await converter.itemVolumes({
      ean: item.ean,
      code: item.code,
      name: item.description,
      unit: item.unit,
      quantity: item.quantity,
    });
    items.push({ ...item, ...result });
  }

  const itemVolumes = items.reduce((sum, i) => sum + i.volumes, 0);
  const hasContinuous = items.some((i) => i.status === 'continuous');
  const carrierVolumes =
    invoice.carrierVolumes > 0 ? invoice.carrierVolumes : 0;
  const volumes = carrierVolumes > 0 ? carrierVolumes : itemVolumes;
  const volumeMismatch =
    carrierVolumes > 0 &&
    itemVolumes > 0 &&
    carrierVolumes !== itemVolumes &&
    !hasContinuous;

  const itemsWeight = round3(
    invoice.items.reduce((sum, i) => sum + itemMassKg(i), 0),
  );
  const unloadWeight = invoiceWeight({
    grossWeight: invoice.grossWeight,
    itemsWeight,
  });

  return {
    ...invoice,
    items,
    volumes,
    itemVolumes,
    volumeMismatch,
    itemsWeight,
    unloadWeight,
    uncatalogedItems: items
      .filter((i) => i.status === 'uncataloged')
      .map((i) => i.description),
  };
}

export interface WeighableInvoice {
  grossWeight: number;
  itemsWeight?: number;
}

/** Peso bruto quando informado; senão o peso dos itens; senão zero. */
export function invoiceWeight(invoice: WeighableInvoice): number {
  if (invoice.grossWeight > 0) {
    return invoice.grossWeight;
  }
  return invoice.itemsWeight && invoice.itemsWeight > 0
    ? invoice.itemsWeight
    : 0;
}

export type UnloadingMethod = 'volume' | 'weight';

export interface UnloadableInvoice extends WeighableInvoice {
  volumes?: number;
}

export interface UnloadingSummary {
  method: UnloadingMethod;
  unitPrice: number;
  totalVolumes: number;
  /** kg, três casas. */
  totalWeight: number;
  /** R$, duas casas. */
  total: number;
}

/** Custo de descarga de um conjunto de notas por um único método. */
export function computeUnloading(
  invoices: UnloadableInvoice[],
  method: UnloadingMethod,
  unitPrice: number,
): UnloadingSummary {
  const price = Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0;
  const totalVolumes = invoices.reduce((sum, i) => sum + (i.volumes ?? 0), 0);
  const totalWeight = round3(
    invoices.reduce((sum, i) => sum + invoiceWeight(i), 0),
  );
  const base = method === 'weight' ? totalWeight : totalVolumes;
  return {
    method,
    unitPrice: price,
    totalVolumes,
    totalWeight,
    total: round2(base * price),
  };
}
