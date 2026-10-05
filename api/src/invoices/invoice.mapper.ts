/**
 * Tradução Prisma ⇄ domínio, pura. Sem ela o agrupamento receberia campos
 * ausentes e devolveria zeros em silêncio, o pior erro numa cobrança.
 */
import type { Invoice, InvoiceItem } from '../domain/invoice';
import { isoFromDate } from '../domain/dates';
import { normalizeCnpj } from '../domain/cnpj';
import { round2, round3 } from '../domain/money';
import { RecalculatedInvoice, invoiceWeight } from '../domain/unloading';
import type { ItemVolumeStatus } from '../domain/volumes';
import type { InvoiceItemRow, InvoiceRow } from './invoice.types';

const itemFromRow = (row: InvoiceItemRow): InvoiceItem => ({
  ean: row.ean ?? '',
  code: row.code ?? '',
  description: row.description ?? '',
  unit: row.unit ?? '',
  quantity: row.quantity ?? 0,
  value: row.value ?? 0,
  volumes: row.volumes ?? undefined,
  packagingUsed: row.packagingUsed ?? undefined,
  status: (row.status as ItemVolumeStatus | null) ?? undefined,
});

/** Linha do banco → nota do domínio, com o snapshot do recálculo preenchido. */
export function rowToInvoice(row: InvoiceRow): Invoice {
  const items = (row.items ?? []).map(itemFromRow);
  const grossWeight = row.grossWeight ?? 0;
  const itemsWeight = row.itemsWeight ?? 0;
  return {
    accessKey: row.accessKey,
    number: row.number,
    series: row.series ?? '1',
    issueDate: isoFromDate(row.issueDate),
    issuerCnpj: row.issuerCnpj,
    issuerName: row.issuerName,
    recipientCnpj: row.recipientCnpj,
    recipientName: row.recipientName,
    totalValue: row.totalValue ?? 0,
    productsValue: row.productsValue ?? 0,
    species: row.species ?? 'UN',
    carrierVolumes: row.carrierVolumes ?? 0,
    grossWeight,
    netWeight: row.netWeight ?? 0,
    items,
    volumes: row.volumes ?? 0,
    itemVolumes: row.itemVolumes ?? 0,
    itemsWeight,
    unloadWeight: invoiceWeight({ grossWeight, itemsWeight }),
    volumeMismatch: Boolean(row.volumeMismatch),
    uncatalogedItems: items
      .filter((i) => i.status === 'uncataloged')
      .map((i) => i.description)
      .filter(Boolean),
    source: row.source ?? undefined,
    status: row.status ?? undefined,
    note: row.note ?? null,
  };
}

/** Colunas derivadas que a escrita grava junto com a nota. */
export function toSnapshot(invoice: RecalculatedInvoice): {
  volumes: number;
  itemVolumes: number;
  itemsWeight: number;
  volumeMismatch: boolean;
} {
  return {
    volumes: invoice.volumes,
    itemVolumes: invoice.itemVolumes,
    itemsWeight: round3(invoice.itemsWeight),
    volumeMismatch: invoice.volumeMismatch,
  };
}

/** Colunas da nota (sem chave, origem e status) a partir do recálculo. */
export function toInvoiceColumns(
  invoice: RecalculatedInvoice,
  issueDate: Date,
) {
  return {
    number: invoice.number.slice(0, 9),
    series: (invoice.series || '1').slice(0, 3),
    issueDate,
    issuerCnpj: normalizeCnpj(invoice.issuerCnpj).slice(0, 14),
    issuerName: invoice.issuerName,
    recipientCnpj: normalizeCnpj(invoice.recipientCnpj).slice(0, 14),
    recipientName: invoice.recipientName,
    totalValue: round2(invoice.totalValue),
    productsValue: round2(invoice.productsValue),
    carrierVolumes: invoice.carrierVolumes,
    species: (invoice.species || 'UN').slice(0, 20),
    grossWeight: round3(invoice.grossWeight),
    netWeight: round3(invoice.netWeight),
    ...toSnapshot(invoice),
  };
}

/** Linhas de itens para gravar junto com a nota. */
export function toItemRows(invoice: RecalculatedInvoice) {
  return invoice.items.map((it, i) => ({
    seq: i + 1,
    ean: it.ean.slice(0, 14),
    code: it.code,
    description: it.description,
    unit: it.unit.slice(0, 6),
    quantity: it.quantity,
    value: round2(it.value),
    volumes: it.volumes,
    packagingUsed: it.packagingUsed.slice(0, 10) || null,
    status: it.status,
  }));
}
