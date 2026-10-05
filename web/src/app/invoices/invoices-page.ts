import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiError } from '../core/api-error';
import { ApiService } from '../core/api.service';
import {
  SOURCE_LABEL,
  STATUS_LABEL,
  formatBrl,
  formatCnpj,
  formatDateBr,
  formatNumber,
  parseDecimal,
  volumeLabel,
} from '../core/format';
import { SettingsService } from '../core/settings.service';
import { ToastService } from '../core/toast.service';
import type {
  ImportReport,
  InvoiceDetail,
  InvoiceFilters,
  InvoiceSummary,
  Page,
  UnloadingMethod,
  UnloadingResult,
} from '../core/types';
import { Dialog } from '../shared/dialog';
import { FileButton } from '../shared/file-button';
import { ImportReportView } from '../shared/import-report';
import { Pager } from '../shared/pager';
import { InvoiceDetailView } from './invoice-detail';
import { ManualInvoiceForm } from './manual-invoice-form';
import { UnloadingResultView } from './unloading-result';

const PER_PAGE = 50;

/** Tela principal: notas, filtros, seleção e fechamento da descarga. */
@Component({
  selector: 'app-invoices-page',
  imports: [
    FormsModule,
    Dialog,
    FileButton,
    ImportReportView,
    Pager,
    InvoiceDetailView,
    ManualInvoiceForm,
    UnloadingResultView,
  ],
  templateUrl: './invoices-page.html',
  styleUrl: './invoices-page.css',
})
export class InvoicesPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);
  readonly settings = inject(SettingsService);

  readonly filters = signal<InvoiceFilters>({});
  readonly page = signal<Page<InvoiceSummary>>({ items: [], total: 0, page: 1, perPage: PER_PAGE });
  readonly loading = signal(false);
  readonly selected = signal<Set<string>>(new Set());
  readonly method = signal<UnloadingMethod>('volume');
  readonly unitPrice = signal('2,50');
  readonly busy = signal(false);

  readonly result = signal<UnloadingResult | null>(null);
  readonly report = signal<ImportReport | null>(null);
  readonly detail = signal<InvoiceDetail | null>(null);
  readonly editing = signal<InvoiceDetail | null>(null);

  readonly resultDialog = viewChild.required<Dialog>('resultDialog');
  readonly reportDialog = viewChild.required<Dialog>('reportDialog');
  readonly detailDialog = viewChild.required<Dialog>('detailDialog');
  readonly manualDialog = viewChild.required<Dialog>('manualDialog');

  readonly selectedCount = computed(() => this.selected().size);
  readonly allOnPageSelected = computed(
    () => this.page().items.length > 0 && this.page().items.every((i) => this.selected().has(i.accessKey)),
  );
  readonly priceValue = computed(() => parseDecimal(this.unitPrice()));
  readonly canCompute = computed(
    () => this.selectedCount() > 0 && Number.isFinite(this.priceValue()) && this.priceValue() > 0,
  );

  readonly brl = formatBrl;
  readonly num = formatNumber;
  readonly date = formatDateBr;
  readonly cnpj = formatCnpj;
  readonly vol = volumeLabel;
  readonly sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;
  readonly statusLabel = (s: string) => STATUS_LABEL[s] ?? s;

  constructor() {
    void this.load();
  }

  // ── carga e filtros ────────────────────────────────────────────────────────

  async load(page = 1): Promise<void> {
    this.loading.set(true);
    try {
      this.page.set(await this.api.listInvoices({ ...this.filters(), page, perPage: PER_PAGE }));
    } catch (e) {
      this.fail(e);
    } finally {
      this.loading.set(false);
    }
  }

  setFilter<K extends keyof InvoiceFilters>(key: K, value: InvoiceFilters[K]): void {
    this.filters.update((f) => ({ ...f, [key]: value === '' ? undefined : value }));
  }

  applyFilters(): void {
    void this.load(1);
  }

  clearFilters(): void {
    this.filters.set({});
    void this.load(1);
  }

  sortBy(column: string): void {
    const f = this.filters();
    const direction = f.orderBy === column && f.direction !== 'desc' ? 'desc' : 'asc';
    this.filters.set({ ...f, orderBy: column, direction });
    void this.load(1);
  }

  sortMark(column: string): string {
    const f = this.filters();
    return f.orderBy === column ? (f.direction === 'desc' ? ' ↓' : ' ↑') : '';
  }

  // ── seleção ────────────────────────────────────────────────────────────────

  isSelected(key: string): boolean {
    return this.selected().has(key);
  }

  toggle(key: string): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  toggleAllOnPage(): void {
    const all = this.allOnPageSelected();
    this.selected.update((s) => {
      const next = new Set(s);
      for (const i of this.page().items) {
        if (all) {
          next.delete(i.accessKey);
        } else {
          next.add(i.accessKey);
        }
      }
      return next;
    });
  }

  clearSelection(): void {
    this.selected.set(new Set());
  }

  // ── fechamento ─────────────────────────────────────────────────────────────

  private computeRequest() {
    return { accessKeys: [...this.selected()], method: this.method(), unitPrice: this.priceValue() };
  }

  async compute(): Promise<void> {
    this.busy.set(true);
    try {
      this.result.set(await this.api.computeUnloading(this.computeRequest()));
      this.resultDialog().open();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  async exportXlsx(): Promise<void> {
    this.busy.set(true);
    try {
      const { blob, fileName } = await this.api.exportUnloading(this.computeRequest());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      this.toasts.ok(`Planilha ${fileName} gerada`);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  // ── importações ────────────────────────────────────────────────────────────

  async importXml(files: File[]): Promise<void> {
    await this.runImport(() => this.api.importXml(files));
  }

  async importPdf(files: File[]): Promise<void> {
    await this.runImport(() => this.api.importPdf(files));
  }

  private async runImport(call: () => Promise<ImportReport>): Promise<void> {
    this.busy.set(true);
    try {
      this.report.set(await call());
      this.reportDialog().open();
      await this.load(this.page().page);
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy.set(false);
    }
  }

  // ── nota manual e detalhe ──────────────────────────────────────────────────

  newManual(): void {
    this.editing.set(null);
    this.manualDialog().open();
  }

  editManual(detail: InvoiceDetail): void {
    this.detailDialog().close();
    this.editing.set(detail);
    this.manualDialog().open();
  }

  async onManualSaved(): Promise<void> {
    this.manualDialog().close();
    await this.load(this.page().page);
  }

  async openDetail(row: InvoiceSummary): Promise<void> {
    try {
      this.detail.set(await this.api.getInvoice(row.accessKey));
      this.detailDialog().open();
    } catch (e) {
      this.fail(e);
    }
  }

  async discard(detail: InvoiceDetail): Promise<void> {
    if (!confirm(`Descartar a nota ${detail.number}? Ela sai da cobrança, mas fica no histórico.`)) {
      return;
    }
    try {
      await this.api.discardInvoice(detail.accessKey);
      this.detailDialog().close();
      this.selected.update((s) => {
        const next = new Set(s);
        next.delete(detail.accessKey);
        return next;
      });
      this.toasts.ok(`Nota ${detail.number} descartada`);
      await this.load(this.page().page);
    } catch (e) {
      this.fail(e);
    }
  }

  private fail(e: unknown): void {
    this.toasts.error(e instanceof ApiError ? e.message : 'Falha ao falar com a API');
  }
}
