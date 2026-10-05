/**
 * CatalogService (Prisma mockado): a cascata é a mesma do InMemoryCatalog
 * (test/domain/catalog.spec.ts é a especificação); aqui travamos a ORDEM das
 * consultas e o aprendizado persistido.
 */
import { CatalogService } from '../../src/catalog/catalog.service';
import { asPrisma, prismaMock } from '../support/prisma-mock';

const BOX24 = {
  id: 1,
  ean: '7890000000017',
  code: '1001',
  name: 'BISCOITO RECHEADO CHOCOLATE 140G',
  packaging: 'CX',
  unitsPerPackage: 24,
};
const UNIT = { ...BOX24, id: 2, packaging: 'UN', unitsPerPackage: 1 };

describe('CatalogService.findPackaging', () => {
  it('1. EAN com variantes para na primeira consulta e escolhe a master pack', async () => {
    const mock = prismaMock();
    mock.product.findMany.mockResolvedValueOnce([UNIT, BOX24]);
    const svc = new CatalogService(asPrisma(mock));

    const match = await svc.findPackaging({
      ean: '07890000000017',
      code: '99',
      name: 'OUTRO',
    });
    expect(match).toMatchObject({
      code: '1001',
      packaging: 'CX',
      unitsPerPackage: 24,
      matchedBy: 'ean',
    });
    expect(mock.product.findMany).toHaveBeenCalledTimes(1);
    const where = mock.product.findMany.mock.calls[0][0].where;
    expect(where.ean.in).toEqual(
      expect.arrayContaining(['7890000000017', '07890000000017']),
    );
    expect(mock.productAlias.findFirst).not.toHaveBeenCalled();
  });

  it('2. sem EAN cai para o código', async () => {
    const mock = prismaMock();
    mock.product.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([BOX24]);
    const svc = new CatalogService(asPrisma(mock));

    const match = await svc.findPackaging({ ean: '000', code: '1001' });
    expect(match?.matchedBy).toBe('code');
    expect(mock.product.findMany.mock.calls[1][0].where).toEqual({
      code: '1001',
    });
  });

  it('3. nome exato é case-insensitive', async () => {
    const mock = prismaMock();
    mock.product.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([BOX24]);
    const svc = new CatalogService(asPrisma(mock));

    const match = await svc.findPackaging({
      code: '99',
      name: 'biscoito recheado chocolate 140g',
    });
    expect(match?.matchedBy).toBe('name');
    expect(mock.product.findMany.mock.calls[1][0].where.name).toEqual({
      equals: 'biscoito recheado chocolate 140g',
      mode: 'insensitive',
    });
  });

  it('4. alias gravado resolve antes do fallback de texto', async () => {
    const mock = prismaMock();
    mock.product.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([BOX24]);
    mock.productAlias.findFirst.mockResolvedValueOnce({
      kind: 'ean',
      key: '7898888888884',
      code: '1001',
    });
    const svc = new CatalogService(asPrisma(mock));

    const match = await svc.findPackaging({ ean: '07898888888884' });
    expect(match?.matchedBy).toBe('alias');
    const aliasWhere = mock.productAlias.findFirst.mock.calls[0][0].where;
    expect(aliasWhere.OR).toContainEqual({ kind: 'ean', key: '7898888888884' });
    expect(mock.product.findMany.mock.calls[1][0].where).toEqual({
      code: '1001',
    });
  });

  it('5. nome normalizado único casa e grava alias de nome e de EAN', async () => {
    const mock = prismaMock();
    mock.product.findMany
      .mockResolvedValueOnce([]) // ean
      .mockResolvedValueOnce([]) // nome exato
      .mockResolvedValueOnce([BOX24]); // nameNorm
    const svc = new CatalogService(asPrisma(mock));

    const match = await svc.findPackaging({
      ean: '7899999999999',
      name: 'CHOCOLATE 140G BISCOITO RECHEADO',
    });
    expect(match?.matchedBy).toBe('normalized');
    expect(mock.product.findMany.mock.calls[2][0].where).toEqual({
      nameNorm: '140G BISCOITO CHOCOLATE RECHEADO',
    });
    const createMany = mock.productAlias.createMany.mock.calls[0][0];
    expect(createMany.skipDuplicates).toBe(true);
    expect(createMany.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'ean',
          key: '7899999999999',
          code: '1001',
        }),
        expect.objectContaining({
          kind: 'name',
          key: '140G BISCOITO CHOCOLATE RECHEADO',
          code: '1001',
        }),
      ]),
    );
  });

  it('nome normalizado ambíguo não casa nem aprende', async () => {
    const mock = prismaMock();
    mock.product.findMany
      .mockResolvedValueOnce([]) // nome exato (sem ean/código)
      .mockResolvedValueOnce([BOX24, { ...BOX24, id: 9, code: '2002' }]);
    const svc = new CatalogService(asPrisma(mock));

    expect(await svc.findPackaging({ name: 'BISCOITO 140G' })).toBeNull();
    expect(mock.productAlias.createMany).not.toHaveBeenCalled();
  });

  it('falha ao gravar alias não derruba a busca', async () => {
    const mock = prismaMock();
    mock.product.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([BOX24]);
    mock.productAlias.createMany.mockRejectedValueOnce(new Error('banco fora'));
    const svc = new CatalogService(asPrisma(mock));

    expect(
      (await svc.findPackaging({ name: 'CHOCOLATE 140G BISCOITO RECHEADO' }))
        ?.code,
    ).toBe('1001');
  });

  it('sem nenhum identificador devolve null sem consultar', async () => {
    const mock = prismaMock();
    const svc = new CatalogService(asPrisma(mock));
    expect(await svc.findPackaging({})).toBeNull();
    expect(mock.product.findMany).not.toHaveBeenCalled();
  });
});

describe('CatalogService.itemVolumes', () => {
  it('só consulta o banco para unidade avulsa', async () => {
    const mock = prismaMock();
    const svc = new CatalogService(asPrisma(mock));

    expect(await svc.itemVolumes({ unit: 'CX', quantity: 3 })).toMatchObject({
      volumes: 3,
      status: 'packaging',
    });
    expect(await svc.itemVolumes({ unit: 'KG', quantity: 30 })).toMatchObject({
      volumes: 0,
      status: 'continuous',
    });
    expect(mock.product.findMany).not.toHaveBeenCalled();

    mock.product.findMany.mockResolvedValueOnce([BOX24]);
    expect(
      await svc.itemVolumes({ ean: '7890000000017', unit: 'UN', quantity: 50 }),
    ).toEqual({
      volumes: 4,
      packagingUsed: 'CX',
      status: 'converted',
    });
  });

  it('sem cadastro conta a quantidade bruta e sinaliza', async () => {
    const svc = new CatalogService(asPrisma(prismaMock()));
    expect(
      await svc.itemVolumes({ code: 'X', unit: 'UN', quantity: 7 }),
    ).toEqual({
      volumes: 7,
      packagingUsed: 'UN*',
      status: 'uncataloged',
    });
  });
});
