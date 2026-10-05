import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { Invoice } from '../../src/domain/invoice';
import type { InvoicesService } from '../../src/invoices/invoices.service';
import type { StoresService } from '../../src/stores/stores.service';
import { UnloadingService } from '../../src/unloading/unloading.service';
import { MAX_KEYS } from '../../src/unloading/unloading.types';
import { buildCnpj, buildInvoice } from '../support/factories';

const STORE_A = buildCnpj('100000000001');
const STORE_B = buildCnpj('100000000002');
const NOW = new Date('2026-07-24T18:30:00.000Z');

function service(
  invoices: Invoice[],
  missing: string[] = [],
  nicknames = new Map([[STORE_A, 'Loja Centro']]),
) {
  const invoicesService = {
    findByKeys: jest.fn().mockResolvedValue({ invoices, missing }),
  };
  const storesService = { nicknameMap: jest.fn().mockResolvedValue(nicknames) };
  return {
    svc: new UnloadingService(
      invoicesService as unknown as InvoicesService,
      storesService as unknown as StoresService,
    ),
    invoicesService,
  };
}

const inv = (p: Partial<Invoice>) =>
  buildInvoice({
    recipientCnpj: STORE_A,
    volumes: 100,
    grossWeight: 300.5,
    source: 'upload',
    status: 'confirmed',
    ...p,
  });

describe('UnloadingService.compute', () => {
  it('agrupa por loja e devolve os parâmetros', async () => {
    const { svc } = service([
      inv({ number: '1' }),
      inv({ number: '2', recipientCnpj: STORE_B }),
    ]);
    const r = await svc.compute(
      { accessKeys: ['a', 'b'], method: 'volume', unitPrice: 2.5 },
      'doca',
      NOW,
    );
    expect(r.stores).toHaveLength(2);
    expect(r.totals.total).toBe(500);
    expect(r.parameters).toEqual({
      method: 'volume',
      unitPrice: 2.5,
      generatedAt: NOW.toISOString(),
      generatedBy: 'doca',
    });
  });

  it('por peso cobra só o peso', async () => {
    const { svc } = service([inv({ grossWeight: 340.5 })]);
    const r = await svc.compute(
      { accessKeys: ['a'], method: 'weight', unitPrice: 0.4 },
      '',
      NOW,
    );
    expect(r.totals.total).toBe(136.2);
  });

  it('deduplica chaves e avisa', async () => {
    const { svc, invoicesService } = service([inv({})]);
    const r = await svc.compute(
      { accessKeys: ['k1', 'k1', 'k2'], method: 'volume', unitPrice: 1 },
      '',
      NOW,
    );
    expect(invoicesService.findByKeys.mock.calls[0][0]).toEqual(['k1', 'k2']);
    expect(r.warnings.map((w) => w.code)).toContain('DUPLICATE_KEYS');
  });

  it('seleção vazia ou acima do teto é 400; chave ausente é 422', async () => {
    const { svc } = service([inv({})], ['k2']);
    await expect(
      svc.compute({ accessKeys: [], method: 'volume', unitPrice: 1 }, ''),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.compute(
        {
          accessKeys: Array.from({ length: MAX_KEYS + 1 }, (_, i) => String(i)),
          method: 'volume',
          unitPrice: 1,
        },
        '',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.compute(
        { accessKeys: ['k1', 'k2'], method: 'volume', unitPrice: 1 },
        '',
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('emite os avisos que comprometem o valor', async () => {
    const { svc } = service([
      inv({
        recipientCnpj: STORE_B,
        volumeMismatch: true,
        uncatalogedItems: ['ITEM NOVO'],
      }),
      inv({ source: 'manual', status: 'pending' }),
    ]);
    const r = await svc.compute(
      { accessKeys: ['a', 'b'], method: 'volume', unitPrice: 1 },
      '',
      NOW,
    );
    expect(r.warnings.map((w) => w.code)).toEqual([
      'UNREGISTERED_STORES',
      'MISMATCHED_INVOICES',
      'UNCATALOGED_ITEMS',
      'PENDING_MANUAL_INVOICES',
    ]);
  });

  it('ordena as notas por emissão decrescente com a chave como desempate', async () => {
    const { svc } = service([
      inv({ accessKey: 'B', issueDate: '2026-07-01' }),
      inv({ accessKey: 'A', issueDate: '2026-07-20' }),
      inv({ accessKey: 'C', issueDate: '2026-07-20' }),
    ]);
    const { invoices } = await svc.build(
      { accessKeys: ['x'], method: 'volume', unitPrice: 1 },
      '',
      NOW,
    );
    expect(invoices.map((i) => i.accessKey)).toEqual(['A', 'C', 'B']);
  });
});
