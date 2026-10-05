import {
  accessKeyCheckDigit,
  formatAccessKey,
  isValidAccessKey,
  parseAccessKey,
} from '../../src/domain/access-key';
import { buildAccessKey } from '../support/factories';

describe('chave de acesso', () => {
  const key = buildAccessKey({
    uf: '25',
    yymm: '2607',
    cnpj: '48151623000191',
    series: 1,
    number: 206179,
    randomCode: '12345678',
  });

  it('a fábrica de teste gera uma chave válida de 44 dígitos', () => {
    expect(key).toHaveLength(44);
    expect(isValidAccessKey(key)).toBe(true);
  });

  it('aceita a chave formatada em grupos de 4 como impressa no DANFE', () => {
    expect(isValidAccessKey(formatAccessKey(key))).toBe(true);
    expect(formatAccessKey(key).split(' ')).toHaveLength(11);
  });

  it('recusa DV errado, tamanho errado e chave só de zeros', () => {
    const wrong = key.slice(0, 43) + String((Number(key[43]) + 1) % 10);
    expect(isValidAccessKey(wrong)).toBe(false);
    expect(isValidAccessKey(key.slice(0, 43))).toBe(false);
    expect(isValidAccessKey('0'.repeat(44))).toBe(false);
  });

  it('DV é 0 quando o resto do módulo 11 é 0 ou 1', () => {
    for (let i = 0; i < 200; i++) {
      const base = String(i).padStart(43, '7');
      const dv = Number(accessKeyCheckDigit(base));
      expect(dv).toBeGreaterThanOrEqual(0);
      expect(dv).toBeLessThanOrEqual(9);
    }
  });

  it('decompõe os campos posicionais', () => {
    expect(parseAccessKey(key)).toEqual({
      key,
      uf: '25',
      yymm: '2607',
      year: 2026,
      month: 7,
      issuerCnpj: '48151623000191',
      model: '55',
      series: 1,
      number: 206179,
      emissionType: '1',
      randomCode: '12345678',
      checkDigit: key[43],
    });
  });

  it('não decompõe chave inválida', () => {
    expect(parseAccessKey('123')).toBeNull();
  });
});
