import { BadRequestException, NotFoundException } from '@nestjs/common';

import { StoresService } from '../../src/stores/stores.service';
import { buildCnpj } from '../support/factories';
import { asPrisma, prismaMock } from '../support/prisma-mock';

const CNPJ_A = buildCnpj('100000000001');
const CNPJ_B = buildCnpj('100000000002');
const NOW = new Date('2026-07-20T12:00:00Z');
const row = (cnpj: string, nickname: string, id = 1) => ({
  id,
  cnpj,
  nickname,
  createdAt: NOW,
  updatedAt: NOW,
});

describe('StoresService.list', () => {
  it('ordena por apelido em pt-BR e formata o CNPJ', async () => {
    const mock = prismaMock();
    mock.store.findMany.mockResolvedValueOnce([
      row(CNPJ_B, 'Zona Sul', 2),
      row(CNPJ_A, 'Água Fria', 1),
    ]);
    const r = await new StoresService(asPrisma(mock)).list();
    expect(r.items.map((s) => s.nickname)).toEqual(['Água Fria', 'Zona Sul']);
    expect(r.items[0].cnpjFormatted).toMatch(
      /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/,
    );
    expect(mock.store.findMany.mock.calls[0][0].where).toBeUndefined();
  });

  it('busca por apelido ou pelos dígitos do CNPJ', async () => {
    const mock = prismaMock();
    await new StoresService(asPrisma(mock)).list('10.000');
    const where = mock.store.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { nickname: { contains: '10.000', mode: 'insensitive' } },
      { cnpj: { contains: '10000' } },
    ]);
  });
});

describe('StoresService.save', () => {
  it('recusa CNPJ inválido e apelido vazio', async () => {
    const svc = new StoresService(asPrisma(prismaMock()));
    await expect(svc.save('11111111111111', 'X')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.save(CNPJ_A, '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('cria quando não existe e atualiza quando existe, normalizando o CNPJ', async () => {
    const mock = prismaMock();
    mock.store.create.mockResolvedValueOnce(row(CNPJ_A, 'Centro'));
    const svc = new StoresService(asPrisma(mock));

    const created = await svc.save(
      `${CNPJ_A.slice(0, 2)}.${CNPJ_A.slice(2, 5)}.${CNPJ_A.slice(5, 8)}/${CNPJ_A.slice(8, 12)}-${CNPJ_A.slice(12)}`,
      ' Centro ',
    );
    expect(created.created).toBe(true);
    expect(mock.store.create.mock.calls[0][0].data).toEqual({
      cnpj: CNPJ_A,
      nickname: 'Centro',
    });

    mock.store.findUnique.mockResolvedValueOnce(row(CNPJ_A, 'Centro'));
    mock.store.update.mockResolvedValueOnce(row(CNPJ_A, 'Loja Centro'));
    const updated = await svc.save(CNPJ_A, 'Loja Centro');
    expect(updated.created).toBe(false);
    expect(updated.store.nickname).toBe('Loja Centro');
  });

  it('avisa quando outra loja já usa o apelido, sem bloquear', async () => {
    const mock = prismaMock();
    mock.store.findFirst.mockResolvedValueOnce(row(CNPJ_B, 'Centro', 2));
    mock.store.create.mockResolvedValueOnce(row(CNPJ_A, 'Centro'));
    const r = await new StoresService(asPrisma(mock)).save(CNPJ_A, 'Centro');
    expect(r.duplicateNickname).toBe(true);
    expect(mock.store.findFirst.mock.calls[0][0].where.cnpj).toEqual({
      not: CNPJ_A,
    });
  });
});

describe('StoresService.remove e nicknameMap', () => {
  it('404 quando a loja não está cadastrada', async () => {
    const svc = new StoresService(asPrisma(prismaMock()));
    await expect(svc.remove(CNPJ_A)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('nicknameMap deduplica e não consulta com lista vazia', async () => {
    const mock = prismaMock();
    mock.store.findMany.mockResolvedValueOnce([
      { cnpj: CNPJ_A, nickname: 'Centro' },
    ]);
    const svc = new StoresService(asPrisma(mock));

    const map = await svc.nicknameMap([CNPJ_A, CNPJ_A, CNPJ_B]);
    expect(map.get(CNPJ_A)).toBe('Centro');
    expect(map.has(CNPJ_B)).toBe(false);
    expect(mock.store.findMany.mock.calls[0][0].where.cnpj.in).toEqual([
      CNPJ_A,
      CNPJ_B,
    ]);

    expect(await svc.nicknameMap([])).toEqual(new Map());
    expect(mock.store.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('StoresService.unregistered', () => {
  it('agrupa destinatários sem apelido com contagem e última emissão', async () => {
    const mock = prismaMock();
    mock.store.findMany.mockResolvedValueOnce([{ cnpj: CNPJ_A }]);
    mock.invoice.groupBy.mockResolvedValueOnce([
      {
        recipientCnpj: CNPJ_B,
        _count: { _all: 3 },
        _max: { issueDate: new Date('2026-07-10T00:00:00Z') },
      },
    ]);
    mock.invoice.findMany.mockResolvedValueOnce([
      { recipientCnpj: CNPJ_B, recipientName: 'LOJA NOVA LTDA' },
    ]);

    const r = await new StoresService(asPrisma(mock)).unregistered();
    expect(r).toEqual([
      expect.objectContaining({
        cnpj: CNPJ_B,
        name: 'LOJA NOVA LTDA',
        invoices: 3,
        lastIssueDate: '2026-07-10',
      }),
    ]);
    expect(mock.invoice.groupBy.mock.calls[0][0].where).toEqual({
      status: { not: 'discarded' },
      recipientCnpj: { notIn: [CNPJ_A] },
    });
  });
});
