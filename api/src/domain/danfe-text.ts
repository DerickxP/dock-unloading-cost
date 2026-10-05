/**
 * Extração de DANFE a partir do texto de um PDF. Lógica pura.
 *
 * Princípio: precisão acima de cobertura. Nada é adivinhado. A âncora é a
 * chave de acesso (44 dígitos, DV conferido) e o que ela deriva (número da
 * nota, CNPJ do emitente) tem que aparecer impresso na página. Qualquer
 * ambiguidade rejeita a página com motivo legível, porque a nota extraída
 * daqui vira cobrança. A nota entra como pendente e o XML a reconcilia
 * depois; o XML sempre pode corrigir o que o PDF trouxe.
 *
 * Itens só entram quando passam na prova aritmética: quantidade × unitário
 * igual ao total do item, e soma dos itens igual ao total dos produtos
 * impresso. Nota de várias folhas ("FOLHA 1 de 2") agrega as continuações
 * antes da prova da soma.
 *
 * O layout lido é o do DANFE simplificado que este projeto gera
 * (demo/danfe-pdf.ts): rótulos por linha e itens em uma linha cada. Um DANFE
 * de outro emissor exige só trocar as expressões regulares desta unidade.
 */
import { isValidAccessKey, parseAccessKey } from './access-key';
import { formatCnpj } from './cnpj';
import { parseBrNumber } from './format';

export interface DanfeItem {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitValue: number;
  total: number;
}

export interface DanfeInvoice {
  accessKey: string;
  number: string;
  series: string;
  issuerCnpj: string;
  issuerName: string;
  recipientCnpj: string;
  recipientName: string;
  /** AAAA-MM-DD: a menor data impressa que casa com a competência da chave. */
  issueDate: string;
  carrierVolumes: number;
  species: string;
  grossWeight: number;
  netWeight: number;
  /** Zero quando não impresso (vira aviso, não rejeição). */
  productsValue: number;
  totalValue: number;
  /** Vazio quando a prova aritmética não fecha; a nota entra sem itens. */
  items: DanfeItem[];
  /** Páginas do arquivo que compõem a nota (1-based). */
  pages: number[];
  warnings: string[];
}

export type DanfePage =
  | { kind: 'invoice'; invoice: DanfeInvoice; itemsSuspicious: boolean }
  | {
      kind: 'continuation';
      accessKey: string;
      items: DanfeItem[];
      itemsSuspicious: boolean;
    }
  | { kind: 'invalid'; reason: string };

export interface InvalidPage {
  page: number;
  reason: string;
}

const NUM = String.raw`\d{1,3}(?:\.\d{3})*,\d+`;
// 44 dígitos, possivelmente em grupos separados por espaço ou ponto, sem
// dígito colado antes ou depois (não fatiar números maiores).
const RE_KEY = /(?<!\d)(?:\d[ .]?){43}\d(?!\d)/g;
const RE_CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;
const RE_DATE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
const RE_SHEET = /\bFOLHA\s+(\d+)\s+de\s+(\d+)\b/i;
const RE_ISSUER_NAME = /^EMITENTE:\s*(.+)$/m;
const RE_RECIPIENT_NAME = /^NOME\/RAZ[AÃ]O SOCIAL:\s*(.+)$/m;
const RE_RECIPIENT_CNPJ = /^CNPJ\/CPF:\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/m;
const RE_TRANSPORT = new RegExp(
  String.raw`QUANTIDADE:\s*(\d+)\s+ESP[EÉ]CIE:\s*(\S+)\s+PESO BRUTO:\s*(${NUM})\s+PESO L[IÍ]QUIDO:\s*(${NUM})`,
  'i',
);
const RE_PRODUCTS_TOTAL = new RegExp(
  String.raw`VALOR TOTAL DOS PRODUTOS:\s*(${NUM})`,
  'i',
);
const RE_INVOICE_TOTAL = new RegExp(
  String.raw`VALOR TOTAL DA NOTA:\s*(${NUM})`,
  'i',
);
const RE_ITEMS_HEADER = /^C[OÓ]DIGO\s+DESCRI[CÇ][AÃ]O\s+UN\s+QTD/i;
const RE_BLOCK_TITLE =
  /^(INFORMA[CÇ][OÕ]ES|DADOS ADICIONAIS|RESERVADO AO FISCO)/i;
// código  descrição  un  qtd(4 casas)  unitário(4 casas)  total(2 casas)
const RE_ITEM = new RegExp(
  String.raw`^(\S+) (.+?) ([A-ZÀ-Ü0-9]{1,6}) (\d{1,3}(?:\.\d{3})*,\d{4}) (\d{1,3}(?:\.\d{3})*,\d{4}) (\d{1,3}(?:\.\d{3})*,\d{2})$`,
);

/** Meio centavo de folga: o DANFE imprime arredondado. */
const TOLERANCE = 0.011;

export const itemProves = (item: DanfeItem): boolean =>
  Math.abs(item.quantity * item.unitValue - item.total) <= TOLERANCE;

/** Número da nota como o DANFE imprime: 000.001.000. */
export function formatInvoiceNumber(number: number): string {
  return String(number)
    .padStart(9, '0')
    .replace(/(\d{3})(?=\d)/g, '$1.');
}

function extractItems(lines: string[]): {
  items: DanfeItem[];
  suspicious: boolean;
} {
  const header = lines.findIndex((l) => RE_ITEMS_HEADER.test(l));
  if (header < 0) {
    return { items: [], suspicious: false };
  }
  const items: DanfeItem[] = [];
  let orphans = 0;
  for (const line of lines.slice(header + 1)) {
    const text = line.trim();
    if (!text) {
      continue;
    }
    if (RE_BLOCK_TITLE.test(text)) {
      break;
    }
    const m = RE_ITEM.exec(text);
    if (!m) {
      orphans++;
      continue;
    }
    items.push({
      code: m[1],
      description: m[2].trim(),
      unit: m[3],
      quantity: parseBrNumber(m[4]),
      unitValue: parseBrNumber(m[5]),
      total: parseBrNumber(m[6]),
    });
  }
  return { items, suspicious: orphans > 0 || !items.every(itemProves) };
}

/** Uma página de texto → DANFE, continuação ou página inválida (com motivo). */
export function extractDanfePage(
  text: string,
  knownCnpjs?: ReadonlySet<string>,
): DanfePage {
  const invalid = (reason: string): DanfePage => ({ kind: 'invalid', reason });
  const lines = text.split(/\r?\n/);

  // 1. A chave de acesso é a âncora: exatamente uma por página, DV correto.
  const keys = [
    ...new Set(
      (text.match(RE_KEY) ?? [])
        .map((k) => k.replace(/\D/g, ''))
        .filter((k) => k.length === 44),
    ),
  ];
  if (keys.length === 0) {
    return invalid('nenhuma chave de acesso de 44 dígitos na página');
  }
  if (keys.length > 1) {
    return invalid('mais de uma chave de acesso na mesma página');
  }
  const accessKey = keys[0];
  if (!isValidAccessKey(accessKey)) {
    return invalid('chave de acesso com dígito verificador inválido');
  }
  const fromKey = parseAccessKey(accessKey)!;

  // 2. "FOLHA n de N" com n > 1 é continuação: só os itens desta folha contam.
  const sheet = RE_SHEET.exec(text);
  if (sheet && Number(sheet[1]) > 1) {
    const { items, suspicious } = extractItems(lines);
    return {
      kind: 'continuation',
      accessKey,
      items,
      itemsSuspicious: suspicious,
    };
  }

  // 3. Validação cruzada: o que a chave deriva precisa estar impresso.
  const printedNumber = formatInvoiceNumber(fromKey.number);
  if (
    !text.includes(printedNumber) &&
    !new RegExp(String.raw`\b${fromKey.number}\b`).test(text)
  ) {
    return invalid(
      `o número da nota derivado da chave (${fromKey.number}) não aparece na página`,
    );
  }
  if (
    !text.includes(formatCnpj(fromKey.issuerCnpj)) &&
    !text.includes(fromKey.issuerCnpj)
  ) {
    return invalid(
      'o CNPJ do emitente derivado da chave não aparece na página',
    );
  }

  // 4. Data de emissão: a menor data que casa com a competência da chave.
  const dates: string[] = [];
  for (const m of text.matchAll(RE_DATE)) {
    const [, day, month, year] = m;
    if (Number(year) === fromKey.year && Number(month) === fromKey.month) {
      dates.push(`${year}-${month}-${day}`);
    }
  }
  dates.sort();
  if (!dates.length) {
    return invalid(
      'nenhuma data impressa casa com a competência (mês/ano) da chave',
    );
  }

  // 5. Destinatário: o CNPJ que não é o emitente. Com mais de um candidato
  //    (transportadora impressa), o rótulo CNPJ/CPF decide; depois, a lista
  //    de lojas conhecidas; sem isso, rejeita.
  const cnpjs = [
    ...new Set((text.match(RE_CNPJ) ?? []).map((c) => c.replace(/\D/g, ''))),
  ];
  const candidates = cnpjs.filter((c) => c !== fromKey.issuerCnpj);
  let recipientCnpj: string | null = null;
  if (candidates.length === 1) {
    recipientCnpj = candidates[0];
  } else if (candidates.length > 1) {
    const labeled = RE_RECIPIENT_CNPJ.exec(text)?.[1].replace(/\D/g, '');
    if (labeled && candidates.includes(labeled)) {
      recipientCnpj = labeled;
    } else if (knownCnpjs) {
      const known = candidates.filter((c) => knownCnpjs.has(c));
      recipientCnpj = known.length === 1 ? known[0] : null;
    }
  }
  if (!recipientCnpj) {
    return invalid(
      candidates.length === 0
        ? 'CNPJ do destinatário não encontrado na página'
        : `não deu para identificar o destinatário com segurança (${candidates.length} CNPJs candidatos)`,
    );
  }
  let recipientName = RE_RECIPIENT_NAME.exec(text)?.[1].trim() ?? '';
  if (!recipientName) {
    const formatted = formatCnpj(recipientCnpj);
    const line = lines.find((l) => l.includes(formatted));
    recipientName = (line ?? '')
      .slice(0, (line ?? '').indexOf(formatted))
      .replace(RE_DATE, '')
      .replace(/[A-Z/ ]+:\s*$/i, '')
      .trim();
  }

  // 6. Bloco do transportador: quantidade, espécie e pesos.
  const transport = RE_TRANSPORT.exec(text);
  if (!transport) {
    return invalid(
      'bloco de volumes transportados (quantidade/espécie/peso) não encontrado',
    );
  }

  // 7. Totais: ausentes viram aviso, não rejeição.
  const warnings: string[] = [];
  const productsValue = RE_PRODUCTS_TOTAL.exec(text);
  const totalValue = RE_INVOICE_TOTAL.exec(text);
  if (!productsValue) {
    warnings.push(
      'valor total dos produtos não impresso; os itens não puderam ser conferidos',
    );
  }
  if (!totalValue) {
    warnings.push(
      'valor total da nota não impresso; a nota entrou com valor zero',
    );
  }

  const { items, suspicious } = extractItems(lines);

  return {
    kind: 'invoice',
    itemsSuspicious: suspicious,
    invoice: {
      accessKey,
      number: String(fromKey.number),
      series: String(fromKey.series),
      issuerCnpj: fromKey.issuerCnpj,
      issuerName: RE_ISSUER_NAME.exec(text)?.[1].trim() ?? '',
      recipientCnpj,
      recipientName,
      issueDate: dates[0],
      carrierVolumes: Number(transport[1]),
      species: transport[2].toUpperCase(),
      grossWeight: parseBrNumber(transport[3]),
      netWeight: parseBrNumber(transport[4]),
      productsValue: productsValue ? parseBrNumber(productsValue[1]) : 0,
      totalValue: totalValue ? parseBrNumber(totalValue[1]) : 0,
      items,
      pages: [],
      warnings,
    },
  };
}

const ITEMS_WARNING =
  'itens da nota não passaram na conferência aritmética; a nota entrou sem itens (o XML os traz depois)';

/**
 * Todas as páginas de um arquivo → notas (agregando continuações pela chave)
 * e páginas inválidas com motivo. A prova da soma roda aqui, depois de juntar
 * os itens de todas as folhas.
 */
export function extractDanfes(
  pages: string[],
  knownCnpjs?: ReadonlySet<string>,
): { invoices: DanfeInvoice[]; invalid: InvalidPage[] } {
  const invoices = new Map<
    string,
    { invoice: DanfeInvoice; suspicious: boolean }
  >();
  const orphanContinuations = new Map<
    string,
    { items: DanfeItem[]; suspicious: boolean; pages: number[] }
  >();
  const invalid: InvalidPage[] = [];

  pages.forEach((text, i) => {
    const page = i + 1;
    const result = extractDanfePage(text, knownCnpjs);
    if (result.kind === 'invalid') {
      invalid.push({ page, reason: result.reason });
      return;
    }
    if (result.kind === 'continuation') {
      const owner = invoices.get(result.accessKey);
      if (owner) {
        owner.invoice.items.push(...result.items);
        owner.invoice.pages.push(page);
        owner.suspicious ||= result.itemsSuspicious;
      } else {
        const held = orphanContinuations.get(result.accessKey) ?? {
          items: [],
          suspicious: false,
          pages: [],
        };
        held.items.push(...result.items);
        held.suspicious ||= result.itemsSuspicious;
        held.pages.push(page);
        orphanContinuations.set(result.accessKey, held);
      }
      return;
    }
    if (invoices.has(result.invoice.accessKey)) {
      invalid.push({ page, reason: 'DANFE repetido no mesmo arquivo' });
      return;
    }
    result.invoice.pages.push(page);
    const held = orphanContinuations.get(result.invoice.accessKey);
    if (held) {
      result.invoice.items.push(...held.items);
      result.invoice.pages.push(...held.pages);
      orphanContinuations.delete(result.invoice.accessKey);
    }
    invoices.set(result.invoice.accessKey, {
      invoice: result.invoice,
      suspicious: result.itemsSuspicious || (held?.suspicious ?? false),
    });
  });

  for (const [, held] of orphanContinuations) {
    for (const page of held.pages) {
      invalid.push({
        page,
        reason: 'folha de continuação sem a primeira folha da nota no arquivo',
      });
    }
  }

  const out: DanfeInvoice[] = [];
  for (const { invoice, suspicious } of invoices.values()) {
    invoice.pages.sort((a, b) => a - b);
    if (invoice.items.length) {
      const sum = invoice.items.reduce((s, it) => s + it.total, 0);
      const sumProves =
        invoice.productsValue > 0 &&
        Math.abs(sum - invoice.productsValue) <= TOLERANCE;
      if (suspicious || !sumProves) {
        invoice.items = [];
        invoice.warnings.push(ITEMS_WARNING);
      }
    }
    out.push(invoice);
  }
  invalid.sort((a, b) => a.page - b.page);
  return { invoices: out, invalid };
}
