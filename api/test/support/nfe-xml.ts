/**
 * Fábrica de XML de NF-e sintético, compartilhada pelos specs do parser, da
 * importação e da borda HTTP. Todos os dados são fictícios.
 */
import { buildAccessKey, buildCnpj } from './factories';

export const ISSUER_CNPJ = buildCnpj('300000000001');
export const RECIPIENT_CNPJ = buildCnpj('100000000001');

export interface XmlItem {
  cEAN: string;
  cProd: string;
  xProd: string;
  uCom: string;
  qCom: string;
  vProd: string;
}

export interface XmlVolume {
  qVol: string;
  esp: string | null;
  pesoB: string;
  pesoL: string;
}

export interface XmlOptions {
  number: string;
  series: string | null;
  dhEmi: string | null;
  dEmi: string | null;
  issuerCnpj: string;
  issuerName: string;
  recipientCnpj: string | null;
  recipientCpf: string | null;
  recipientName: string;
  vNF: string;
  vProd: string;
  qVol: string;
  esp: string | null;
  pesoB: string;
  pesoL: string;
  items: XmlItem[];
  accessKey: string;
  encoding: string;
  withProtocol: boolean;
  /** Prefixo de namespace nas tags (ex.: 'nfe'). */
  prefix: string;
  extraVolumes: XmlVolume[];
}

export function buildNfeXml(options: Partial<XmlOptions> = {}): string {
  const o: XmlOptions = {
    number: '1001',
    series: '1',
    dhEmi: '2026-07-15T10:00:00-03:00',
    dEmi: null,
    issuerCnpj: ISSUER_CNPJ,
    issuerName: 'FORNECEDOR FICTICIO LTDA',
    recipientCnpj: RECIPIENT_CNPJ,
    recipientCpf: null,
    recipientName: 'LOJA EXEMPLO CENTRO LTDA',
    vNF: '1000.00',
    vProd: '900.00',
    qVol: '10',
    esp: 'CAIXAS',
    pesoB: '150.500',
    pesoL: '140.000',
    items: [
      {
        cEAN: '7890000000017',
        cProd: '1001',
        xProd: 'BISCOITO 140G',
        uCom: 'CX',
        qCom: '5',
        vProd: '100.00',
      },
    ],
    accessKey: buildAccessKey({ number: 1001, cnpj: ISSUER_CNPJ }),
    encoding: 'UTF-8',
    withProtocol: true,
    prefix: '',
    extraVolumes: [],
    ...options,
  };
  const p = o.prefix ? `${o.prefix}:` : '';
  const tag = (name: string, content: string | null) =>
    content === null ? '' : `<${p}${name}>${content}</${p}${name}>`;

  const det = o.items
    .map(
      (it, i) =>
        `<${p}det nItem="${i + 1}"><${p}prod>` +
        tag('cProd', it.cProd) +
        tag('cEAN', it.cEAN) +
        tag('xProd', it.xProd) +
        tag('uCom', it.uCom) +
        tag('qCom', it.qCom) +
        tag('vProd', it.vProd) +
        `</${p}prod></${p}det>`,
    )
    .join('');

  const vol = (v: XmlVolume) =>
    `<${p}vol>` +
    tag('qVol', v.qVol) +
    tag('esp', v.esp) +
    tag('pesoL', v.pesoL) +
    tag('pesoB', v.pesoB) +
    `</${p}vol>`;
  const volumes = [
    vol({ qVol: o.qVol, esp: o.esp, pesoB: o.pesoB, pesoL: o.pesoL }),
    ...o.extraVolumes.map(vol),
  ].join('');

  const nfe =
    `<${p}NFe xmlns${o.prefix ? `:${o.prefix}` : ''}="http://www.portalfiscal.inf.br/nfe">` +
    `<${p}infNFe Id="NFe${o.accessKey}" versao="4.00">` +
    `<${p}ide>` +
    tag('nNF', o.number) +
    tag('serie', o.series) +
    tag('dhEmi', o.dhEmi) +
    tag('dEmi', o.dEmi) +
    `</${p}ide>` +
    `<${p}emit>` +
    tag('CNPJ', o.issuerCnpj) +
    tag('xNome', o.issuerName) +
    `</${p}emit>` +
    `<${p}dest>` +
    tag('CNPJ', o.recipientCnpj) +
    tag('CPF', o.recipientCpf) +
    tag('xNome', o.recipientName) +
    `</${p}dest>` +
    det +
    `<${p}total><${p}ICMSTot>` +
    tag('vProd', o.vProd) +
    tag('vNF', o.vNF) +
    `</${p}ICMSTot></${p}total>` +
    `<${p}transp>` +
    volumes +
    `</${p}transp>` +
    `</${p}infNFe>` +
    `</${p}NFe>`;

  const body = o.withProtocol
    ? `<${p}nfeProc versao="4.00">${nfe}<${p}protNFe><${p}infProt>` +
      tag('chNFe', o.accessKey) +
      `</${p}infProt></${p}protNFe></${p}nfeProc>`
    : nfe;

  return `<?xml version="1.0" encoding="${o.encoding}"?>${body}`;
}
