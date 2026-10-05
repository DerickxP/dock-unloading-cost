import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { StoresController } from '../../src/stores/stores.controller';
import { StoresService } from '../../src/stores/stores.service';
import { httpApp } from '../support/http-app';

const ADMIN = 'segredo-de-teste';

describe('StoresController', () => {
  let app: INestApplication;
  const service = {
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    unregistered: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockResolvedValue({
      store: { cnpj: '1' },
      created: true,
      duplicateNickname: false,
    }),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = ADMIN;
    app = await httpApp(
      [StoresController],
      [{ provide: StoresService, useValue: service }],
    );
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('GET /api/stores passa a busca; rotas sem prefixo não existem', async () => {
    await request(app.getHttpServer())
      .get('/api/stores?search=centro')
      .expect(200);
    expect(service.list).toHaveBeenCalledWith('centro');
    await request(app.getHttpServer()).get('/stores').expect(404);
  });

  it('GET /api/stores/unregistered', async () => {
    await request(app.getHttpServer())
      .get('/api/stores/unregistered')
      .expect(200, []);
  });

  it('POST /api/stores exige a chave de administração', async () => {
    const body = { cnpj: '1', nickname: 'Centro' };
    await request(app.getHttpServer())
      .post('/api/stores')
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/stores')
      .set('x-admin-key', 'errada')
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/stores')
      .set('x-admin-key', ADMIN)
      .send(body)
      .expect(201);
    expect(service.save).toHaveBeenCalledWith('1', 'Centro');
  });

  it('POST /api/stores recusa campo desconhecido e tipo errado com 400', async () => {
    await request(app.getHttpServer())
      .post('/api/stores')
      .set('x-admin-key', ADMIN)
      .send({ cnpj: '1', nickname: 'X', extra: true })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/stores')
      .set('x-admin-key', ADMIN)
      .send({ cnpj: 1, nickname: 'X' })
      .expect(400);
    expect(service.save).not.toHaveBeenCalled();
  });

  it('DELETE /api/stores/:cnpj devolve 204', async () => {
    await request(app.getHttpServer())
      .delete('/api/stores/123')
      .set('x-admin-key', ADMIN)
      .expect(204);
    expect(service.remove).toHaveBeenCalledWith('123');
  });

  it('sem ADMIN_API_KEY no ambiente, administração responde 403 com explicação', async () => {
    const saved = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;
    const res = await request(app.getHttpServer())
      .delete('/api/stores/1')
      .set('x-admin-key', ADMIN)
      .expect(403);
    expect(res.body.message).toMatch(/ADMIN_API_KEY/);
    process.env.ADMIN_API_KEY = saved;
  });
});
