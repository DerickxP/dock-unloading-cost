import {
  CONTINUOUS_UNITS,
  MASS_UNITS,
  PACKAGING_UNITS,
  baseUnit,
} from '../../src/domain/units';

describe('baseUnit', () => {
  it.each([
    ['UN1', 'UN'],
    ['CX12', 'CX'],
    ['KG1', 'KG'],
    [' cx ', 'CX'],
    ['M2', 'M'],
  ])('remove o sufixo numérico de %p', (raw, expected) => {
    expect(baseUnit(raw)).toBe(expected);
  });

  it('mantém a unidade quando ela é só número', () => {
    expect(baseUnit('12')).toBe('12');
  });

  it('trata vazio e nulo como string vazia', () => {
    expect(baseUnit('')).toBe('');
    expect(baseUnit(null)).toBe('');
    expect(baseUnit(undefined)).toBe('');
  });
});

describe('conjuntos de unidades', () => {
  it('não têm interseção entre embalagem e medida contínua', () => {
    const both = [...PACKAGING_UNITS].filter((u) => CONTINUOUS_UNITS.has(u));
    expect(both).toEqual([]);
  });

  it('unidades de massa são medidas contínuas', () => {
    for (const u of MASS_UNITS) {
      expect(CONTINUOUS_UNITS.has(u)).toBe(true);
    }
  });
});
