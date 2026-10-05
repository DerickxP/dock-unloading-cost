import {
  cnpjCheckDigits,
  formatCnpj,
  isValidCnpj,
  isValidTaxId,
  normalizeCnpj,
} from '../../src/domain/cnpj';

describe('normalizeCnpj', () => {
  it('remove a máscara e passa para maiúsculas', () => {
    expect(normalizeCnpj('48.151.623/0001-91')).toBe('48151623000191');
    expect(normalizeCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
  });

  it('recompõe zeros à esquerda perdidos pelo Excel (12 ou 13 caracteres)', () => {
    expect(normalizeCnpj('8151623000191')).toBe('08151623000191');
  });

  it('não completa entradas curtas demais', () => {
    expect(normalizeCnpj('123')).toBe('123');
  });
});

describe('isValidCnpj', () => {
  it('aceita CNPJ numérico com DV correto', () => {
    expect(isValidCnpj('48.151.623/0001-91')).toBe(true);
  });

  it('aceita o CNPJ alfanumérico', () => {
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
  });

  it('recusa DV errado, tamanho errado e dígitos repetidos', () => {
    expect(isValidCnpj('48.151.623/0001-92')).toBe(false);
    expect(isValidCnpj('48151623000')).toBe(false);
    expect(isValidCnpj('11111111111180')).toBe(false);
  });

  it('cnpjCheckDigits gera os dois DVs', () => {
    expect(cnpjCheckDigits('481516230001')).toBe('91');
  });
});

describe('isValidTaxId', () => {
  it('aceita CNPJ ou CPF pelo formato, sem conferir DV', () => {
    expect(isValidTaxId('48151623000199')).toBe(true);
    expect(isValidTaxId('123.456.789-00')).toBe(true);
    expect(isValidTaxId('123')).toBe(false);
  });
});

describe('formatCnpj', () => {
  it('aplica a máscara de exibição', () => {
    expect(formatCnpj('48151623000191')).toBe('48.151.623/0001-91');
  });

  it('devolve o valor normalizado quando não tem 14 caracteres', () => {
    expect(formatCnpj('123')).toBe('123');
  });
});
