import { BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';

import { decodeText, parseBrNumber } from '../../src/common/text';
import { ProductsService } from '../../src/products/products.service';
import {
  mapColumns,
  parseProductSpreadsheet,
  splitCsvLine,
} from '../../src/products/spreadsheet';
import { asPrisma, prismaMock } from '../support/prisma-mock';

async function xlsx(headers: string[], rows: unknown[][]): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Produtos');
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('mapColumns: cabeçalhos do ERP → papéis', () => {
  it('reconhece os nomes usuais e testa quantidade antes de embalagem', () => {
    expect(
      mapColumns([
        'COD_PRODUTO',
        'COD_BARRA',
        'DESCRICAO',
        'QTD_EMB_COMPRA',
        'EMB_COMPRA',
      ]),
    ).toEqual({
      ean: 'COD_BARRA',
      quantity: 'QTD_EMB_COMPRA',
      code: 'COD_PRODUTO',
      name: 'DESCRICAO',
      packaging: 'EMB_COMPRA',
    });
  });

  it('aceita os nomes canônicos em inglês e português', () => {
    expect(
      mapColumns(['ean', 'code', 'name', 'packaging', 'unitsPerPackage']),
    ).toEqual({
      ean: 'ean',
      quantity: 'unitsPerPackage',
      code: 'code',
      name: 'name',
      packaging: 'packaging',
    });
    expect(
      mapColumns(['EAN', 'CODIGO', 'NOME', 'EMBALAGEM', 'QTD_EMBALAGEM']).name,
    ).toBe('NOME');
  });
});

describe('parseProductSpreadsheet', () => {
  it('lê xlsx com defaults: embalagem vazia vira CX, quantidade vazia vira 1, linha sem nome é pulada', async () => {
    const bytes = await xlsx(
      ['SEQ', 'COD_BAR', 'DESCRICAO', 'UNID_VENDA', 'FATOR'],
      [
        ['1001', '789.0000.000017', 'Biscoito Recheado 140g', 'cx', 24],
        ['1002', '', 'Suco Uva 1L', '', ''],
        ['1003', '', '', 'FD', 6],
        ['1004', '', 'Arroz 5kg', 'FD', '0'],
        ['1005', '', 'Sabão 1kg', 'CX', 'vinte'],
      ],
    );
    const r = await parseProductSpreadsheet('produtos.xlsx', bytes);
    expect(r.rows).toEqual([
      {
        line: 2,
        ean: '7890000000017',
        code: '1001',
        name: 'Biscoito Recheado 140g',
        packaging: 'CX',
        unitsPerPackage: 24,
      },
      {
        line: 3,
        ean: null,
        code: '1002',
        name: 'Suco Uva 1L',
        packaging: 'CX',
        unitsPerPackage: 1,
      },
      {
        line: 5,
        ean: null,
        code: '1004',
        name: 'Arroz 5kg',
        packaging: 'FD',
        unitsPerPackage: 1,
      },
    ]);
    expect(r.skipped).toBe(1);
    expect(r.warnings).toEqual([
      'Linha 6: quantidade por embalagem "vinte" não é numérica; linha ignorada',
    ]);
  });

  it('lê csv com ";" e BOM, vírgula decimal e aspas', async () => {
    const csv =
      '﻿CODIGO;NOME;EMBALAGEM;QTD_EMBALAGEM\n7;"DETERGENTE; NEUTRO 500ML";CX;24,0\n8;AGUA 500ML;FD;12\n';
    const r = await parseProductSpreadsheet(
      'export.csv',
      Buffer.from(csv, 'utf-8'),
    );
    expect(
      r.rows.map((x) => [x.code, x.name, x.packaging, x.unitsPerPackage]),
    ).toEqual([
      ['7', 'DETERGENTE; NEUTRO 500ML', 'CX', 24],
      ['8', 'AGUA 500ML', 'FD', 12],
    ]);
  });

  it('csv em Windows-1252 sem BOM preserva acentos', async () => {
    const csv = 'CODIGO;NOME\n1;AÇÚCAR CRISTAL 1KG\n';
    const r = await parseProductSpreadsheet(
      'x.csv',
      Buffer.from(csv, 'latin1'),
    );
    expect(r.rows[0].name).toBe('AÇÚCAR CRISTAL 1KG');
  });

  it('sem coluna de nome é 400 com os cabeçalhos lidos', async () => {
    await expect(
      parseProductSpreadsheet('x.csv', Buffer.from('A;B\n1;2\n')),
    ).rejects.toMatchObject({
      response: { message: expect.stringContaining('A, B') },
    });
    await expect(
      parseProductSpreadsheet('x.csv', Buffer.from('')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('arquivo que não é planilha é 400', async () => {
    await expect(
      parseProductSpreadsheet('x.xlsx', Buffer.from('nada')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ProductsService.importSpreadsheet', () => {
  it('upsert pela tripla quando há código; sem código cria; erro de linha vira aviso', async () => {
    const mock = prismaMock();
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce(null);
    (mock.product as unknown as { findUnique: jest.Mock }).findUnique =
      findUnique;
    mock.product.create
      .mockResolvedValueOnce({ id: 11 })
      .mockRejectedValueOnce(new Error('coluna muito longa'));
    const svc = new ProductsService(asPrisma(mock));

    const csv =
      'CODIGO;NOME;EMBALAGEM;QTD\n1001;Biscoito;CX;24\n1002;Suco;FD;6\n;Sem codigo;UN;1\n';
    const r = await svc.importSpreadsheet('p.csv', Buffer.from(csv));

    expect(findUnique.mock.calls[0][0].where).toEqual({
      code_packaging_unitsPerPackage: {
        code: '1001',
        packaging: 'CX',
        unitsPerPackage: 24,
      },
    });
    expect(mock.product.update.mock.calls[0][0]).toMatchObject({
      where: { id: 10 },
      data: { name: 'Biscoito', nameNorm: 'BISCOITO' },
    });
    expect(mock.product.create.mock.calls[0][0].data).toMatchObject({
      code: '1002',
      packaging: 'FD',
      unitsPerPackage: 6,
    });
    expect(mock.product.create.mock.calls[1][0].data).toMatchObject({
      code: null,
      name: 'Sem codigo',
      packaging: 'UN',
    });
    expect(r).toMatchObject({
      rows: 3,
      processed: 2,
      created: 1,
      updated: 1,
      skipped: 0,
    });
    expect(r.warnings).toEqual(['Linha 4: coluna muito longa']);
    expect(r.columns).toEqual({
      quantity: 'QTD',
      code: 'CODIGO',
      name: 'NOME',
      packaging: 'EMBALAGEM',
    });
  });
});

describe('utilitários de texto', () => {
  it('splitCsvLine respeita aspas e aspas escapadas', () => {
    expect(splitCsvLine('a;"b;c";"d ""e""";f')).toEqual([
      'a',
      'b;c',
      'd "e"',
      'f',
    ]);
  });

  it('parseBrNumber aceita vírgula decimal e milhar com ponto', () => {
    expect(parseBrNumber('1.234,5')).toBe(1234.5);
    expect(parseBrNumber('12.5')).toBe(12.5);
    expect(parseBrNumber('24')).toBe(24);
    expect(parseBrNumber('')).toBeNaN();
  });

  it('decodeText: BOM, UTF-8 estrito e fallback Windows-1252', () => {
    expect(
      decodeText(
        Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from('ação', 'utf-8'),
        ]),
      ),
    ).toBe('ação');
    expect(decodeText(Buffer.from('ação', 'utf-8'))).toBe('ação');
    expect(decodeText(Buffer.from('ação', 'latin1'))).toBe('ação');
  });
});
