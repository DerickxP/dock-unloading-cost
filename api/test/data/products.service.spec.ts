import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { ProductsService } from '../../src/products/products.service';
import { asPrisma, prismaError, prismaMock } from '../support/prisma-mock';

const ROW = {
  id: 1,
  ean: '7890000000017',
  code: '1001',
  name: 'BISCOITO RECHEADO CHOCOLATE 140G',
  nameNorm: '140G BISCOITO CHOCOLATE RECHEADO',
  packaging: 'CX',
  unitsPerPackage: 24,
};

describe('ProductsService.list', () => {
  it('busca por frase, por tokens normalizados e por dígitos', async () => {
    const mock = prismaMock();
    await new ProductsService(asPrisma(mock)).list({ search: 'biscoito 140g' });
    const where = mock.product.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: 'biscoito 140g', mode: 'insensitive' } },
      {
        AND: [
          { nameNorm: { contains: '140G' } },
          { nameNorm: { contains: 'BISCOITO' } },
        ],
      },
      { ean: { contains: '140' } },
      { code: '140' },
    ]);
  });

  it('pagina com teto de 100 e ordena com desempate por id', async () => {
    const mock = prismaMock();
    mock.product.findMany.mockResolvedValueOnce([ROW]);
    mock.product.count.mockResolvedValueOnce(250);
    const r = await new ProductsService(asPrisma(mock)).list({
      page: 3,
      perPage: 500,
      orderBy: 'code',
      direction: 'desc',
    });
    const args = mock.product.findMany.mock.calls[0][0];
    expect(args.take).toBe(100);
    expect(args.skip).toBe(200);
    expect(args.orderBy).toEqual([{ code: 'desc' }, { id: 'asc' }]);
    expect(r).toMatchObject({ total: 250, page: 3, perPage: 100 });
    expect(r.items[0]).not.toHaveProperty('nameNorm');
  });
});

describe('ProductsService.create', () => {
  it('normaliza e grava nameNorm', async () => {
    const mock = prismaMock();
    mock.product.create.mockResolvedValueOnce(ROW);
    await new ProductsService(asPrisma(mock)).create({
      ean: '789.0000.000017',
      code: ' 1001 ',
      name: ' Biscoito Recheado Chocolate 140g ',
      packaging: 'cx',
      unitsPerPackage: 24,
    });
    expect(mock.product.create.mock.calls[0][0].data).toEqual({
      ean: '7890000000017',
      code: '1001',
      name: 'Biscoito Recheado Chocolate 140g',
      nameNorm: '140G BISCOITO CHOCOLATE RECHEADO',
      packaging: 'CX',
      unitsPerPackage: 24,
    });
  });

  it('valida nome, embalagem e quantidade', async () => {
    const svc = new ProductsService(asPrisma(prismaMock()));
    await expect(
      svc.create({ name: '', packaging: 'CX', unitsPerPackage: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.create({ name: 'X', packaging: ' ', unitsPerPackage: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.create({ name: 'X', packaging: 'CX', unitsPerPackage: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('embalagem repetida vira 409', async () => {
    const mock = prismaMock();
    mock.product.create.mockRejectedValueOnce(prismaError('P2002'));
    await expect(
      new ProductsService(asPrisma(mock)).create({
        name: 'X',
        packaging: 'CX',
        unitsPerPackage: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ProductsService.update e remove', () => {
  it('nome novo recalcula nameNorm; demais campos só quando enviados', async () => {
    const mock = prismaMock();
    mock.product.update.mockResolvedValueOnce(ROW);
    await new ProductsService(asPrisma(mock)).update(1, {
      name: 'Suco Uva 1L',
      ean: '',
    });
    expect(mock.product.update.mock.calls[0][0]).toEqual({
      where: { id: 1 },
      data: { name: 'Suco Uva 1L', nameNorm: '1L SUCO UVA', ean: null },
    });
  });

  it('id inexistente vira 404 no update e no remove', async () => {
    const mock = prismaMock();
    mock.product.update.mockRejectedValueOnce(prismaError('P2025'));
    mock.product.delete.mockRejectedValueOnce(prismaError('P2025'));
    const svc = new ProductsService(asPrisma(mock));
    await expect(svc.update(99, { name: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.remove(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
