/**
 * A planilha é gerada e relida com o exceljs: abas, cabeçalhos, linha TOTAL,
 * formatos numéricos (dinheiro é número, não texto) e data de verdade.
 */
import { Workbook } from 'exceljs';

import { groupByStore } from '../../src/domain/grouping';
import {
  buildUnloadingWorkbook,
  invoiceRemarks,
  reportFileName,
} from '../../src/unloading/excel-report';
import type { UnloadingResult } from '../../src/unloading/unloading.types';
import { toArrayBuffer } from '../support/buffers';
import { buildCnpj, buildInvoice } from '../support/factories';

const STORE_A = buildCnpj('100000000001');
const STORE_B = buildCnpj('100000000002');
const NOW = new Date('2026-07-24T18:30:05.000Z'); // 15:30:05 em -03:00

const invoices = [
  buildInvoice({
    number: '1',
    recipientCnpj: STORE_A,
    volumes: 10,
    itemVolumes: 10,
    grossWeight: 100,
    totalValue: 1000.1,
    issueDate: '2026-07-20',
  }),
  buildInvoice({
    number: '2',
    recipientCnpj: STORE_B,
    volumes: 3,
    itemVolumes: 2,
    grossWeight: 30.5,
    totalValue: 200,
    volumeMismatch: true,
    uncatalogedItems: ['X'],
    source: 'manual',
    status: 'pending',
    issueDate: '2026-07-19',
  }),
];
const labels = new Map([[STORE_A, 'Loja Centro']]);

function result(): UnloadingResult {
  return {
    ...groupByStore(invoices, 'volume', 2.5, labels),
    parameters: {
      method: 'volume',
      unitPrice: 2.5,
      generatedAt: NOW.toISOString(),
      generatedBy: 'doca',
    },
    warnings: [{ code: 'X', message: 'aviso de teste' }],
  };
}

async function load(): Promise<Workbook> {
  const wb = new Workbook();
  await wb.xlsx.load(
    toArrayBuffer(
      await buildUnloadingWorkbook(result(), invoices, labels, NOW),
    ),
  );
  return wb;
}

describe('planilha de descarga', () => {
  it('nome do arquivo usa -03:00 fixo, com segundos', () => {
    expect(reportFileName(NOW)).toBe('descarga_20260724_153005.xlsx');
  });

  it('aba de lojas: título, cabeçalho, linhas e TOTAL com números formatados', async () => {
    const ws = (await load()).getWorksheet('Descarga por Loja')!;
    expect(String(ws.getCell('A1').value)).toContain('R$ 2,50 por volume');
    expect(String(ws.getCell('A1').value)).toContain('24/07/2026 15:30');
    expect(ws.getRow(3).values).toEqual([
      undefined,
      'Loja',
      'CNPJ',
      'Notas',
      'Volumes',
      'Peso (kg)',
      'Descarga (R$)',
      'Valor NFs (R$)',
      'Notas divergentes',
    ]);
    // ordem pt-BR: "Loja Centro" depois da razão social da loja B? Não: B é
    // "LOJA EXEMPLO CENTRO LTDA" (sem apelido) e A é "Loja Centro".
    const labelsInSheet = [ws.getCell('A4').value, ws.getCell('A5').value];
    expect(labelsInSheet).toEqual(['Loja Centro', 'LOJA EXEMPLO CENTRO LTDA']);
    expect(ws.getCell('F4').value).toBe(25); // 10 × 2,50
    expect(ws.getCell('F4').numFmt).toBe('R$ #,##0.00');
    expect(ws.getCell('E4').numFmt).toBe('#,##0.000');
    expect(ws.getCell('A6').value).toBe('TOTAL');
    expect(ws.getCell('F6').value).toBe(32.5);
    expect(ws.getCell('H6').value).toBe(1);
    expect(String(ws.getCell('A8').value)).toContain('doca');
    expect(String(ws.getCell('A9').value)).toContain('aviso de teste');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 });
  });

  it('aba de notas: data de verdade, peso de descarga e observações', async () => {
    const ws = (await load()).getWorksheet('Notas Selecionadas')!;
    expect(ws.getRow(1).getCell(1).value).toBe('Nº NF-e');
    expect(ws.getCell('A2').value).toBe('1');
    expect(ws.getCell('D2').value).toBe('Loja Centro');
    expect(ws.getCell('F2').value).toBeInstanceOf(Date);
    expect(ws.getCell('F2').numFmt).toBe('dd/mm/yyyy');
    expect(ws.getCell('J2').value).toBe(1000.1);
    expect(ws.getCell('K3').value).toBe(30.5);
    expect(ws.getCell('L3').value).toBe(
      'volumes divergentes · itens sem cadastro · nota manual pendente',
    );
    expect(ws.getCell('L2').value ?? '').toBe('');
  });

  it('invoiceRemarks lista só o que se aplica', () => {
    expect(invoiceRemarks(invoices[0])).toBe('');
    expect(invoiceRemarks(buildInvoice({ volumeMismatch: true }))).toBe(
      'volumes divergentes',
    );
  });
});
