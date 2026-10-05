/**
 * Dados sintéticos e determinísticos para a demonstração: cadastro de
 * produtos, lojas, fornecedores, NF-e (XML) e DANFE (PDF). Nada aqui existe
 * de verdade. O mesmo modelo gera o XML e o DANFE, então os dois batem.
 */
import { accessKeyCheckDigit } from '../domain/access-key';
import { CatalogProduct, InMemoryCatalog } from '../domain/catalog';
import { cnpjCheckDigits } from '../domain/cnpj';
import { gs1CheckDigit } from '../domain/ean';
import type { DanfeSpec } from './danfe-pdf';

/** PRNG determinístico (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const cnpj = (base12: string): string =>
  base12 + cnpjCheckDigits(base12);

export function ean13(base12: string): string {
  return base12 + gs1CheckDigit(base12);
}

export interface Store {
  cnpj: string;
  legalName: string;
  nickname?: string;
}

export const STORES: Store[] = [
  {
    cnpj: cnpj('100000000001'),
    legalName: 'LOJA EXEMPLO CENTRO LTDA',
    nickname: 'Loja Centro',
  },
  {
    cnpj: cnpj('100000000002'),
    legalName: 'LOJA EXEMPLO NORTE LTDA',
    nickname: 'Loja Norte',
  },
  {
    cnpj: cnpj('100000000003'),
    legalName: 'LOJA EXEMPLO ATACADO LTDA',
    nickname: 'Atacado',
  },
  { cnpj: cnpj('100000000004'), legalName: 'LOJA EXEMPLO PRAIA LTDA' }, // sem apelido
];

export interface Supplier {
  cnpj: string;
  name: string;
  uf: string;
}

export const SUPPLIERS: Supplier[] = [
  { cnpj: cnpj('300000000001'), name: 'ALIMENTOS FICTICIOS S.A.', uf: '35' },
  { cnpj: cnpj('300000000002'), name: 'BEBIDAS EXEMPLO LTDA', uf: '26' },
  {
    cnpj: cnpj('300000000003'),
    name: 'HIGIENE E LIMPEZA MODELO LTDA',
    uf: '25',
  },
  { cnpj: cnpj('300000000004'), name: 'HORTIFRUTI DO VALE LTDA', uf: '25' },
];

export const CARRIER = {
  cnpj: cnpj('400000000001'),
  name: 'TRANSPORTES MODELO LTDA',
};

export const PRODUCTS: CatalogProduct[] = [
  {
    ean: ean13('789000000001'),
    code: '1001',
    name: 'BISCOITO RECHEADO CHOCOLATE 140G',
    packaging: 'CX',
    unitsPerPackage: 24,
  },
  {
    ean: ean13('789000000001'),
    code: '1001',
    name: 'BISCOITO RECHEADO CHOCOLATE 140G',
    packaging: 'UN',
    unitsPerPackage: 1,
  },
  {
    ean: ean13('789000000002'),
    code: '1002',
    name: 'SUCO DE UVA INTEGRAL 1L',
    packaging: 'FD',
    unitsPerPackage: 6,
  },
  {
    ean: ean13('789000000003'),
    code: '1003',
    name: 'DETERGENTE NEUTRO 500ML',
    packaging: 'CX',
    unitsPerPackage: 24,
  },
  {
    ean: ean13('789000000004'),
    code: '1004',
    name: 'AGUA MINERAL SEM GAS 500ML',
    packaging: 'FD',
    unitsPerPackage: 12,
  },
  {
    ean: ean13('789000000005'),
    code: '1005',
    name: 'ARROZ TIPO 1 5KG',
    packaging: 'FD',
    unitsPerPackage: 6,
  },
  {
    ean: ean13('789000000006'),
    code: '1006',
    name: 'SABAO EM PO 1KG',
    packaging: 'CX',
    unitsPerPackage: 20,
  },
  {
    ean: '',
    code: '1007',
    name: 'PAPEL HIGIENICO FOLHA DUPLA 12 ROLOS',
    packaging: 'FD',
    unitsPerPackage: 6,
  },
  {
    ean: ean13('789000000008'),
    code: '1008',
    name: 'CAFE TORRADO E MOIDO 500G',
    packaging: 'CX',
    unitsPerPackage: 10,
  },
];

/** Produto como o fornecedor escreve: nome em outra ordem, às vezes sem EAN. */
interface SupplierItem {
  ean: string;
  code: string;
  description: string;
  unit: string;
  unitValue: number;
  /** Faixa de quantidade quando não é a padrão da unidade. */
  qty?: [number, number];
}

const SUPPLIER_ITEMS: SupplierItem[] = [
  {
    ean: ean13('789000000001'),
    code: 'F-01',
    description: 'BISCOITO 140G RECHEADO CHOCOLATE',
    unit: 'UN',
    unitValue: 2.49,
  },
  {
    ean: '',
    code: '1002',
    description: 'SUCO INTEGRAL UVA 1L',
    unit: 'UN',
    unitValue: 9.9,
  },
  {
    ean: 'SEM GTIN',
    code: 'X-03',
    description: 'DETERGENTE 500ML NEUTRO',
    unit: 'UN',
    unitValue: 1.99,
  },
  {
    ean: ean13('789000000004'),
    code: '1004',
    description: 'AGUA MINERAL S/ GAS 500ML',
    unit: 'FD',
    unitValue: 14.4,
  },
  {
    ean: ean13('789000000005'),
    code: '1005',
    description: 'ARROZ T1 5KG',
    unit: 'FD',
    unitValue: 149.4,
  },
  {
    ean: ean13('789000000006'),
    code: '1006',
    description: 'SABAO PO 1KG',
    unit: 'CX',
    unitValue: 158,
  },
  {
    ean: '',
    code: 'PH-12',
    description: 'PAPEL HIG FD 12 ROLOS',
    unit: 'UN',
    unitValue: 18.9,
  },
  {
    ean: ean13('789000000008'),
    code: '1008',
    description: 'CAFE 500G TORRADO MOIDO',
    unit: 'CX',
    unitValue: 189,
  },
  {
    ean: '',
    code: 'NOVO-01',
    description: 'ITEM NOVO SEM CADASTRO 200G',
    unit: 'UN',
    unitValue: 4.5,
    qty: [2, 6],
  },
];

const PRODUCE_ITEMS: SupplierItem[] = [
  {
    ean: '',
    code: 'BAN',
    description: 'BANANA PRATA',
    unit: 'KG',
    unitValue: 4.2,
  },
  { ean: '', code: 'TOM', description: 'TOMATE', unit: 'KG', unitValue: 6.8 },
  { ean: '', code: 'BAT', description: 'BATATA', unit: 'KG', unitValue: 3.9 },
];

export function seededCatalog(): InMemoryCatalog {
  const catalog = new InMemoryCatalog();
  for (const p of PRODUCTS) {
    catalog.add(p);
  }
  return catalog;
}

export function nicknames(): Map<string, string> {
  return new Map(
    STORES.filter((s) => s.nickname).map((s) => [s.cnpj, s.nickname!]),
  );
}

export interface SyntheticItem {
  ean: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitValue: number;
  total: number;
}

/** Nota sintética, modelo comum ao XML e ao DANFE. */
export interface SyntheticModel {
  number: number;
  series: number;
  accessKey: string;
  supplier: Supplier;
  store: Store;
  /** AAAA-MM-DD */
  issueDate: string;
  items: SyntheticItem[];
  productsValue: number;
  totalValue: number;
  carrierVolumes: number;
  species: string;
  grossWeight: number;
  netWeight: number;
}

export interface SyntheticInvoice {
  fileName: string;
  xml: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const money = (v: number) => Math.round(v * 100) / 100;

function accessKey(
  uf: string,
  yymm: string,
  issuerCnpj: string,
  number: number,
  randomCode: string,
): string {
  const base = `${uf}${yymm}${issuerCnpj}55001${String(number).padStart(9, '0')}1${randomCode}`;
  return base + accessKeyCheckDigit(base);
}

/** Gera `count` notas sintéticas com variedade de unidades e casos. */
export function generateInvoices(
  count: number,
  seed: number,
  firstNumber = 1000,
): SyntheticModel[] {
  const random = rng(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(random() * arr.length)];
  // A transportadora "conta" com a mesma regra do cadastro; a divergência é
  // injetada de propósito em parte das notas.
  const catalog = seededCatalog();
  const out: SyntheticModel[] = [];

  for (let n = 0; n < count; n++) {
    const supplier = SUPPLIERS[n % SUPPLIERS.length];
    const store = pick(STORES);
    const isProduce = supplier.name.startsWith('HORTIFRUTI');
    const day = 1 + Math.floor(random() * 28);
    const issueDate = `2026-07-${String(day).padStart(2, '0')}`;
    const number = firstNumber + n;
    const key = accessKey(
      supplier.uf,
      '2607',
      supplier.cnpj,
      number,
      String(10000000 + Math.floor(random() * 89999999)),
    );

    const pool = isProduce ? PRODUCE_ITEMS : SUPPLIER_ITEMS;
    const itemCount = 1 + Math.floor(random() * Math.min(4, pool.length));
    const chosen = [...pool].sort(() => random() - 0.5).slice(0, itemCount);

    let productsValue = 0;
    let expectedVolumes = 0;
    const items: SyntheticItem[] = chosen.map((item) => {
      const quantity = item.qty
        ? item.qty[0] + Math.floor(random() * (item.qty[1] - item.qty[0] + 1))
        : item.unit === 'KG'
          ? Math.round((5 + random() * 60) * 10) / 10
          : item.unit === 'UN'
            ? 12 + Math.floor(random() * 60)
            : 1 + Math.floor(random() * 8);
      const total = money(item.unitValue * quantity);
      productsValue += total;
      expectedVolumes += catalog.itemVolumes({
        ean: item.ean,
        code: item.code,
        name: item.description,
        unit: item.unit,
        quantity,
      }).volumes;
      return {
        ean: item.ean,
        code: item.code,
        description: item.description,
        unit: item.unit,
        quantity,
        unitValue: item.unitValue,
        total,
      };
    });
    productsValue = money(productsValue);

    // Hortifrúti sai sem peso bruto e sem volumes (cobra pelo peso dos itens);
    // os demais declaram volumes, e em ~1 de cada 5 notas a transportadora
    // declara um número diferente da soma dos itens.
    const mismatch = !isProduce && random() < 0.2;
    const carrierVolumes = isProduce
      ? 0
      : Math.max(1, expectedVolumes + (mismatch ? 2 : 0));
    const grossWeight = isProduce
      ? 0
      : Math.round(carrierVolumes * (4 + random() * 12) * 1000) / 1000;

    out.push({
      number,
      series: 1,
      accessKey: key,
      supplier,
      store,
      issueDate,
      items,
      productsValue,
      totalValue: money(productsValue * 1.08),
      carrierVolumes,
      species: isProduce
        ? 'VOLUMES'
        : pick(['CAIXAS', 'VOLUMES', 'CX', 'FARDOS']),
      grossWeight,
      netWeight: Math.round(grossWeight * 0.95 * 1000) / 1000,
    });
  }
  return out;
}

/** XML da NF-e (com protocolo) a partir do modelo. */
export function toNfeXml(m: SyntheticModel): string {
  const dets = m.items
    .map(
      (item, i) =>
        `<det nItem="${i + 1}"><prod>` +
        `<cProd>${esc(item.code)}</cProd><cEAN>${esc(item.ean)}</cEAN>` +
        `<xProd>${esc(item.description)}</xProd><uCom>${item.unit}</uCom>` +
        `<qCom>${item.quantity.toFixed(4)}</qCom><vProd>${item.total.toFixed(2)}</vProd>` +
        `</prod></det>`,
    )
    .join('');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
    `<NFe><infNFe Id="NFe${m.accessKey}" versao="4.00">` +
    `<ide><nNF>${m.number}</nNF><serie>${m.series}</serie><dhEmi>${m.issueDate}T09:30:00-03:00</dhEmi></ide>` +
    `<emit><CNPJ>${m.supplier.cnpj}</CNPJ><xNome>${esc(m.supplier.name)}</xNome></emit>` +
    `<dest><CNPJ>${m.store.cnpj}</CNPJ><xNome>${esc(m.store.legalName)}</xNome></dest>` +
    dets +
    `<total><ICMSTot><vProd>${m.productsValue.toFixed(2)}</vProd><vNF>${m.totalValue.toFixed(2)}</vNF></ICMSTot></total>` +
    `<transp><vol><qVol>${m.carrierVolumes}</qVol><esp>${m.species}</esp>` +
    `<pesoL>${m.netWeight.toFixed(3)}</pesoL><pesoB>${m.grossWeight.toFixed(3)}</pesoB></vol></transp>` +
    `</infNFe></NFe>` +
    `<protNFe><infProt><chNFe>${m.accessKey}</chNFe></infProt></protNFe>` +
    `</nfeProc>`
  );
}

/** DANFE (para o PDF) a partir do mesmo modelo; imprime também a transportadora. */
export function toDanfeSpec(m: SyntheticModel): DanfeSpec {
  const exit = new Date(`${m.issueDate}T00:00:00Z`);
  exit.setUTCDate(exit.getUTCDate() + 1);
  return {
    accessKey: m.accessKey,
    number: m.number,
    series: m.series,
    issuerName: m.supplier.name,
    issuerCnpj: m.supplier.cnpj,
    recipientName: m.store.legalName,
    recipientCnpj: m.store.cnpj,
    issueDate: m.issueDate,
    exitDate: exit.toISOString().slice(0, 10),
    carrierName: CARRIER.name,
    carrierCnpj: CARRIER.cnpj,
    carrierVolumes: m.carrierVolumes,
    species: m.species,
    grossWeight: m.grossWeight,
    netWeight: m.netWeight,
    productsValue: m.productsValue,
    totalValue: m.totalValue,
    items: m.items.map((it) => ({
      code: it.code,
      description: it.description,
      unit: it.unit,
      quantity: it.quantity,
      unitValue: it.unitValue,
      total: it.total,
    })),
  };
}

export const xmlFileName = (m: SyntheticModel): string => `nfe_${m.number}.xml`;

/** Compatibilidade: `count` NF-e sintéticas já em XML. */
export function syntheticInvoices(
  count: number,
  seed: number,
  firstNumber = 1000,
): SyntheticInvoice[] {
  return generateInvoices(count, seed, firstNumber).map((m) => ({
    fileName: xmlFileName(m),
    xml: toNfeXml(m),
  }));
}

/** Planilha de produtos no formato do export do ERP (csv com ';'). */
export function productsCsv(): string {
  const header = 'COD_PRODUTO;COD_BARRA;DESCRICAO;EMB_COMPRA;QTD_EMB_COMPRA';
  const rows = PRODUCTS.map(
    (p) =>
      `${p.code};${p.ean};${p.name};${p.packaging};${String(p.unitsPerPackage).replace('.', ',')}`,
  );
  return '﻿' + [header, ...rows].join('\r\n') + '\r\n';
}
