import { dateFromIso, formatDateBr, isoFromDate } from '../../src/domain/dates';

describe('dateFromIso', () => {
  it('interpreta a data como meia-noite UTC', () => {
    expect(dateFromIso('2026-07-31')?.toISOString()).toBe(
      '2026-07-31T00:00:00.000Z',
    );
  });

  it('descarta a hora de um ISO completo', () => {
    expect(dateFromIso('2026-07-31T21:30:00-03:00')?.toISOString()).toBe(
      '2026-07-31T00:00:00.000Z',
    );
  });

  it('recusa datas que não existem no calendário', () => {
    expect(dateFromIso('2026-02-30')).toBeNull();
    expect(dateFromIso('2026-13-01')).toBeNull();
  });

  it('recusa texto fora do formato', () => {
    expect(dateFromIso('31/07/2026')).toBeNull();
    expect(dateFromIso('')).toBeNull();
    expect(dateFromIso(null)).toBeNull();
  });
});

describe('isoFromDate e formatDateBr', () => {
  it('fazem o caminho de volta sem passar pelo fuso local', () => {
    const d = dateFromIso('2026-01-01')!;
    expect(isoFromDate(d)).toBe('2026-01-01');
    expect(formatDateBr(d)).toBe('01/01/2026');
    expect(formatDateBr('2026-12-31')).toBe('31/12/2026');
  });

  it('devolvem vazio para data ausente ou inválida', () => {
    expect(isoFromDate(null)).toBe('');
    expect(isoFromDate(new Date('x'))).toBe('');
    expect(formatDateBr('lixo')).toBe('');
  });
});
