import { InMemoryCatalog } from '../../src/domain/catalog';
import {
  computeUnloading,
  invoiceWeight,
  recalculateInvoice,
} from '../../src/domain/unloading';
import { buildInvoice, buildItem } from '../support/factories';

function catalog() {
  const c = new InMemoryCatalog();
  c.add({
    ean: '7890000000017',
    code: '1001',
    name: 'BISCOITO 140G',
    packaging: 'CX',
    unitsPerPackage: 24,
  });
  return c;
}

describe('recalculateInvoice', () => {
  it('soma volumes por item e preenche o status de cada item', async () => {
    const inv = buildInvoice({
      items: [
        buildItem({ ean: '7890000000017', unit: 'UN', quantity: 48 }),
        buildItem({ unit: 'FD', quantity: 5 }),
      ],
    });
    const r = await recalculateInvoice(inv, catalog());
    expect(r.itemVolumes).toBe(7);
    expect(r.volumes).toBe(7);
    expect(r.items.map((i) => i.status)).toEqual(['converted', 'packaging']);
  });

  it('não altera a nota original', async () => {
    const inv = buildInvoice({
      items: [buildItem({ unit: 'CX', quantity: 2 })],
    });
    await recalculateInvoice(inv, catalog());
    expect(inv.items[0].volumes).toBeUndefined();
    expect(inv.volumes).toBeUndefined();
  });

  it('volume da transportadora vence a soma dos itens e a divergência é sinalizada', async () => {
    const inv = buildInvoice({
      carrierVolumes: 10,
      items: [buildItem({ unit: 'CX', quantity: 8 })],
    });
    const r = await recalculateInvoice(inv, catalog());
    expect(r.volumes).toBe(10);
    expect(r.volumeMismatch).toBe(true);
  });

  it('não sinaliza divergência quando há medida contínua', async () => {
    const inv = buildInvoice({
      carrierVolumes: 10,
      items: [
        buildItem({ unit: 'CX', quantity: 8 }),
        buildItem({ unit: 'KG', quantity: 30 }),
      ],
    });
    expect((await recalculateInvoice(inv, catalog())).volumeMismatch).toBe(
      false,
    );
  });

  it('peso vem do transporte; sem ele, da soma dos itens em massa (G ÷ 1000)', async () => {
    const horti = buildInvoice({
      grossWeight: 0,
      items: [
        buildItem({ unit: 'KG', quantity: 30.5 }),
        buildItem({ unit: 'G1', quantity: 500 }),
        buildItem({ unit: 'CX', quantity: 2 }),
      ],
    });
    const r = await recalculateInvoice(horti, catalog());
    expect(r.itemsWeight).toBeCloseTo(31);
    expect(r.unloadWeight).toBeCloseTo(31);

    const heavy = await recalculateInvoice(
      { ...horti, grossWeight: 120 },
      catalog(),
    );
    expect(heavy.unloadWeight).toBe(120);
  });

  it('lista os itens sem cadastro', async () => {
    const inv = buildInvoice({
      items: [buildItem({ description: 'ITEM NOVO', unit: 'UN', quantity: 3 })],
    });
    const r = await recalculateInvoice(inv, catalog());
    expect(r.uncatalogedItems).toEqual(['ITEM NOVO']);
    expect(r.items[0].packagingUsed).toBe('UN*');
  });

  it('aceita um conversor assíncrono (serviço com banco)', async () => {
    const asyncConverter = {
      itemVolumes: async () => ({
        volumes: 3,
        packagingUsed: 'CX',
        status: 'converted' as const,
      }),
    };
    const inv = buildInvoice({
      items: [buildItem({ unit: 'UN', quantity: 70 })],
    });
    expect((await recalculateInvoice(inv, asyncConverter)).volumes).toBe(3);
  });
});

describe('invoiceWeight', () => {
  it('usa o peso bruto quando informado e o peso dos itens caso contrário', () => {
    expect(invoiceWeight({ grossWeight: 10, itemsWeight: 3 })).toBe(10);
    expect(invoiceWeight({ grossWeight: 0, itemsWeight: 3 })).toBe(3);
    expect(invoiceWeight({ grossWeight: 0 })).toBe(0);
  });
});

describe('computeUnloading', () => {
  const invoices = [
    { volumes: 10, grossWeight: 100.25 },
    { volumes: 5, grossWeight: 0, itemsWeight: 50 },
  ];

  it('por volume: total de volumes × valor por volume', () => {
    expect(computeUnloading(invoices, 'volume', 1.5)).toEqual({
      method: 'volume',
      unitPrice: 1.5,
      totalVolumes: 15,
      totalWeight: 150.25,
      total: 22.5,
    });
  });

  it('por peso: total de kg × valor por kg, nunca somando com volume', () => {
    expect(computeUnloading(invoices, 'weight', 0.1).total).toBe(15.03);
  });

  it('valor unitário inválido vira zero', () => {
    expect(computeUnloading(invoices, 'volume', Number.NaN).total).toBe(0);
  });
});
