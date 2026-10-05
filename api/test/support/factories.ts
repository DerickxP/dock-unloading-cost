import { accessKeyCheckDigit } from '../../src/domain/access-key';
import { cnpjCheckDigits } from '../../src/domain/cnpj';

/** CNPJ válido a partir de 12 caracteres de base (dados fictícios). */
export function buildCnpj(base12: string): string {
  return base12 + cnpjCheckDigits(base12);
}

export interface AccessKeyParts {
  uf?: string;
  yymm?: string;
  cnpj?: string;
  model?: string;
  series?: number;
  number?: number;
  emissionType?: string;
  randomCode?: string;
}

/** Chave de acesso de NF-e com DV correto. */
export function buildAccessKey(p: AccessKeyParts = {}): string {
  const base =
    (p.uf ?? '25') +
    (p.yymm ?? '2607') +
    (p.cnpj ?? '48151623000191') +
    (p.model ?? '55') +
    String(p.series ?? 1).padStart(3, '0') +
    String(p.number ?? 1).padStart(9, '0') +
    (p.emissionType ?? '1') +
    (p.randomCode ?? '00000001');
  return base + accessKeyCheckDigit(base);
}

import type { Invoice, InvoiceItem } from '../../src/domain/invoice';

export function buildItem(p: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    ean: '',
    code: '',
    description: 'PRODUTO TESTE',
    unit: 'CX',
    quantity: 1,
    value: 0,
    ...p,
  };
}

export function buildInvoice(p: Partial<Invoice> = {}): Invoice {
  return {
    accessKey: buildAccessKey({ number: Number(p.number ?? 1) }),
    number: '1',
    series: '1',
    issueDate: '2026-07-15',
    issuerCnpj: buildCnpj('300000000001'),
    issuerName: 'FORNECEDOR FICTICIO LTDA',
    recipientCnpj: buildCnpj('100000000001'),
    recipientName: 'LOJA EXEMPLO CENTRO LTDA',
    totalValue: 0,
    productsValue: 0,
    species: 'CX',
    carrierVolumes: 0,
    grossWeight: 0,
    netWeight: 0,
    items: [],
    ...p,
  };
}
