import { rowToInvoice, toSnapshot } from '../../src/invoices/invoice.mapper';
import type { InvoiceRow } from '../../src/invoices/invoice.types';

const ROW: InvoiceRow = {
  accessKey: '1'.repeat(44),
  number: '10',
  issueDate: new Date('2026-07-15T00:00:00Z'),
  issuerCnpj: '3'.repeat(14),
  issuerName: 'FORNECEDOR',
  recipientCnpj: '1'.repeat(14),
  recipientName: 'LOJA',
  grossWeight: 0,
  itemsWeight: 31,
  volumes: 7,
  itemVolumes: 7,
  source: 'upload',
  status: 'confirmed',
  items: [
    {
      seq: 1,
      description: 'ITEM NOVO',
      unit: 'UN',
      quantity: 3,
      status: 'uncataloged',
      packagingUsed: 'UN*',
    },
    {
      seq: 2,
      description: 'BANANA',
      unit: 'KG',
      quantity: 30,
      status: 'continuous',
    },
  ],
};

describe('rowToInvoice', () => {
  it('preenche ausentes com zero/vazio e deriva o peso de descarga e os itens sem cadastro', () => {
    const inv = rowToInvoice(ROW);
    expect(inv).toMatchObject({
      issueDate: '2026-07-15',
      series: '1',
      species: 'UN',
      totalValue: 0,
      volumes: 7,
      unloadWeight: 31,
      uncatalogedItems: ['ITEM NOVO'],
      source: 'upload',
      status: 'confirmed',
      note: null,
    });
    expect(inv.items[0]).toMatchObject({
      ean: '',
      code: '',
      volumes: undefined,
      status: 'uncataloged',
    });
  });

  it('linha sem itens vira array vazio, nunca undefined', () => {
    const inv = rowToInvoice({ ...ROW, items: undefined, issueDate: null });
    expect(inv.items).toEqual([]);
    expect(inv.issueDate).toBe('');
  });
});

describe('toSnapshot', () => {
  it('arredonda o peso dos itens a três casas', () => {
    const inv = rowToInvoice(ROW);
    expect(
      toSnapshot({
        ...inv,
        items: [],
        volumes: 7,
        itemVolumes: 7,
        volumeMismatch: false,
        itemsWeight: 31.00049,
        unloadWeight: 31,
        uncatalogedItems: [],
      }),
    ).toEqual({
      volumes: 7,
      itemVolumes: 7,
      itemsWeight: 31,
      volumeMismatch: false,
    });
  });
});
