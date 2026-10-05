import { Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiError } from '../core/api-error';
import { ApiService } from '../core/api.service';
import { formatNumber, parseDecimal } from '../core/format';
import { SettingsService } from '../core/settings.service';
import { ToastService } from '../core/toast.service';
import type { Page, ProductDto, SpreadsheetImportReport } from '../core/types';
import { Dialog } from '../shared/dialog';
import { FileButton } from '../shared/file-button';
import { Pager } from '../shared/pager';

const PER_PAGE = 50;

interface Draft {
  ean: string;
  code: string;
  name: string;
  packaging: string;
  unitsPerPackage: string;
}

const EMPTY: Draft = { ean: '', code: '', name: '', packaging: 'CX', unitsPerPackage: '' };

/** Cadastro de embalagens de compra: o que alimenta a cascata de volumes. */
@Component({
  selector: 'app-products-page',
  imports: [FormsModule, Dialog, FileButton, Pager],
  templateUrl: './products-page.html',
})
export class ProductsPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);
  readonly settings = inject(SettingsService);

  readonly search = signal('');
  readonly orderBy = signal<'code' | 'ean' | 'name'>('name');
  readonly direction = signal<'asc' | 'desc'>('asc');
  readonly page = signal<Page<ProductDto>>({ items: [], total: 0, page: 1, perPage: PER_PAGE });
  readonly loading = signal(false);
  readonly busy = signal(false);

  readonly draft = signal<Draft>(EMPTY);
  readonly editingId = signal<number | null>(null);
  readonly formError = signal('');
  readonly report = signal<SpreadsheetImportReport | null>(null);

  readonly formDialog = viewChild.required<Dialog>('formDialog');
  readonly reportDialog = viewChild.required<Dialog>('reportDialog');

  readonly num = formatNumber;

  constructor() {
    void this.load();
  }

  async load(page = 1): Promise<void> {
    this.loading.set(true);
    try {
      this.page.set(
        await this.api.listProducts({
          search: this.search(),
          orderBy: this.orderBy(),
          direction: this.direction(),
          page,
          perPage: PER_PAGE,
        }),
      );
    } catch (e) {
      this.fail(e);
    } finally {
      this.loading.set(false);
    }
  }

  sortBy(column: 'code' | 'ean' | 'name'): void {
    if (this.orderBy() === column) {
      this.direction.set(this.direction() === 'asc' ? 'desc' : 'asc');
    } else {
      this.orderBy.set(column);
      this.direction.set('asc');
    }
    void this.load(1);
  }

  sortMark(column: string): string {
    return this.orderBy() === column ? (this.direction() === 'desc' ? ' ↓' : ' ↑') : '';
  }

  setDraft<K extends keyof Draft>(key: K, value: Draft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  openNew(): void {
    this.editingId.set(null);
    this.draft.set(EMPTY);
    this.formError.set('');
    this.formDialog().open();
  }

  openEdit(p: ProductDto): void {
    this.editingId.set(p.id);
    this.draft.set({
      ean: p.ean ?? '',
      code: p.code ?? '',
      name: p.name,
      packaging: p.packaging,
      unitsPerPackage: String(p.unitsPerPackage).replace('.', ','),
    });
    this.formError.set('');
    this.formDialog().open();
  }

  async save(): Promise<void> {
    const d = this.draft();
    const units = parseDecimal(d.unitsPerPackage);
    if (!d.name.trim() || !d.packaging.trim() || !(units > 0)) {
      this.formError.set('Informe nome, embalagem e uma quantidade por embalagem maior que zero.');
      return;
    }
    const input = {
      ean: d.ean || undefined,
      code: d.code || undefined,
      name: d.name,
      packaging: d.packaging,
      unitsPerPackage: units,
    };
    this.busy.set(true);
    this.formError.set('');
    try {
      const id = this.editingId();
      if (id === null) {
        await this.api.createProduct(input);
        this.toasts.ok('Embalagem cadastrada');
      } else {
        await this.api.updateProduct(id, input);
        this.toasts.ok('Embalagem atualizada');
      }
      this.formDialog().close();
      await this.load(this.page().page);
    } catch (e) {
      this.formError.set(e instanceof ApiError ? e.message : 'Falha ao salvar');
    } finally {
      this.busy.set(false);
    }
  }

  async remove(p: ProductDto): Promise<void> {
    if (
      !confirm(`Remover a embalagem ${p.packaging}/${p.unitsPerPackage} de "${p.name}"? Notas já calculadas não mudam.`)
    ) {
      return;
    }
    try {
      await this.api.removeProduct(p.id);
      this.toasts.ok('Embalagem removida');
      await this.load(this.page().page);
    } catch (e) {
      this.fail(e);
    }
  }

  async importSpreadsheet(files: File[]): Promise<void> {
    this.busy.set(true);
    try {
      this.report.set(await this.api.importProducts(files[0]));
      this.reportDialog().open();
      await this.load(1);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  columnsOf(report: SpreadsheetImportReport): string {
    return Object.entries(report.columns)
      .map(([role, header]) => `${role} ← ${header}`)
      .join(' · ');
  }

  private fail(e: unknown): void {
    this.toasts.error(e instanceof ApiError ? e.message : 'Falha ao falar com a API');
  }
}
