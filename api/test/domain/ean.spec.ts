import { eanVariants, gs1CheckDigit } from '../../src/domain/ean';

describe('gs1CheckDigit', () => {
  it.each([
    ['789000000001', '7'], // GTIN-13 7890000000017
    ['0001234567890', '5'], // GTIN-14 00012345678905
    ['9638507', '4'], // GTIN-8 96385074
  ])('calcula o verificador de %p', (data, digit) => {
    expect(gs1CheckDigit(data)).toBe(digit);
  });
});

describe('eanVariants', () => {
  it('inclui as formas com e sem zeros à esquerda', () => {
    const v = eanVariants('07890000000017');
    expect(v).toEqual(
      expect.arrayContaining(['07890000000017', '7890000000017']),
    );
  });

  it('deriva o GTIN-13 da unidade a partir do GTIN-14 da caixa', () => {
    // Caixa = indicador 1 + 12 dígitos da unidade + novo verificador.
    const unit = '7890000000017';
    const data = '1' + unit.slice(0, 12);
    const box = data + gs1CheckDigit(data);
    expect(eanVariants(box)).toContain(unit);
  });

  it('não deriva unidade do indicador 9 (quantidade variável)', () => {
    const data = '9' + '789000000001';
    const box = data + gs1CheckDigit(data);
    expect(eanVariants(box)).not.toContain('7890000000017');
  });

  it('devolve o valor literal quando não é numérico', () => {
    expect(eanVariants('SEM GTIN')).toEqual(['SEM GTIN']);
  });

  it('devolve lista vazia sem EAN', () => {
    expect(eanVariants('')).toEqual([]);
    expect(eanVariants(null)).toEqual([]);
  });
});
