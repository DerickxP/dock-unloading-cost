import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { ProductsController } from '../../src/products/products.controller';
import { ProductsService } from '../../src/products/products.service';
import { httpApp } from '../support/http-app';

const ADMIN = 'segredo-de-teste';

describe('ProductsController', () => {
  let app: INestApplication;
  const service = {
    list: jest
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 1, perPage: 50 }),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue({ id: 1 }),
    remove: jest.fn().mockResolvedValue(undefined),
    importSpreadsheet: jest.fn().mockResolvedValue({
      file: 'p.csv',
      rows: 1,
      processed: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      warnings: [],
      columns: {},
    }),
  };

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = ADMIN;
    app = await httpApp(
      [ProductsController],
      [{ provide: ProductsService, useValue: service }],
    );
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('GET converte page/perPage para número e valida o vocabulário de ordenação', async () => {
    await request(app.getHttpServer())
      .get('/api/products?search=suco&page=2&perPage=10&orderBy=code')
      .expect(200);
    expect(service.list).toHaveBeenCalledWith({
      search: 'suco',
      page: 2,
      perPage: 10,
      orderBy: 'code',
    });
    await request(app.getHttpServer())
      .get('/api/products?orderBy=preco')
      .expect(400);
    await request(app.getHttpServer()).get('/api/products?page=0').expect(400);
  });

  it('POST exige admin e unitsPerPackage positivo', async () => {
    const body = { name: 'Suco', packaging: 'FD', unitsPerPackage: 6 };
    await request(app.getHttpServer())
      .post('/api/products')
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/products')
      .set('x-admin-key', ADMIN)
      .send(body)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/products')
      .set('x-admin-key', ADMIN)
      .send({ ...body, unitsPerPackage: 0 })
      .expect(400);
  });

  it('POST /api/products/import-spreadsheet exige admin e o campo file', async () => {
    await request(app.getHttpServer())
      .post('/api/products/import-spreadsheet')
      .attach('file', Buffer.from('A;B'), 'p.csv')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/products/import-spreadsheet')
      .set('x-admin-key', ADMIN)
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/products/import-spreadsheet')
      .set('x-admin-key', ADMIN)
      .attach('file', Buffer.from('CODIGO;NOME\n1;X'), 'p.csv')
      .expect(201);
    expect(service.importSpreadsheet).toHaveBeenCalledWith(
      'p.csv',
      expect.any(Buffer),
    );
  });

  it('PATCH e DELETE exigem id inteiro', async () => {
    await request(app.getHttpServer())
      .patch('/api/products/abc')
      .set('x-admin-key', ADMIN)
      .send({ name: 'X' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/products/7')
      .set('x-admin-key', ADMIN)
      .send({ name: 'X' })
      .expect(200);
    expect(service.update).toHaveBeenCalledWith(7, { name: 'X' });
    await request(app.getHttpServer())
      .delete('/api/products/7')
      .set('x-admin-key', ADMIN)
      .expect(204);
  });
});
