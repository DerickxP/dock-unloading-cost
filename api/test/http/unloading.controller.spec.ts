import { INestApplication } from '@nestjs/common';
import { Workbook } from 'exceljs';
import request from 'supertest';

import { groupByStore } from '../../src/domain/grouping';
import { UnloadingController } from '../../src/unloading/unloading.controller';
import { UnloadingService } from '../../src/unloading/unloading.service';
import { buildInvoice } from '../support/factories';
import { toArrayBuffer } from '../support/buffers';
import { httpApp } from '../support/http-app';

describe('UnloadingController', () => {
  let app: INestApplication;
  const invoices = [buildInvoice({ volumes: 10, grossWeight: 100 })];
  const grouped = groupByStore(invoices, 'volume', 2, new Map());
  const result = {
    ...grouped,
    parameters: {
      method: 'volume',
      unitPrice: 2,
      generatedAt: '2026-07-24T18:30:00.000Z',
      generatedBy: '',
    },
    warnings: [],
  };
  const service = {
    compute: jest.fn().mockResolvedValue(result),
    build: jest.fn().mockResolvedValue({ result, invoices, labels: new Map() }),
  };

  beforeAll(async () => {
    app = await httpApp(
      [UnloadingController],
      [{ provide: UnloadingService, useValue: service }],
    );
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const body = { accessKeys: ['k1'], method: 'volume', unitPrice: 2 };

  it('POST /api/unloading/compute devolve o resultado e repassa o operador', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/unloading/compute')
      .set('x-operator', 'doca')
      .send(body)
      .expect(201);
    expect(res.body.totals.total).toBe(20);
    expect(service.compute).toHaveBeenCalledWith(body, 'doca');
  });

  it('a borda recusa método fora do vocabulário, preço em texto com vírgula e lista vazia', async () => {
    await request(app.getHttpServer())
      .post('/api/unloading/compute')
      .send({ ...body, method: 'Volume' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/unloading/compute')
      .send({ ...body, unitPrice: '2,50' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/unloading/compute')
      .send({ ...body, unitPrice: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/unloading/compute')
      .send({ ...body, accessKeys: [] })
      .expect(400);
    expect(service.compute).not.toHaveBeenCalled();
  });

  it('POST /api/unloading/export devolve um .xlsx legível com as duas abas', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/unloading/export')
      .send(body)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(201);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    expect(res.headers['content-disposition']).toMatch(
      /descarga_\d{8}_\d{6}\.xlsx/,
    );
    const wb = new Workbook();
    await wb.xlsx.load(toArrayBuffer(res.body as Buffer));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Descarga por Loja',
      'Notas Selecionadas',
    ]);
  });
});
