import {
  formatAccessKey,
  formatBrl,
  formatCnpj,
  formatDateBr,
  formatNumber,
  parseDecimal,
  volumeLabel,
} from './format';

describe('formatação pt-BR', () => {
  it('números e reais', () => {
    expect(formatNumber(1234.5)).toBe('1.234,50');
    expect(formatNumber(6136.865, 3)).toBe('6.136,865');
    expect(formatBrl(98765.4)).toBe('R$ 98.765,40');
    expect(formatBrl(null)).toBe('R$ 0,00');
  });

  it('datas, CNPJ/CPF e chave de acesso', () => {
    expect(formatDateBr('2026-07-15')).toBe('15/07/2026');
    expect(formatDateBr('2026-07-15T00:00:00.000Z')).toBe('15/07/2026');
    expect(formatDateBr('')).toBe('');
    expect(formatCnpj('10000000000145')).toBe('10.000.000/0001-45');
    expect(formatCnpj('12345678909')).toBe('123.456.789-09');
    expect(formatAccessKey('1'.repeat(44)).split(' ')).toHaveLength(11);
  });

  it('parseDecimal aceita vírgula e ponto', () => {
    expect(parseDecimal('2,50')).toBe(2.5);
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal('0.12')).toBe(0.12);
    expect(parseDecimal('')).toBeNaN();
  });

  it('volumeLabel: pesável mostra o peso, divergente leva alerta', () => {
    expect(volumeLabel({ volumes: 0, itemVolumes: 0, grossWeight: 850.5, volumeMismatch: false })).toBe('850,500 kg');
    expect(volumeLabel({ volumes: 40, itemVolumes: 38, grossWeight: 0, volumeMismatch: true })).toBe('40 ⚠');
    expect(volumeLabel({ volumes: 40, itemVolumes: 40, grossWeight: 120, volumeMismatch: false })).toBe('40');
  });
});
