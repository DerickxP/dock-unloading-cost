/**
 * Gerador de DANFE simplificado em PDF (pdfkit), para testes e demonstração.
 * O layout é o que domain/danfe-text.ts lê: rótulos por linha e itens em uma
 * linha cada. Notas com muitos itens continuam em "FOLHA n de N".
 */
import PDFDocument from 'pdfkit';

import { formatAccessKey } from '../domain/access-key';
import { formatCnpj } from '../domain/cnpj';
import { formatInvoiceNumber } from '../domain/danfe-text';
import { formatDateBr } from '../domain/dates';
import { formatNumber } from '../domain/format';

export interface DanfeSpecItem {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitValue: number;
  total: number;
}

export interface DanfeSpec {
  accessKey: string;
  number: number;
  series: number;
  issuerName: string;
  issuerCnpj: string;
  recipientName: string;
  recipientCnpj: string;
  /** AAAA-MM-DD */
  issueDate: string;
  /** AAAA-MM-DD; impressa também, como no DANFE real. */
  exitDate?: string;
  carrierName?: string;
  carrierCnpj?: string;
  carrierVolumes: number;
  species: string;
  grossWeight: number;
  netWeight: number;
  productsValue: number;
  totalValue: number;
  items: DanfeSpecItem[];
}

export interface DanfePdfOptions {
  /** Itens na primeira folha; as continuações levam o dobro. */
  itemsPerPage?: number;
}

const ITEMS_HEADER = 'CÓDIGO DESCRIÇÃO UN QTD V.UNIT V.TOTAL';

function itemLine(it: DanfeSpecItem): string {
  return `${it.code} ${it.description} ${it.unit} ${formatNumber(it.quantity, 4)} ${formatNumber(it.unitValue, 4)} ${formatNumber(it.total, 2)}`;
}

/** Texto de cada folha de um DANFE, na mesma ordem em que vai para o PDF. */
export function danfeSheets(
  spec: DanfeSpec,
  options: DanfePdfOptions = {},
): string[][] {
  const firstPage = Math.max(1, options.itemsPerPage ?? 12);
  const nextPages = firstPage * 2;
  const rest = Math.max(0, spec.items.length - firstPage);
  const total = 1 + Math.ceil(rest / nextPages);
  const header = (sheet: number) => [
    sheet === 1
      ? 'DANFE - DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA'
      : 'DANFE - CONTINUAÇÃO',
    `EMITENTE: ${spec.issuerName}`,
    `CNPJ: ${formatCnpj(spec.issuerCnpj)}`,
    `Nº ${formatInvoiceNumber(spec.number)} SÉRIE ${spec.series} FOLHA ${sheet} de ${total}`,
    'CHAVE DE ACESSO',
    formatAccessKey(spec.accessKey),
  ];

  const sheets: string[][] = [];
  const first = [
    ...header(1),
    'DESTINATÁRIO / REMETENTE',
    `NOME/RAZÃO SOCIAL: ${spec.recipientName}`,
    `CNPJ/CPF: ${formatCnpj(spec.recipientCnpj)}`,
    `DATA DA EMISSÃO: ${formatDateBr(spec.issueDate)}`,
    ...(spec.exitDate
      ? [`DATA DA SAÍDA/ENTRADA: ${formatDateBr(spec.exitDate)}`]
      : []),
    'TRANSPORTADOR / VOLUMES TRANSPORTADOS',
    ...(spec.carrierName
      ? [
          `TRANSPORTADORA: ${spec.carrierName}${spec.carrierCnpj ? ` CNPJ: ${formatCnpj(spec.carrierCnpj)}` : ''}`,
        ]
      : []),
    `QUANTIDADE: ${spec.carrierVolumes} ESPÉCIE: ${spec.species} PESO BRUTO: ${formatNumber(spec.grossWeight, 3)} PESO LÍQUIDO: ${formatNumber(spec.netWeight, 3)}`,
    'CÁLCULO DO IMPOSTO',
    `VALOR TOTAL DOS PRODUTOS: ${formatNumber(spec.productsValue, 2)}`,
    `VALOR TOTAL DA NOTA: ${formatNumber(spec.totalValue, 2)}`,
    'DADOS DOS PRODUTOS / SERVIÇOS',
    ITEMS_HEADER,
    ...spec.items.slice(0, firstPage).map(itemLine),
  ];
  sheets.push(first);

  let offset = firstPage;
  for (let sheet = 2; sheet <= total; sheet++) {
    sheets.push([
      ...header(sheet),
      'DADOS DOS PRODUTOS / SERVIÇOS (CONTINUAÇÃO)',
      ITEMS_HEADER,
      ...spec.items.slice(offset, offset + nextPages).map(itemLine),
    ]);
    offset += nextPages;
  }
  return sheets;
}

/** Um arquivo PDF com um ou mais DANFEs (uma carga), uma folha por página. */
export function buildDanfePdf(
  specs: DanfeSpec[],
  options: DanfePdfOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 36,
      info: { Title: 'DANFE (sintético)' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let firstPage = true;
    for (const spec of specs) {
      for (const sheet of danfeSheets(spec, options)) {
        if (!firstPage) {
          doc.addPage();
        }
        firstPage = false;
        doc.font('Helvetica-Bold').fontSize(11).text(sheet[0]);
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9);
        for (const line of sheet.slice(1)) {
          doc.text(line);
        }
      }
    }
    doc.end();
  });
}

/** PDF só com desenho, sem camada de texto (o caso do DANFE digitalizado). */
export function buildImageOnlyPdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.rect(50, 50, 400, 600).stroke();
    doc.end();
  });
}
