import { TestBed } from '@angular/core/testing';

import { ApiService, query } from './api.service';
import { SettingsService } from './settings.service';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('ApiService', () => {
  let api: ApiService;
  let settings: SettingsService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({});
    api = TestBed.inject(ApiService);
    settings = TestBed.inject(SettingsService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('manda operador e chave de administração nos headers e monta a query', async () => {
    settings.setOperator('doca-01');
    settings.setAdminKey('segredo');
    fetchMock.mockResolvedValueOnce(json({ items: [], total: 0 }));
    await api.listStores('centro');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/stores?search=centro');
    expect(init.headers).toMatchObject({ 'x-operator': 'doca-01', 'x-admin-key': 'segredo' });
  });

  it('traduz erro da API em ApiError com status, mensagem e campo', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'CNPJ inválido', field: 'cnpj' }, 400));
    await expect(api.saveStore('1', 'X')).rejects.toMatchObject({
      status: 400,
      message: 'CNPJ inválido',
      field: 'cnpj',
    });
  });

  it('lista de mensagens do ValidationPipe vira uma frase; 403 sem corpo orienta sobre a chave', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: ['a', 'b'] }, 400));
    await expect(api.listStores()).rejects.toMatchObject({ message: 'a; b' });
    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(api.removeStore('1')).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining('administração'),
    });
  });

  it('204 resolve sem corpo', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.discardInvoice('k')).resolves.toBeUndefined();
  });

  it('upload vai como multipart no campo certo, sem content-type manual', async () => {
    fetchMock.mockResolvedValueOnce(json({ results: [], imported: 1, reconciled: 0, updated: 0, errors: 0 }));
    await api.importXml([new File(['<x/>'], 'a.xml'), new File(['<y/>'], 'b.xml')]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/invoices/import-xml');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).getAll('files')).toHaveLength(2);
    expect(init.headers).not.toHaveProperty('content-type');
  });

  it('exportação lê o nome do arquivo do content-disposition', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('xlsx-bytes', {
        status: 201,
        headers: { 'content-disposition': 'attachment; filename="descarga_20260724_153005.xlsx"' },
      }),
    );
    const r = await api.exportUnloading({ accessKeys: ['k'], method: 'volume', unitPrice: 2 });
    expect(r.fileName).toBe('descarga_20260724_153005.xlsx');
    expect(r.blob.size).toBe(10);
  });

  it('query omite vazios, nulos e falsos', () => {
    expect(query({ a: 'x', b: '', c: undefined, d: false, e: true, f: 0, g: null })).toBe('?a=x&e=true&f=0');
    expect(query({})).toBe('');
  });
});
