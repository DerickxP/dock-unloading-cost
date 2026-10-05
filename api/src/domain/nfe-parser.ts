/**
 * Parser do XML da NF-e: bytes → nota no vocabulário do domínio.
 *
 * A extração é pura e não calcula nada: devolve a nota com os itens brutos e
 * quem dá volumes, pesos e divergência a ela é `recalculateInvoice`, com a
 * mesma regra usada para notas já gravadas. Assim não existem dois caminhos de
 * cálculo para divergirem.
 *
 * Decisões que o mundo real impôs:
 * - encoding: BOM > declaração `<?xml ... encoding=?>` > UTF-8. NF-e costuma vir
 *   em ISO-8859-1; ler tudo como UTF-8 corrompe acentos de razão social.
 * - chave: chNFe do protocolo; sem protocolo, o Id="NFe…" do infNFe.
 * - sem chave ou sem número a nota não é aproveitável (null, nunca "nota vazia").
 * - série ausente = "1"; dhEmi com fallback para dEmi (layout antigo).
 * - destinatário com CNPJ ou CPF; espécie = primeira palavra ("VOLUMES 110 m3"
 *   → "VOLUMES"), ausente → "UN"; qVol inteiro; número inválido = 0.
 * - vários <vol>: vale o primeiro.
 * - totais só do bloco ICMSTot: os itens também têm vProd e vêm antes.
 * - tags com ou sem prefixo de namespace (<nNF> e <nfe:nNF>) são equivalentes.
 * - tudo é lido como string: cProd/cEAN com zeros à esquerda não podem virar
 *   número.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser';

import type { Invoice, InvoiceItem } from './invoice';

// ── Leitura / encoding ───────────────────────────────────────────────────────

export function detectEncoding(raw: Uint8Array): string {
  if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    return 'utf-8';
  }
  if (raw[0] === 0xff && raw[1] === 0xfe) {
    return 'utf-16le';
  }
  if (raw[0] === 0xfe && raw[1] === 0xff) {
    return 'utf-16be';
  }
  // O cabeçalho é lido como latin1 só para enxergar a declaração ASCII.
  const header = Buffer.from(raw.subarray(0, 300)).toString('latin1');
  const m = /encoding\s*=\s*["']([\w-]+)["']/.exec(header);
  return m ? m[1].toLowerCase() : 'utf-8';
}

/** Decodifica respeitando o encoding detectado; label desconhecido cai em UTF-8. */
export function decodeXml(raw: Uint8Array): string {
  const encoding = detectEncoding(raw);
  try {
    return new TextDecoder(encoding).decode(raw);
  } catch {
    return new TextDecoder('utf-8').decode(raw);
  }
}

// ── Navegação na árvore ──────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  htmlEntities: true,
  isArray: (name) => name === 'det' || name === 'vol',
});

type Node = unknown;

/** Primeira ocorrência da tag em profundidade, na ordem do documento. */
function findNode(node: Node, name: string): Node {
  if (node === null || node === undefined || typeof node !== 'object') {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, name);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  if (name in obj) {
    return obj[name];
  }
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('@_') || key === '#text') {
      continue;
    }
    const found = findNode(value, name);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** Texto de um nó: tag simples, tag com atributos ('#text') ou lista (primeiro). */
function text(node: Node): string {
  if (node === null || node === undefined) {
    return '';
  }
  if (typeof node === 'string') {
    return node.trim();
  }
  if (typeof node === 'number' || typeof node === 'boolean') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return text(node[0]);
  }
  if (
    typeof node === 'object' &&
    '#text' in (node as Record<string, unknown>)
  ) {
    return text((node as Record<string, unknown>)['#text']);
  }
  return '';
}

/** Número; ausente ou inválido vale zero, sem exceção. */
function num(node: Node): number {
  const s = text(node);
  if (!s) {
    return 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Inteiro: "10.0" → 10. */
const int = (node: Node): number => Math.trunc(num(node));

/** Primeira palavra da espécie, em maiúsculas; vazia → UN. */
export function cleanSpecies(raw: string): string {
  const m = /^([A-Za-zÀ-ÿ]+)/.exec(raw.trim());
  const word = m ? m[1] : raw.trim().split(/\s+/)[0];
  return (word || 'UN').toUpperCase();
}

// ── Extração ─────────────────────────────────────────────────────────────────

const ACCESS_KEY = /^\d{44}$/;

/**
 * Nota extraída do XML, ou `null` quando o conteúdo não é aproveitável: XML
 * malformado, sem chave de acesso ou sem número.
 */
export function parseNfe(xml: string): Invoice | null {
  if (XMLValidator.validate(xml) !== true) {
    return null;
  }
  let root: Node;
  try {
    root = parser.parse(xml) as Node;
  } catch {
    return null;
  }

  const infNFe = findNode(root, 'infNFe');
  if (infNFe === undefined) {
    return null;
  }

  let accessKey = text(findNode(root, 'chNFe'));
  if (!ACCESS_KEY.test(accessKey)) {
    const id = text((infNFe as Record<string, unknown>)['@_Id']);
    const m = /^NFe(\d{44})$/.exec(id);
    accessKey = m ? m[1] : '';
  }
  if (!accessKey) {
    return null;
  }

  const ide = findNode(infNFe, 'ide');
  const number = text(findNode(ide, 'nNF'));
  if (!number) {
    return null;
  }
  const issued = text(findNode(ide, 'dhEmi')) || text(findNode(ide, 'dEmi'));

  const issuer = findNode(infNFe, 'emit');
  const recipient = findNode(infNFe, 'dest');
  const totals = findNode(infNFe, 'ICMSTot');

  const vols = findNode(findNode(infNFe, 'transp'), 'vol');
  const vol0: Node = Array.isArray(vols) ? vols[0] : vols;

  const items: InvoiceItem[] = [];
  const dets = findNode(infNFe, 'det');
  for (const det of Array.isArray(dets) ? dets : dets ? [dets] : []) {
    const prod = findNode(det, 'prod');
    if (prod === undefined) {
      continue;
    }
    items.push({
      ean: text(findNode(prod, 'cEAN')),
      code: text(findNode(prod, 'cProd')),
      description: text(findNode(prod, 'xProd')),
      unit: text(findNode(prod, 'uCom')),
      quantity: num(findNode(prod, 'qCom')),
      value: num(findNode(prod, 'vProd')),
    });
  }

  return {
    accessKey,
    number,
    series: text(findNode(ide, 'serie')) || '1',
    issueDate: issued ? issued.slice(0, 10) : '',
    issuerCnpj: text(findNode(issuer, 'CNPJ')),
    issuerName: text(findNode(issuer, 'xNome')),
    recipientCnpj:
      text(findNode(recipient, 'CNPJ')) || text(findNode(recipient, 'CPF')),
    recipientName: text(findNode(recipient, 'xNome')),
    totalValue: num(findNode(totals, 'vNF')),
    productsValue: num(findNode(totals, 'vProd')),
    species: cleanSpecies(text(findNode(vol0, 'esp'))),
    carrierVolumes: int(findNode(vol0, 'qVol')),
    grossWeight: num(findNode(vol0, 'pesoB')),
    netWeight: num(findNode(vol0, 'pesoL')),
    items,
  };
}
