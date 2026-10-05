/**
 * Planilha do relatório de descarga (exceljs), duas abas:
 *
 * 1. "Descarga por Loja": uma linha por loja e a linha TOTAL.
 * 2. "Notas Selecionadas": uma linha por nota, com o peso que a descarga
 *    cobrou e uma observação (divergência, item sem cadastro, nota pendente).
 *
 * Dinheiro e peso são números com formato, não texto: a coluna soma no Excel
 * e o operador lê no padrão brasileiro. Emissão é data de verdade, para o
 * filtro e a ordenação funcionarem.
 *
 * Data/hora: o servidor roda em UTC; título e nome do arquivo usam deslocamento
 * fixo de -03:00, sem depender do TZ do processo.
 */
import { Workbook, Worksheet } from 'exceljs';

import { dateFromIso } from '../domain/dates';
import { formatBrl, formatNumber } from '../domain/format';
import type { Invoice } from '../domain/invoice';
import { invoiceSpecies } from '../domain/species';
import { invoiceWeight } from '../domain/unloading';
import { SOURCE_MANUAL, STATUS_PENDING } from '../invoices/invoice.types';
import type { UnloadingResult } from './unloading.types';

const OFFSET_MINUTES = -180;

const COLOR = {
  title: 'FF1A3A5C',
  header: 'FF2C3E6B',
  total: 'FF1A3A5C',
  zebra: 'FFF0F4FF',
  white: 'FFFFFFFF',
  border: 'FFDDDDDD',
};

const FMT_BRL = 'R$ #,##0.00';
const FMT_WEIGHT = '#,##0.000';
const FMT_INT = '#,##0';
const FMT_TEXT = '@';
const FMT_DATE = 'dd/mm/yyyy';

const STORES_HEADER = [
  'Loja',
  'CNPJ',
  'Notas',
  'Volumes',
  'Peso (kg)',
  'Descarga (R$)',
  'Valor NFs (R$)',
  'Notas divergentes',
];
const STORES_WIDTHS = [40, 20, 9, 11, 14, 17, 18, 18];

const INVOICES_HEADER = [
  'Nº NF-e',
  'Fornecedor',
  'CNPJ Emitente',
  'Loja',
  'CNPJ Dest.',
  'Emissão',
  'Volumes',
  'Espécie',
  'Peso Bruto (kg)',
  'Valor NF (R$)',
  'Peso p/ descarga (kg)',
  'Obs.',
];
const INVOICES_WIDTHS = [12, 34, 20, 30, 20, 12, 10, 10, 16, 16, 20, 40];

interface LocalParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function localParts(d: Date, offsetMinutes = OFFSET_MINUTES): LocalParts {
  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return {
    year: String(shifted.getUTCFullYear()),
    month: p2(shifted.getUTCMonth() + 1),
    day: p2(shifted.getUTCDate()),
    hour: p2(shifted.getUTCHours()),
    minute: p2(shifted.getUTCMinutes()),
    second: p2(shifted.getUTCSeconds()),
  };
}

/** descarga_AAAAMMDD_HHMMSS.xlsx (com segundos: duas exportações no mesmo minuto não colidem). */
export function reportFileName(now: Date): string {
  const p = localParts(now);
  return `descarga_${p.year}${p.month}${p.day}_${p.hour}${p.minute}${p.second}.xlsx`;
}

export function invoiceRemarks(invoice: Invoice): string {
  const parts: string[] = [];
  if (invoice.volumeMismatch) {
    parts.push('volumes divergentes');
  }
  if ((invoice.uncatalogedItems ?? []).length) {
    parts.push('itens sem cadastro');
  }
  if (invoice.source === SOURCE_MANUAL && invoice.status === STATUS_PENDING) {
    parts.push('nota manual pendente');
  }
  return parts.join(' · ');
}

export async function buildUnloadingWorkbook(
  result: UnloadingResult,
  invoices: Invoice[],
  labels: ReadonlyMap<string, string>,
  now: Date,
): Promise<Buffer> {
  const wb = new Workbook();
  wb.creator = 'dock-unloading-cost';
  wb.created = now;

  buildStoresSheet(wb, result, now);
  buildInvoicesSheet(wb, invoices, labels);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function styleHeader(ws: Worksheet, rowNumber: number, columns: number): void {
  const row = ws.getRow(rowNumber);
  for (let c = 1; c <= columns; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: COLOR.white } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR.header },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = { bottom: { style: 'thin', color: { argb: COLOR.border } } };
  }
  row.height = 22;
}

function zebra(
  ws: Worksheet,
  rowNumber: number,
  columns: number,
  index: number,
): void {
  if (index % 2 === 1) {
    for (let c = 1; c <= columns; c++) {
      ws.getRow(rowNumber).getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLOR.zebra },
      };
    }
  }
}

function buildStoresSheet(
  wb: Workbook,
  result: UnloadingResult,
  now: Date,
): void {
  const ws = wb.addWorksheet('Descarga por Loja');
  STORES_WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const p = localParts(now);
  const unit = result.method === 'weight' ? 'kg' : 'volume';
  ws.mergeCells('A1:H1');
  const title = ws.getCell('A1');
  title.value =
    `Custo de descarga por ${result.method === 'weight' ? 'peso' : 'volume'} ` +
    `(${formatBrl(result.unitPrice)} por ${unit}) · gerado em ${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
  title.font = { bold: true, size: 13, color: { argb: COLOR.white } };
  title.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLOR.title },
  };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 26;

  ws.getRow(3).values = STORES_HEADER;
  styleHeader(ws, 3, STORES_HEADER.length);

  result.stores.forEach((store, i) => {
    const rowNumber = 4 + i;
    const row = ws.getRow(rowNumber);
    row.values = [
      store.label,
      store.cnpj,
      store.invoices,
      store.volumes,
      store.weight,
      store.unloading,
      store.totalValue,
      store.mismatchedInvoices,
    ];
    row.getCell(2).numFmt = FMT_TEXT;
    row.getCell(3).numFmt = FMT_INT;
    row.getCell(4).numFmt = FMT_INT;
    row.getCell(5).numFmt = FMT_WEIGHT;
    row.getCell(6).numFmt = FMT_BRL;
    row.getCell(7).numFmt = FMT_BRL;
    row.getCell(8).numFmt = FMT_INT;
    zebra(ws, rowNumber, STORES_HEADER.length, i);
  });

  const totalRow = ws.getRow(4 + result.stores.length);
  totalRow.values = [
    'TOTAL',
    '',
    result.totals.invoices,
    result.totals.volumes,
    result.totals.weight,
    result.totals.total,
    result.totals.totalValue,
    result.stores.reduce((sum, s) => sum + s.mismatchedInvoices, 0),
  ];
  totalRow.getCell(3).numFmt = FMT_INT;
  totalRow.getCell(4).numFmt = FMT_INT;
  totalRow.getCell(5).numFmt = FMT_WEIGHT;
  totalRow.getCell(6).numFmt = FMT_BRL;
  totalRow.getCell(7).numFmt = FMT_BRL;
  totalRow.getCell(8).numFmt = FMT_INT;
  for (let c = 1; c <= STORES_HEADER.length; c++) {
    const cell = totalRow.getCell(c);
    cell.font = { bold: true, color: { argb: COLOR.white } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR.total },
    };
  }

  const footer = ws.getRow(6 + result.stores.length);
  footer.getCell(1).value =
    `Gerado por ${result.parameters.generatedBy || '(não informado)'}`;
  footer.getCell(1).font = { italic: true, size: 9 };
  if (result.warnings.length) {
    result.warnings.forEach((w, i) => {
      const cell = ws.getRow(7 + result.stores.length + i).getCell(1);
      cell.value = `⚠ ${w.message}`;
      cell.font = { size: 9 };
    });
  }

  ws.views = [{ state: 'frozen', ySplit: 3 }];
  ws.autoFilter = { from: 'A3', to: `H${3 + result.stores.length}` };
}

function buildInvoicesSheet(
  wb: Workbook,
  invoices: Invoice[],
  labels: ReadonlyMap<string, string>,
): void {
  const ws = wb.addWorksheet('Notas Selecionadas');
  INVOICES_WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  ws.getRow(1).values = INVOICES_HEADER;
  styleHeader(ws, 1, INVOICES_HEADER.length);

  invoices.forEach((inv, i) => {
    const rowNumber = 2 + i;
    const row = ws.getRow(rowNumber);
    const issueDate = dateFromIso(inv.issueDate);
    row.values = [
      inv.number,
      inv.issuerName,
      inv.issuerCnpj,
      labels.get(inv.recipientCnpj) ?? inv.recipientName,
      inv.recipientCnpj,
      issueDate ?? '',
      inv.volumes ?? 0,
      invoiceSpecies(inv.items, inv.species),
      inv.grossWeight,
      inv.totalValue,
      invoiceWeight(inv),
      invoiceRemarks(inv),
    ];
    row.getCell(1).numFmt = FMT_TEXT;
    row.getCell(3).numFmt = FMT_TEXT;
    row.getCell(5).numFmt = FMT_TEXT;
    row.getCell(6).numFmt = FMT_DATE;
    row.getCell(7).numFmt = FMT_INT;
    row.getCell(9).numFmt = FMT_WEIGHT;
    row.getCell(10).numFmt = FMT_BRL;
    row.getCell(11).numFmt = FMT_WEIGHT;
    zebra(ws, rowNumber, INVOICES_HEADER.length, i);
  });

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: `L${1 + invoices.length}` };
}

/** Texto curto de conferência, usado no log da demonstração. */
export function describeTotals(result: UnloadingResult): string {
  return (
    `${result.totals.invoices} nota(s) · ${formatNumber(result.totals.volumes, 0)} volumes · ` +
    `${formatNumber(result.totals.weight, 3)} kg · descarga ${formatBrl(result.totals.total)}`
  );
}
