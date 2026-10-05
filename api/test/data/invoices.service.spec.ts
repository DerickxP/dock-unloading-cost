import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { InvoicesService } from '../../src/invoices/invoices.service';
import type { StoresService } from '../../src/stores/stores.service';
import { buildAccessKey, buildCnpj } from '../support/factories';
import { asPrisma, prismaError, prismaMock } from '../support/prisma-mock';

const ISSUER = '48151623000191';
const KEY = buildAccessKey({
  yymm: '2607',
  cnpj: ISSUER,
  series: 2,
  number: 123456,
});
const STORE = buildCnpj('100000000001');

function stores(map = new Map<string, string>()): StoresService {
  return {
    nicknameMap: jest.fn().mockResolvedValue(map),
  } as unknown as StoresService;
}

const MANUAL_ROW = {
  accessKey: KEY,
  number: '123456',
  series: '2',
  issueDate: new Date('2026-07-10T00:00:00Z'),
  issuerCnpj: ISSUER,
  issuerName: 'FORNECEDOR',
  recipientCnpj: STORE,
  recipientName: 'LOJA EXEMPLO CENTRO LTDA',
  carrierVolumes: 8,
  grossWeight: 0,
  volumes: 8,
  source: 'manual',
  status: 'pending',
};

const base = () => ({
  accessKey: KEY.match(/.{4}/g)!.join(' '),
  issueDate: '2026-07-10',
  recipientCnpj: STORE,
  issuerName: 'Fornecedor Ficticio',
  volumes: 8,
});

describe('InvoicesService.createManual', () => {
  it('grava número, série e emitente a partir da chave; volumes espelham o transporte', async () => {
    const mock = prismaMock();
    mock.invoice.create.mockResolvedValueOnce(MANUAL_ROW);
    const svc = new InvoicesService(
      asPrisma(mock),
      stores(new Map([[STORE, 'Loja Centro']])),
    );

    const r = await svc.createManual(
      { ...base(), species: 'caixas 12', note: '  conferir  ' },
      'doca',
    );
    const data = mock.invoice.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      accessKey: KEY,
      number: '123456',
      series: '2',
      issuerCnpj: ISSUER,
      recipientCnpj: STORE,
      carrierVolumes: 8,
      volumes: 8,
      grossWeight: 0,
      species: 'CAIXAS',
      source: 'manual',
      status: 'pending',
      note: 'conferir',
      createdBy: 'doca',
    });
    expect(data.issueDate.toISOString()).toBe('2026-07-10T00:00:00.000Z');
    expect(r.invoice.storeLabel).toBe('Loja Centro');
    expect(r.invoice.storeRegistered).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it.each([
    [
      'chave com DV errado',
      { accessKey: KEY.slice(0, 43) + (KEY[43] === '0' ? '1' : '0') },
    ],
    ['data inexistente', { issueDate: '2026-02-30' }],
    ['destinatário inválido', { recipientCnpj: '123' }],
    ['emitente diferente da chave', { issuerCnpj: buildCnpj('300000000009') }],
    ['sem volumes nem peso', { volumes: 0, grossWeight: 0 }],
    ['volume negativo', { volumes: -1 }],
    ['observação longa', { note: 'x'.repeat(501) }],
  ])('recusa %s com 400', async (_label, patch) => {
    const svc = new InvoicesService(asPrisma(prismaMock()), stores());
    await expect(
      svc.createManual({ ...base(), ...patch }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('avisa quando a data está fora da competência da chave', async () => {
    const mock = prismaMock();
    mock.invoice.create.mockResolvedValueOnce(MANUAL_ROW);
    const r = await new InvoicesService(asPrisma(mock), stores()).createManual({
      ...base(),
      issueDate: '2026-08-01',
    });
    expect(r.warnings.map((w) => w.code)).toEqual(['DATE_OUTSIDE_KEY_PERIOD']);
  });

  it('chave repetida vira 409', async () => {
    const mock = prismaMock();
    mock.invoice.create.mockRejectedValueOnce(prismaError('P2002'));
    await expect(
      new InvoicesService(asPrisma(mock), stores()).createManual(base()),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('InvoicesService.updateManual e discard', () => {
  it('só nota manual pendente pode ser alterada', async () => {
    const mock = prismaMock();
    const svc = new InvoicesService(asPrisma(mock), stores());
    await expect(svc.updateManual(KEY, { volumes: 9 })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    mock.invoice.findUnique.mockResolvedValueOnce({
      ...MANUAL_ROW,
      source: 'upload',
      status: 'confirmed',
    });
    await expect(svc.updateManual(KEY, { volumes: 9 })).rejects.toBeInstanceOf(
      ConflictException,
    );

    mock.invoice.findUnique.mockResolvedValueOnce({
      ...MANUAL_ROW,
      status: 'reconciled',
    });
    await expect(svc.discard(KEY)).rejects.toBeInstanceOf(ConflictException);
  });

  it('atualiza só o que foi enviado e mantém volumes = transporte', async () => {
    const mock = prismaMock();
    mock.invoice.findUnique.mockResolvedValueOnce(MANUAL_ROW);
    mock.invoice.update.mockResolvedValueOnce({
      ...MANUAL_ROW,
      grossWeight: 12.5,
    });
    await new InvoicesService(asPrisma(mock), stores()).updateManual(
      KEY,
      { grossWeight: 12.5, note: '' },
      'doca',
    );
    expect(mock.invoice.update.mock.calls[0][0]).toEqual({
      where: { accessKey: KEY },
      data: {
        carrierVolumes: 8,
        volumes: 8,
        grossWeight: 12.5,
        updatedBy: 'doca',
        note: null,
      },
    });
  });

  it('zerar volumes e peso ao mesmo tempo é recusado', async () => {
    const mock = prismaMock();
    mock.invoice.findUnique.mockResolvedValueOnce(MANUAL_ROW);
    await expect(
      new InvoicesService(asPrisma(mock), stores()).updateManual(KEY, {
        volumes: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('descartar é baixa lógica', async () => {
    const mock = prismaMock();
    mock.invoice.findUnique.mockResolvedValueOnce(MANUAL_ROW);
    await new InvoicesService(asPrisma(mock), stores()).discard(KEY, 'admin');
    expect(mock.invoice.update.mock.calls[0][0].data).toEqual({
      status: 'discarded',
      updatedBy: 'admin',
    });
  });
});

describe('InvoicesService.list', () => {
  it('exclui descartadas por padrão, aceita vários números e mapeia a ordenação', async () => {
    const mock = prismaMock();
    const svc = new InvoicesService(asPrisma(mock), stores());
    await svc.list({
      number: '1001, 1002;1003',
      from: '2026-07-01',
      mismatchOnly: true,
      orderBy: 'store',
      direction: 'desc',
      perPage: 999,
    });
    const args = mock.invoice.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      status: { not: 'discarded' },
      issueDate: { gte: new Date('2026-07-01T00:00:00Z') },
      OR: [
        { number: { contains: '1001' } },
        { number: { contains: '1002' } },
        { number: { contains: '1003' } },
      ],
      volumeMismatch: true,
    });
    expect(args.orderBy).toEqual([
      { recipientName: 'desc' },
      { accessKey: 'asc' },
    ]);
    expect(args.take).toBe(200);
  });

  it('monta o resumo com apelido, espécie dos itens e peso de descarga', async () => {
    const mock = prismaMock();
    mock.invoice.findMany.mockResolvedValueOnce([
      {
        ...MANUAL_ROW,
        source: 'upload',
        status: 'confirmed',
        grossWeight: 0,
        itemsWeight: 42.5,
        species: 'VOLUMES',
        items: [
          { packagingUsed: 'CX', unit: 'UN' },
          { packagingUsed: 'CX', unit: 'CX' },
          { packagingUsed: 'KG', unit: 'KG' },
        ],
      },
    ]);
    mock.invoice.count.mockResolvedValueOnce(1);
    const r = await new InvoicesService(
      asPrisma(mock),
      stores(new Map([[STORE, 'Loja Centro']])),
    ).list({});
    expect(r.items[0]).toMatchObject({
      storeLabel: 'Loja Centro',
      storeRegistered: true,
      species: 'CX+',
      unloadWeight: 42.5,
      issueDate: '2026-07-10',
    });
  });
});

describe('InvoicesService.findByKey e findByKeys', () => {
  it('404 para chave desconhecida', async () => {
    await expect(
      new InvoicesService(asPrisma(prismaMock()), stores()).findByKey('000'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findByKeys devolve as ausentes (descartadas contam como ausentes)', async () => {
    const mock = prismaMock();
    mock.invoice.findMany.mockResolvedValueOnce([{ ...MANUAL_ROW, items: [] }]);
    const other = buildAccessKey({ number: 2 });
    const r = await new InvoicesService(asPrisma(mock), stores()).findByKeys([
      KEY,
      other,
      KEY,
    ]);
    expect(r.invoices.map((i) => i.accessKey)).toEqual([KEY]);
    expect(r.missing).toEqual([other]);
    expect(mock.invoice.findMany.mock.calls[0][0].where).toEqual({
      accessKey: { in: [KEY, other] },
      status: { not: 'discarded' },
    });
  });
});
