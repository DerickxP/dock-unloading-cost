import { TestBed } from '@angular/core/testing';

import { ApiService } from '../core/api.service';
import type { InvoiceSummary, Page } from '../core/types';
import { InvoicesPage } from './invoices-page';

const row = (p: Partial<InvoiceSummary>): InvoiceSummary => ({
  accessKey: 'k',
  number: '1',
  series: '1',
  issueDate: '2026-07-15',
  issuerCnpj: '3'.repeat(14),
  issuerName: 'FORNECEDOR',
  recipientCnpj: '1'.repeat(14),
  recipientName: 'LOJA',
  storeLabel: 'Loja Centro',
  storeRegistered: true,
  volumes: 10,
  itemVolumes: 10,
  carrierVolumes: 10,
  grossWeight: 100,
  itemsWeight: 0,
  unloadWeight: 100,
  species: 'CX',
  totalValue: 1000.1,
  volumeMismatch: false,
  source: 'upload',
  status: 'confirmed',
  note: null,
  ...p,
});

describe('InvoicesPage', () => {
  const api = { listInvoices: vi.fn(), computeUnloading: vi.fn(), getInvoice: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const page: Page<InvoiceSummary> = {
      items: [
        row({ accessKey: 'A', number: '1001' }),
        row({
          accessKey: 'B',
          number: '1002',
          volumes: 12,
          itemVolumes: 10,
          volumeMismatch: true,
          storeRegistered: false,
          storeLabel: 'LOJA NOVA LTDA',
        }),
      ],
      total: 2,
      page: 1,
      perPage: 50,
    };
    api.listInvoices.mockResolvedValue(page);
    await TestBed.configureTestingModule({
      imports: [InvoicesPage],
      providers: [{ provide: ApiService, useValue: api }],
    }).compileComponents();
  });

  it('lista as notas com rótulo da loja, alerta de divergência e badge de sem apelido', async () => {
    const fixture = TestBed.createComponent(InvoicesPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Loja Centro');
    expect(rows[0].textContent).toContain('R$ 1.000,10');
    expect(rows[1].textContent).toContain('12 ⚠');
    expect(rows[1].textContent).toContain('sem apelido');
  });

  it('seleciona notas e calcula com o método e o preço informados (vírgula aceita)', async () => {
    api.computeUnloading.mockResolvedValue({
      method: 'weight',
      unitPrice: 0.12,
      stores: [],
      totals: { invoices: 2, volumes: 22, weight: 200, totalValue: 2000.2, total: 24 },
      parameters: { method: 'weight', unitPrice: 0.12, generatedAt: '2026-07-24T18:30:00.000Z', generatedBy: '' },
      warnings: [],
    });
    const fixture = TestBed.createComponent(InvoicesPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.canCompute()).toBe(false);
    page.toggle('A');
    page.toggle('B');
    page.method.set('weight');
    page.unitPrice.set('0,12');
    expect(page.canCompute()).toBe(true);

    await page.compute();
    expect(api.computeUnloading).toHaveBeenCalledWith({ accessKeys: ['A', 'B'], method: 'weight', unitPrice: 0.12 });
    expect(page.result()?.totals.total).toBe(24);
  });

  it('ordenar pela mesma coluna alterna a direção e recarrega', async () => {
    const fixture = TestBed.createComponent(InvoicesPage);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.sortBy('number');
    expect(api.listInvoices).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderBy: 'number', direction: 'asc', page: 1 }),
    );
    page.sortBy('number');
    expect(api.listInvoices).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderBy: 'number', direction: 'desc' }),
    );
  });

  it('selecionar a página inteira e limpar', async () => {
    const fixture = TestBed.createComponent(InvoicesPage);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    page.toggleAllOnPage();
    expect(page.selectedCount()).toBe(2);
    expect(page.allOnPageSelected()).toBe(true);
    page.clearSelection();
    expect(page.selectedCount()).toBe(0);
  });
});
