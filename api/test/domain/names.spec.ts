import { normalizeName } from '../../src/domain/names';

describe('normalizeName', () => {
  it('ignora ordem das palavras e pontuação', () => {
    expect(normalizeName('BISCOITO RECHEADO CHOCOLATE 140G')).toBe(
      normalizeName('biscoito 140g, recheado - chocolate'),
    );
  });

  it('remove acentos em vez de quebrar a palavra', () => {
    expect(normalizeName('FEIJÃO CARIOCA')).toBe('CARIOCA FEIJAO');
  });

  it('devolve vazio para nome vazio', () => {
    expect(normalizeName('  ')).toBe('');
    expect(normalizeName(null)).toBe('');
  });
});
