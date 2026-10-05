import { formatBrl, formatNumber, volumeLabel } from '../../src/domain/format';

describe('formatNumber e formatBrl', () => {
  it('usam ponto de milhar e vírgula decimal', () => {
    expect(formatNumber(1234.5)).toBe('1.234,50');
    expect(formatNumber(6136.865, 3)).toBe('6.136,865');
    expect(formatBrl(98765.4)).toBe('R$ 98.765,40');
  });

  it('tratam ausente como zero', () => {
    expect(formatBrl(null)).toBe('R$ 0,00');
  });
});

describe('volumeLabel', () => {
  it('nota pesável (nenhum item gera volume, mas há peso) mostra o peso', () => {
    expect(
      volumeLabel({ volumes: 12, itemVolumes: 0, grossWeight: 850.5 }),
    ).toBe('850,500');
  });

  it('nota divergente leva o alerta', () => {
    expect(
      volumeLabel({
        volumes: 40,
        itemVolumes: 38,
        grossWeight: 0,
        volumeMismatch: true,
      }),
    ).toBe('40 ⚠');
  });

  it('caso normal mostra os volumes', () => {
    expect(
      volumeLabel({ volumes: 40, itemVolumes: 40, grossWeight: 120 }),
    ).toBe('40');
  });
});
