import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ImportPdfService } from '../../src/invoices/import-pdf.service';
import { ImportService } from '../../src/invoices/import.service';
import { InvoicesController } from '../../src/invoices/invoices.controller';
import { InvoicesService } from '../../src/invoices/invoices.service';
import { buildAccessKey } from '../support/factories';
import { httpApp } from '../support/http-app';
import { buildNfeXml } from '../support/nfe-xml';

const ADMIN = 'segredo-de-teste';
const KEY = buildAccessKey({ number: 55 });

describe('InvoicesController', () => {
  let app: INestApplication;
  const invoices = {
    list: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, perPage: 50 }),
    createManual: jest
      .fn()
      .mockResolvedValue({ invoice: { accessKey: KEY }, warnings: [] }),
    updateManual: jest.fn().mockResolvedValue({ accessKey: KEY }),
    discard: jest.fn().mockResolvedValue(undefined),
    findByKey: jest.fn().mockResolvedValue({ accessKey: KEY, items: [] }),
  };
  const importer = {
    importXml: jest.fn().mockResolvedValue({
      results: [],
      imported: 0,
      reconciled: 0,
      updated: 0,
      errors: 0,
    }),
  };
  const pdfImporter = {
    importPdf: jest
      .fn()
      .mockResolvedValue({
        results: [],
        imported: 0,
        reconciled: 0,
        updated: 0,
        errors: 0,
      }),
  };

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = ADMIN;
    app = await httpApp(
      [InvoicesController],
      [
        { provide: InvoicesService, useValue: invoices },
        { provide: ImportService, useValue: importer },
        { provide: ImportPdfService, useValue: pdfImporter },
      ],
    );
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('GET /api/invoices valida datas, vocabulário e converte booleano', async () => {
    await request(app.getHttpServer())
      .get(
        '/api/invoices?from=2026-07-01&mismatchOnly=true&status=pending&page=2',
      )
      .expect(200);
    expect(invoices.list).toHaveBeenCalledWith({
      from: '2026-07-01',
      mismatchOnly: true,
      status: 'pending',
      page: 2,
    });
    await request(app.getHttpServer())
      .get('/api/invoices?from=01/07/2026')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/invoices?status=qualquer')
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/invoices?mismatchOnly=false')
      .expect(200);
    expect(invoices.list).toHaveBeenLastCalledWith({ mismatchOnly: false });
  });

  it('GET /api/invoices/decode-key não falha com chave inválida', async () => {
    const bad = await request(app.getHttpServer())
      .get('/api/invoices/decode-key?key=123')
      .expect(200);
    expect(bad.body).toEqual({ valid: false, key: '123' });
    const ok = await request(app.getHttpServer())
      .get(`/api/invoices/decode-key?key=${KEY}`)
      .expect(200);
    expect(ok.body).toMatchObject({
      valid: true,
      number: 55,
      issuerCnpj: '48151623000191',
    });
    expect(ok.body.formatted.split(' ')).toHaveLength(11);
  });

  it('POST /api/invoices/manual repassa o operador do header e valida o corpo', async () => {
    const body = {
      accessKey: KEY,
      issueDate: '2026-07-10',
      recipientCnpj: '1',
      issuerName: 'F',
      volumes: '8',
    };
    await request(app.getHttpServer())
      .post('/api/invoices/manual')
      .set('x-operator', ' doca-01 ')
      .send(body)
      .expect(201);
    expect(invoices.createManual).toHaveBeenCalledWith(
      expect.objectContaining({ volumes: 8 }),
      'doca-01',
    );
    await request(app.getHttpServer())
      .post('/api/invoices/manual')
      .send({ ...body, issueDate: '10/07/2026' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/invoices/manual')
      .send({ ...body, volumes: 1.5 })
      .expect(400);
  });

  it('POST /api/invoices/import-xml aceita lote multipart e exige ao menos um arquivo', async () => {
    await request(app.getHttpServer())
      .post('/api/invoices/import-xml')
      .attach('files', Buffer.from(buildNfeXml()), 'a.xml')
      .attach('files', Buffer.from('<x/>'), 'b.xml')
      .expect(201);
    const [files, operator] = importer.importXml.mock.calls[0];
    expect(files.map((f: { name: string }) => f.name)).toEqual([
      'a.xml',
      'b.xml',
    ]);
    expect(files[0].bytes).toBeInstanceOf(Buffer);
    expect(operator).toBeUndefined();
    await request(app.getHttpServer())
      .post('/api/invoices/import-xml')
      .expect(400);
  });

  it('POST /api/invoices/import-pdf aceita lote multipart e exige ao menos um arquivo', async () => {
    await request(app.getHttpServer())
      .post('/api/invoices/import-pdf')
      .set('x-operator', 'doca')
      .attach('files', Buffer.from('%PDF-1.4 fake'), 'carga.pdf')
      .expect(201);
    const [files, operator] = pdfImporter.importPdf.mock.calls[0];
    expect(files.map((f: { name: string }) => f.name)).toEqual(['carga.pdf']);
    expect(operator).toBe('doca');
    await request(app.getHttpServer())
      .post('/api/invoices/import-pdf')
      .expect(400);
  });

  it('PATCH é aberto; DELETE exige admin e devolve 204', async () => {
    await request(app.getHttpServer())
      .patch(`/api/invoices/${KEY}`)
      .send({ volumes: 9 })
      .expect(200);
    expect(invoices.updateManual).toHaveBeenCalledWith(
      KEY,
      { volumes: 9 },
      undefined,
    );
    await request(app.getHttpServer())
      .delete(`/api/invoices/${KEY}`)
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/invoices/${KEY}`)
      .set('x-admin-key', ADMIN)
      .expect(204);
  });
});
