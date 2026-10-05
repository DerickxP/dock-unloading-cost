import { InMemoryCatalog } from '../../src/domain/catalog';
import { gs1CheckDigit } from '../../src/domain/ean';

function catalog() {
  const c = new InMemoryCatalog();
  c.add({
    ean: '7890000000017',
    code: '1001',
    name: 'BISCOITO RECHEADO CHOCOLATE 140G',
    packaging: 'CX',
    unitsPerPackage: 24,
  });
  c.add({
    ean: '7890000000017',
    code: '1001',
    name: 'BISCOITO RECHEADO CHOCOLATE 140G',
    packaging: 'UN',
    unitsPerPackage: 1,
  });
  c.add({
    ean: '7890000000024',
    code: '1002',
    name: 'SUCO DE UVA INTEGRAL 1L',
    packaging: 'FD',
    unitsPerPackage: 6,
  });
  c.add({
    ean: '',
    code: '1003',
    name: 'DETERGENTE NEUTRO 500ML',
    packaging: 'CX',
    unitsPerPackage: 24,
  });
  c.add({
    ean: '',
    code: '1004',
    name: 'AGUA MINERAL 500ML',
    packaging: 'FD',
    unitsPerPackage: 12,
  });
  c.add({
    ean: '',
    code: '1005',
    name: '500ML MINERAL AGUA',
    packaging: 'FD',
    unitsPerPackage: 6,
  });
  return c;
}

describe('InMemoryCatalog: cascata de busca', () => {
  it('1. EAN, inclusive com zeros à esquerda, escolhendo a master pack', () => {
    expect(catalog().findPackaging({ ean: '07890000000017' })).toMatchObject({
      code: '1001',
      packaging: 'CX',
      unitsPerPackage: 24,
    });
  });

  it('1b. EAN de caixa (GTIN-14) casa com o produto da unidade', () => {
    const data = '1' + '789000000002';
    const box = data + gs1CheckDigit(data);
    expect(catalog().findPackaging({ ean: box })?.code).toBe('1002');
  });

  it('2. código do fornecedor quando não há EAN', () => {
    expect(
      catalog().findPackaging({ ean: 'SEM GTIN', code: '1003' })?.code,
    ).toBe('1003');
  });

  it('3. nome exato, sem diferenciar maiúsculas', () => {
    expect(
      catalog().findPackaging({ name: 'detergente neutro 500ml' })?.code,
    ).toBe('1003');
  });

  it('4/5. nome normalizado único casa e é aprendido como alias', () => {
    const c = catalog();
    const result = c.findPackaging({
      ean: '7899999999999',
      name: 'DETERGENTE 500ML NEUTRO',
    });
    expect(result?.code).toBe('1003');
    expect(c.findAlias({ name: 'NEUTRO DETERGENTE 500ML' })).toBe('1003');
    // O EAN desconhecido também foi aprendido: a próxima nota casa direto.
    expect(c.findAlias({ ean: '07899999999999' })).toBe('1003');
    expect(c.findPackaging({ ean: '7899999999999' })?.code).toBe('1003');
  });

  it('nome normalizado ambíguo não casa nem aprende', () => {
    const c = catalog();
    expect(c.findPackaging({ name: 'MINERAL 500ML AGUA' })).toBeNull();
    expect(c.findAlias({ name: 'MINERAL 500ML AGUA' })).toBeNull();
  });

  it('alias aprendido tem precedência sobre o fallback de texto', () => {
    const c = catalog();
    c.learnAlias({ name: 'AGUA SEM GAS GARRAFA' }, '1004');
    expect(c.findPackaging({ name: 'agua sem gas garrafa' })?.code).toBe(
      '1004',
    );
  });

  it('nunca sobrescreve um alias existente', () => {
    const c = catalog();
    c.learnAlias({ name: 'X' }, '1004');
    c.learnAlias({ name: 'X' }, '1005');
    expect(c.findAlias({ name: 'X' })).toBe('1004');
  });

  it('item desconhecido devolve null', () => {
    expect(
      catalog().findPackaging({ ean: '123', code: '9', name: 'NADA' }),
    ).toBeNull();
  });

  it('itemVolumes aplica a regra completa usando o cadastro', () => {
    const c = catalog();
    expect(
      c.itemVolumes({ ean: '7890000000017', unit: 'UN', quantity: 50 }),
    ).toEqual({
      volumes: 4,
      packagingUsed: 'CX',
      status: 'converted',
    });
  });
});
