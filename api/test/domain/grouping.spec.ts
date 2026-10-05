import { groupByStore } from '../../src/domain/grouping';
import { buildCnpj, buildInvoice } from '../support/factories';

const STORE_A = buildCnpj('100000000001');
const STORE_B = buildCnpj('100000000002');

const invoices = [
  buildInvoice({
    number: '1',
    recipientCnpj: STORE_A,
    recipientName: 'LOJA EXEMPLO CENTRO LTDA',
    volumes: 10,
    grossWeight: 100,
    totalValue: 1000.1,
  }),
  buildInvoice({
    number: '2',
    recipientCnpj: STORE_A,
    recipientName: 'Loja Exemplo Centro',
    volumes: 3,
    grossWeight: 30.5,
    totalValue: 200,
    volumeMismatch: true,
    uncatalogedItems: ['ITEM NOVO'],
  }),
  buildInvoice({
    number: '3',
    recipientCnpj: STORE_B,
    recipientName: 'ÁGUA DOCE MERCADO LTDA',
    volumes: 7,
    grossWeight: 0,
    itemsWeight: 12.25,
    totalValue: 300,
  }),
];

describe('groupByStore', () => {
  it('agrupa pelo CNPJ do destinatário e usa o apelido cadastrado', () => {
    const r = groupByStore(
      invoices,
      'volume',
      2,
      new Map([[STORE_A, 'Loja Centro']]),
    );
    expect(
      r.stores.map((s) => [s.label, s.invoices, s.volumes, s.unloading]),
    ).toEqual([
      ['Água Doce Mercado Ltda'.toUpperCase(), 1, 7, 14],
      ['Loja Centro', 2, 13, 26],
    ]);
    const centro = r.stores[1];
    expect(centro.registered).toBe(true);
    expect(centro.legalName).toBe('LOJA EXEMPLO CENTRO LTDA');
    expect(centro.mismatchedInvoices).toBe(1);
    expect(centro.uncatalogedItems).toEqual(['ITEM NOVO']);
  });

  it('por peso, o subtotal é só do peso e o total é a soma dos subtotais', () => {
    // R$ 0,03/kg (R$ 30 por tonelada). 12,25 kg → 0,3675 → 0,37; 130,5 kg → 3,915 → 3,92.
    const r = groupByStore(invoices, 'weight', 0.03, new Map());
    expect(r.stores.map((s) => s.unloading)).toEqual([0.37, 3.92]);
    // Recalcular sobre o total (142,75 kg × 0,03 = 4,2825) daria 4,28; o
    // fechamento soma os subtotais que cada loja vê, logo 4,29.
    expect(r.totals.total).toBe(4.29);
    expect(r.totals.weight).toBe(142.75);
    expect(r.totals.invoices).toBe(3);
    expect(r.totals.totalValue).toBe(1500.1);
  });

  it('ordena por rótulo em português (acentos não vão para o fim)', () => {
    const r = groupByStore(invoices, 'volume', 1, new Map());
    expect(r.stores[0].label.startsWith('ÁGUA')).toBe(true);
  });

  it('nota sem destinatário recebe um rótulo explícito', () => {
    const r = groupByStore(
      [buildInvoice({ recipientCnpj: '', recipientName: '' })],
      'volume',
      1,
      new Map(),
    );
    expect(r.stores[0].label).toBe('(destinatário não informado)');
  });
});
