import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] }).compileComponents();
  });

  it('renderiza a marca e a navegação', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.name')?.textContent).toContain('Descarga CD');
    expect([...el.querySelectorAll('nav a')].map((a) => a.textContent?.trim())).toEqual(['Notas', 'Lojas', 'Produtos']);
  });

  it('sem chave de administração, a sessão aparece como leitura', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.who .badge')?.textContent).toContain('leitura');
  });

  it('salvar configurações grava operador e chave no navegador', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const app = fixture.componentInstance;
    app.openSettings();
    app.operatorDraft.set('doca-01');
    app.adminKeyDraft.set('segredo');
    app.saveSettings();
    expect(localStorage.getItem('dock.operator')).toBe('doca-01');
    expect(app.settings.isAdmin).toBe(true);
  });
});
