/**
 * Leitura da planilha de produtos (xlsx ou csv com ';'): é assim que o
 * cadastro se mantém vivo com o export do ERP.
 *
 * Regras:
 * - colunas detectadas pelos cabeçalhos, com tolerância aos nomes que cada
 *   ERP usa (EAN/COD_BAR; COD/SEQ; NOME/DESC/PROD; QTD/FAT/CONV/FATOR/QUANT;
 *   EMB/UNID_VENDA/UNIT). A quantidade é testada antes da embalagem, senão
 *   "QTD_EMB_COMPRA" cairia como embalagem e o fator viraria 1;
 * - linha sem nome é pulada; embalagem vazia vira CX; vírgula decimal;
 *   quantidade vazia ou ≤ 0 vira 1; quantidade não numérica é erro da linha;
 * - CSV com ';' e BOM (utf-8-sig) ou Windows-1252, o formato do export.
 */
import { BadRequestException } from '@nestjs/common';
import { Workbook, type CellValue } from 'exceljs';

import { decodeText, parseBrNumber, toArrayBuffer } from '../common/text';

export interface SpreadsheetRow {
  /** Número da linha na planilha (1 = cabeçalho), para o relato. */
  line: number;
  ean: string | null;
  code: string | null;
  name: string;
  packaging: string;
  unitsPerPackage: number;
}

export interface ParsedSpreadsheet {
  rows: SpreadsheetRow[];
  warnings: string[];
  /** Cabeçalho reconhecido para cada papel, para o relato. */
  columns: Partial<Record<Role, string>>;
  skipped: number;
}

type Role = 'ean' | 'code' | 'name' | 'quantity' | 'packaging';
interface Record_ {
  line: number;
  values: Record<string, string>;
}

/** Valor de célula do exceljs como texto (fórmula usa o resultado). */
function cellText(v: CellValue): string {
  if (v === null || v === undefined) {
    return '';
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  if (typeof v === 'object') {
    if ('result' in v) {
      return cellText((v as { result?: CellValue }).result ?? '');
    }
    if ('richText' in v) {
      return (v as { richText: { text: string }[] }).richText
        .map((r) => r.text)
        .join('');
    }
    if ('text' in v) {
      return String((v as { text: unknown }).text);
    }
    return String(v);
  }
  return String(v);
}

/** Divide uma linha de CSV por ';' respeitando aspas ("a;b" e "" escapada). */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ';') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function recordsFromCsv(bytes: Uint8Array): {
  headers: string[];
  records: Record_[];
} {
  const lines = decodeText(bytes).split(/\r?\n/);
  const nonEmpty: { n: number; text: string }[] = [];
  lines.forEach((text, i) => {
    if (text.trim() !== '') {
      nonEmpty.push({ n: i + 1, text });
    }
  });
  if (!nonEmpty.length) {
    return { headers: [], records: [] };
  }
  const headers = splitCsvLine(nonEmpty[0].text).map((h) => h.trim());
  const records = nonEmpty.slice(1).map((l) => {
    const fields = splitCsvLine(l.text);
    const values: Record<string, string> = {};
    headers.forEach((h, i) => {
      values[h] = (fields[i] ?? '').trim();
    });
    return { line: l.n, values };
  });
  return { headers, records };
}

async function recordsFromXlsx(
  bytes: Uint8Array,
): Promise<{ headers: string[]; records: Record_[] }> {
  const wb = new Workbook();
  try {
    await wb.xlsx.load(toArrayBuffer(bytes));
  } catch {
    throw new BadRequestException({
      message:
        'Não foi possível ler o arquivo; envie uma planilha .xlsx ou .csv',
    });
  }
  const ws = wb.worksheets[0];
  if (!ws) {
    throw new BadRequestException({
      message: 'A planilha não tem nenhuma aba',
    });
  }
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  for (let c = 1; c <= headerRow.cellCount; c++) {
    headers.push(cellText(headerRow.getCell(c).value).trim());
  }
  const records: Record_[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) {
      return;
    }
    const values: Record<string, string> = {};
    headers.forEach((h, i) => {
      values[h] = cellText(row.getCell(i + 1).value).trim();
    });
    records.push({ line: n, values });
  });
  return { headers, records };
}

const ROLE_PATTERNS: Array<[Role, RegExp]> = [
  ['ean', /EAN|COD_?BAR|GTIN|BARRA/],
  ['quantity', /QTD|FAT|CONV|QT_?EMB|FATOR|QUANT|UNITS/],
  ['code', /COD|SEQ|SKU/],
  ['name', /NOME|DESC|PROD|NAME/],
  ['packaging', /EMB|UNID|UNIT|PACK/],
];

/** Cabeçalhos → papéis. Cada cabeçalho é usado uma vez; o primeiro padrão que casa vence. */
export function mapColumns(headers: string[]): Partial<Record<Role, string>> {
  const columns: Partial<Record<Role, string>> = {};
  const used = new Set<string>();
  for (const [role, pattern] of ROLE_PATTERNS) {
    for (const header of headers) {
      const upper = header.trim().toUpperCase();
      if (!upper || used.has(header) || !pattern.test(upper)) {
        continue;
      }
      // "UNITS_PER_PACKAGE" casa quantidade, não embalagem; "COD_BAR" é EAN.
      if (role === 'packaging' && /QTD|UNITS|FATOR|QUANT/.test(upper)) {
        continue;
      }
      if (role === 'code' && /BAR|GTIN/.test(upper)) {
        continue;
      }
      columns[role] = header;
      used.add(header);
      break;
    }
  }
  return columns;
}

/** Planilha (xlsx/csv) → linhas prontas para o cadastro, com avisos por linha. */
export async function parseProductSpreadsheet(
  fileName: string,
  bytes: Uint8Array,
): Promise<ParsedSpreadsheet> {
  const isCsv = /\.(csv|txt)$/i.test(fileName);
  const { headers, records } = isCsv
    ? recordsFromCsv(bytes)
    : await recordsFromXlsx(bytes);
  if (!headers.length) {
    throw new BadRequestException({
      message: 'Planilha vazia ou sem linha de cabeçalho',
    });
  }
  const columns = mapColumns(headers);
  if (!columns.name) {
    throw new BadRequestException({
      message: `Não encontrei a coluna de nome/descrição do produto. Cabeçalhos lidos: ${headers.join(', ')}`,
    });
  }

  const rows: SpreadsheetRow[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  for (const r of records) {
    const name = (r.values[columns.name] ?? '').trim();
    if (!name) {
      skipped++;
      continue;
    }
    const quantityText = columns.quantity
      ? (r.values[columns.quantity] ?? '').trim()
      : '';
    let unitsPerPackage = 1;
    if (quantityText) {
      const n = parseBrNumber(quantityText);
      if (!Number.isFinite(n)) {
        warnings.push(
          `Linha ${r.line}: quantidade por embalagem "${quantityText}" não é numérica; linha ignorada`,
        );
        continue;
      }
      unitsPerPackage = n > 0 ? n : 1;
    }
    const ean = columns.ean
      ? (r.values[columns.ean] ?? '').replace(/\D/g, '')
      : '';
    const code = columns.code ? (r.values[columns.code] ?? '').trim() : '';
    const packaging =
      (columns.packaging ? (r.values[columns.packaging] ?? '') : '')
        .toUpperCase()
        .trim() || 'CX';
    rows.push({
      line: r.line,
      ean: ean || null,
      code: code || null,
      name,
      packaging,
      unitsPerPackage,
    });
  }
  return { rows, warnings, columns, skipped };
}
