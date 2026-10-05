/**
 * DANFE sintético para os testes: a spec e o texto por folha, no mesmo
 * formato que o pdf-parse devolve (linhas separadas por \n).
 */
import type { DanfeSpec, DanfePdfOptions } from '../../src/demo/danfe-pdf';
import { danfeSheets } from '../../src/demo/danfe-pdf';
import { buildAccessKey, buildCnpj } from './factories';

export const ISSUER = buildCnpj('300000000001');
export const STORE = buildCnpj('100000000001');
export const CARRIER = buildCnpj('400000000001');

export function danfeSpec(p: Partial<DanfeSpec> = {}): DanfeSpec {
  const items = p.items ?? [
    {
      code: 'F-01',
      description: 'BISCOITO 140G RECHEADO CHOCOLATE',
      unit: 'UN',
      quantity: 48,
      unitValue: 2.49,
      total: 119.52,
    },
    {
      code: 'X-03',
      description: 'DETERGENTE 500ML NEUTRO',
      unit: 'UN',
      quantity: 37,
      unitValue: 1.99,
      total: 73.63,
    },
    {
      code: 'TOM',
      description: 'TOMATE',
      unit: 'KG',
      quantity: 30.5,
      unitValue: 6.8,
      total: 207.4,
    },
  ];
  const productsValue =
    p.productsValue ??
    Math.round(items.reduce((s, it) => s + it.total, 0) * 100) / 100;
  const number = p.number ?? 1234;
  return {
    accessKey: buildAccessKey({
      yymm: '2607',
      cnpj: ISSUER,
      series: 1,
      number,
    }),
    number,
    series: 1,
    issuerName: 'FORNECEDOR FICTICIO LTDA',
    issuerCnpj: ISSUER,
    recipientName: 'LOJA EXEMPLO CENTRO LTDA',
    recipientCnpj: STORE,
    issueDate: '2026-07-15',
    exitDate: '2026-07-16',
    carrierName: 'TRANSPORTES MODELO LTDA',
    carrierCnpj: CARRIER,
    carrierVolumes: 4,
    species: 'CAIXAS',
    grossWeight: 150.5,
    netWeight: 140,
    productsValue,
    totalValue: p.totalValue ?? Math.round(productsValue * 1.08 * 100) / 100,
    ...p,
    items,
  };
}

/** Texto das folhas de um DANFE, como o pdf-parse entregaria. */
export function danfePages(
  spec: DanfeSpec,
  options: DanfePdfOptions = {},
): string[] {
  return danfeSheets(spec, options).map((lines) => lines.join('\n'));
}
