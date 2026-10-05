import { invoiceSpecies } from '../../src/domain/species';

describe('invoiceSpecies', () => {
  it('usa a embalagem mais frequente dos itens', () => {
    expect(
      invoiceSpecies(
        [
          { packagingUsed: 'CX' },
          { packagingUsed: 'CX' },
          { packagingUsed: 'FD' },
        ],
        'UN',
      ),
    ).toBe('CX+');
  });

  it('sem mistura, não leva o sufixo', () => {
    expect(invoiceSpecies([{ unit: 'kg' }, { unit: 'KG' }], 'VOLUMES')).toBe(
      'KG',
    );
  });

  it('desempata em ordem alfabética', () => {
    expect(invoiceSpecies([{ unit: 'FD' }, { unit: 'CX' }], '')).toBe('CX+');
  });

  it('sem itens, cai na espécie do transporte e depois em UN', () => {
    expect(invoiceSpecies([], 'caixa')).toBe('CAIXA');
    expect(invoiceSpecies(null, '')).toBe('UN');
  });
});
