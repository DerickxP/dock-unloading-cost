import { TestBed } from '@angular/core/testing';

import { ApiService } from '../core/api.service';
import { StoresPage } from './stores-page';

describe('StoresPage', () => {
  const api = {
    listStores: vi.fn().mockResolvedValue({
      items: [
        {
          id: 1,
          cnpj: '1'.repeat(14),
          cnpjFormatted: '11.111.111/1111-11',
          nickname: 'Centro',
          createdAt: '',
          updatedAt: '2026-07-01T12:00:00.000Z',
        },
      ],
      total: 1,
    }),
    unregisteredStores: vi.fn().mockResolvedValue([
      {
        cnpj: '2'.repeat(14),
        cnpjFormatted: '22.222.222/2222-22',
        name: 'LOJA NOVA LTDA',
        invoices: 3,
        lastIssueDate: '2026-07-10',
      },
    ]),
    saveStore: vi.fn(),
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [StoresPage],
      providers: [{ provide: ApiService, useValue: api }],
    }).compileComponents();
  });

  it('lista lojas e destinatários sem apelido; "cadastrar" preenche o formulário', async () => {
    const fixture = TestBed.createComponent(StoresPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Centro');
    expect(el.textContent).toContain('LOJA NOVA LTDA');

    const cadastrar = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'cadastrar')!;
    cadastrar.click();
    expect(fixture.componentInstance.form().cnpj).toBe('22.222.222/2222-22');
  });

  it('sem chave de administração, salvar e remover ficam desabilitados', async () => {
    const fixture = TestBed.createComponent(StoresPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    expect(buttons.find((b) => b.textContent?.trim() === 'Salvar')?.disabled).toBe(true);
    expect(buttons.find((b) => b.textContent?.trim() === 'remover')?.disabled).toBe(true);
  });
});
