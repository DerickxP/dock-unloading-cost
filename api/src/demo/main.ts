/**
 * Demonstração ponta a ponta sem banco:
 *
 *   XMLs sintéticos → parser → cascata de volumes (cadastro em memória) →
 *   agrupamento por loja → tabela no terminal + JSON + planilha .xlsx
 *
 * Também grava insumos para testar a API e o front: uma carga em PDF com
 * DANFEs (entrada pendente), os XMLs correspondentes (para reconciliar) e a
 * planilha de produtos no formato do ERP.
 *
 *   node dist/demo/main.js [--out DIR] [--invoices N] [--seed S]
 *                          [--method volume|weight] [--price X]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { formatBrl, formatNumber, volumeLabel } from '../domain/format';
import { groupByStore } from '../domain/grouping';
import type { Invoice } from '../domain/invoice';
import { decodeXml, parseNfe } from '../domain/nfe-parser';
import {
  UnloadingMethod,
  invoiceWeight,
  recalculateInvoice,
} from '../domain/unloading';
import { SOURCE_UPLOAD, STATUS_CONFIRMED } from '../invoices/invoice.types';
import {
  buildUnloadingWorkbook,
  describeTotals,
  reportFileName,
} from '../unloading/excel-report';
import type { UnloadingResult } from '../unloading/unloading.types';
import { unloadingWarnings } from '../unloading/unloading.warnings';
import { Workbook } from 'exceljs';

import { buildDanfePdf } from './danfe-pdf';
import {
  PRODUCTS,
  generateInvoices,
  nicknames,
  productsCsv,
  seededCatalog,
  syntheticInvoices,
  toDanfeSpec,
  toNfeXml,
  xmlFileName,
} from './synthetic';

interface Options {
  out: string;
  invoices: number;
  seed: number;
  method: UnloadingMethod;
  price: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    out: 'demo-output',
    invoices: 12,
    seed: 7,
    method: 'volume',
    price: 2.5,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    switch (flag) {
      case '--out':
        options.out = value;
        break;
      case '--invoices':
        options.invoices = Number(value);
        break;
      case '--seed':
        options.seed = Number(value);
        break;
      case '--method':
        options.method = value === 'weight' ? 'weight' : 'volume';
        break;
      case '--price':
        options.price = Number(value);
        break;
      default:
        throw new Error(`Opção desconhecida: ${flag}`);
    }
  }
  return options;
}

function pad(text: string, width: number, right = false): string {
  const t = text.length > width ? text.slice(0, width - 1) + '…' : text;
  return right ? t.padStart(width) : t.padEnd(width);
}

export async function runDemo(options: Options): Promise<UnloadingResult> {
  const xmlDir = join(options.out, 'xml');
  mkdirSync(xmlDir, { recursive: true });

  // 1. XMLs sintéticos em disco, como chegariam da transportadora.
  const files = syntheticInvoices(options.invoices, options.seed);
  for (const f of files) {
    writeFileSync(join(xmlDir, f.fileName), f.xml, 'latin1');
  }

  // 2. Bytes → parser → cascata de volumes com o cadastro em memória.
  const catalog = seededCatalog();
  const invoices: Invoice[] = [];
  for (const f of files) {
    const parsed = parseNfe(decodeXml(readFileSync(join(xmlDir, f.fileName))));
    if (!parsed) {
      throw new Error(`XML inválido gerado: ${f.fileName}`);
    }
    const recalculated = await recalculateInvoice(parsed, catalog);
    invoices.push({
      ...recalculated,
      source: SOURCE_UPLOAD,
      status: STATUS_CONFIRMED,
    });
  }
  invoices.sort(
    (a, b) =>
      b.issueDate.localeCompare(a.issueDate) ||
      a.accessKey.localeCompare(b.accessKey),
  );

  // 3. Agrupamento por loja e avisos.
  const labels = nicknames();
  const grouped = groupByStore(invoices, options.method, options.price, labels);
  const now = new Date();
  const result: UnloadingResult = {
    ...grouped,
    parameters: {
      method: options.method,
      unitPrice: options.price,
      generatedAt: now.toISOString(),
      generatedBy: 'demo',
    },
    warnings: unloadingWarnings(grouped, invoices),
  };

  // 4. Saídas: terminal, JSON e planilha.
  console.log(`\nNotas (${invoices.length}):`);
  console.log(
    pad('Nº', 6) +
      pad('Fornecedor', 30) +
      pad('Loja', 22) +
      pad('Vol.', 8, true) +
      pad('Peso kg', 11, true) +
      pad('Valor NF', 13, true),
  );
  for (const inv of invoices) {
    console.log(
      pad(inv.number, 6) +
        pad(inv.issuerName, 30) +
        pad(labels.get(inv.recipientCnpj) ?? inv.recipientName, 22) +
        pad(
          volumeLabel({
            volumes: inv.volumes ?? 0,
            itemVolumes: inv.itemVolumes ?? 0,
            grossWeight: inv.grossWeight,
            volumeMismatch: inv.volumeMismatch,
          }),
          8,
          true,
        ) +
        pad(formatNumber(invoiceWeight(inv), 3), 11, true) +
        pad(formatBrl(inv.totalValue), 13, true),
    );
  }

  console.log(
    `\nDescarga por loja (${options.method === 'weight' ? 'peso' : 'volume'}, ${formatBrl(options.price)}):`,
  );
  console.log(
    pad('Loja', 28) +
      pad('Notas', 7, true) +
      pad('Vol.', 7, true) +
      pad('Peso kg', 11, true) +
      pad('Descarga', 13, true),
  );
  for (const s of result.stores) {
    console.log(
      pad(s.label + (s.registered ? '' : ' *'), 28) +
        pad(String(s.invoices), 7, true) +
        pad(String(s.volumes), 7, true) +
        pad(formatNumber(s.weight, 3), 11, true) +
        pad(formatBrl(s.unloading), 13, true),
    );
  }
  console.log(
    pad('TOTAL', 28) +
      pad(String(result.totals.invoices), 7, true) +
      pad(String(result.totals.volumes), 7, true) +
      pad(formatNumber(result.totals.weight, 3), 11, true) +
      pad(formatBrl(result.totals.total), 13, true),
  );
  for (const w of result.warnings) {
    console.log(`⚠ ${w.message}`);
  }

  writeFileSync(
    join(options.out, 'resultado.json'),
    JSON.stringify({ result, invoices }, null, 2),
  );
  const xlsx = await buildUnloadingWorkbook(result, invoices, labels, now);
  const xlsxPath = join(options.out, reportFileName(now));
  writeFileSync(xlsxPath, xlsx);

  // 5. Insumos para a API e o front: carga em PDF (DANFEs de notas que ainda
  //    não têm XML), os XMLs dessas notas e a planilha de produtos do ERP.
  const pending = generateInvoices(3, options.seed + 1000, 2000);
  mkdirSync(join(options.out, 'pdf'), { recursive: true });
  mkdirSync(join(options.out, 'xml-pendentes'), { recursive: true });
  writeFileSync(
    join(options.out, 'pdf', 'carga_pendentes.pdf'),
    await buildDanfePdf(pending.map(toDanfeSpec), { itemsPerPage: 2 }),
  );
  for (const m of pending) {
    writeFileSync(
      join(options.out, 'xml-pendentes', xmlFileName(m)),
      toNfeXml(m),
      'latin1',
    );
  }
  writeFileSync(join(options.out, 'produtos.csv'), productsCsv(), 'utf-8');
  const wb = new Workbook();
  const ws = wb.addWorksheet('Produtos');
  ws.addRow([
    'COD_PRODUTO',
    'COD_BARRA',
    'DESCRICAO',
    'EMB_COMPRA',
    'QTD_EMB_COMPRA',
  ]);
  for (const p of PRODUCTS) {
    ws.addRow([p.code, p.ean, p.name, p.packaging, p.unitsPerPackage]);
  }
  writeFileSync(
    join(options.out, 'produtos.xlsx'),
    Buffer.from(await wb.xlsx.writeBuffer()),
  );

  console.log(`\n${describeTotals(result)}`);
  console.log(
    `Saídas em ${options.out}: xml/ (${files.length} arquivos), resultado.json, ${reportFileName(now)}`,
  );
  console.log(
    `Para a API e o front: pdf/carga_pendentes.pdf (${pending.length} DANFEs), xml-pendentes/ (${pending.length} XMLs), produtos.csv, produtos.xlsx`,
  );
  return result;
}

if (require.main === module) {
  runDemo(parseArgs(process.argv.slice(2))).catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
