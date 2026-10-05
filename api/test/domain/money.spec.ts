import { round2, round3 } from '../../src/domain/money';

describe('round2', () => {
  it('arredonda o meio para cima pelo valor decimal digitado', () => {
    // 2.675 em binário é 2.67499999…; Math.round(v * 100) / 100 daria 2.67.
    expect(round2(2.675)).toBe(2.68);
    expect(round2(1.005)).toBe(1.01);
  });

  it('afasta do zero nos negativos e nunca devolve -0', () => {
    expect(round2(-2.675)).toBe(-2.68);
    expect(Object.is(round2(-0.001), 0)).toBe(true);
  });

  it('aceita valores em notação exponencial', () => {
    expect(round2(1e-7)).toBe(0);
    expect(round2(1.5e21)).toBe(1.5e21);
  });

  it('trata nulo, NaN e infinito como zero', () => {
    expect(round2(null)).toBe(0);
    expect(round2(undefined)).toBe(0);
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe('round3', () => {
  it('usa a precisão do peso bruto da NF-e (kg com 3 casas)', () => {
    expect(round3(6136.8655)).toBe(6136.866);
    expect(round3(0.1 + 0.2)).toBe(0.3);
  });
});
