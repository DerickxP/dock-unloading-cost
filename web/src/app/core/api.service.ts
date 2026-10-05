import { Injectable, inject } from '@angular/core';

import { ApiError } from './api-error';
import { SettingsService } from './settings.service';
import type {
  ComputeRequest,
  DecodedKey,
  ImportReport,
  InvoiceDetail,
  InvoiceFilters,
  InvoiceSummary,
  ManualInvoiceInput,
  Page,
  ProductDto,
  ProductInput,
  SaveStoreResult,
  SpreadsheetImportReport,
  StoreDto,
  UnloadingResult,
  UnregisteredStore,
  Warning,
} from './types';

export const API_BASE = '/api';

/** Cliente HTTP da API. Os headers de identidade saem das configurações. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly settings = inject(SettingsService);

  // ── notas ──────────────────────────────────────────────────────────────────

  listInvoices(filters: InvoiceFilters): Promise<Page<InvoiceSummary>> {
    return this.request('GET', `/invoices${query(filters)}`);
  }

  getInvoice(accessKey: string): Promise<InvoiceDetail> {
    return this.request('GET', `/invoices/${accessKey}`);
  }

  decodeKey(key: string): Promise<DecodedKey> {
    return this.request('GET', `/invoices/decode-key${query({ key })}`);
  }

  createManualInvoice(input: ManualInvoiceInput): Promise<{ invoice: InvoiceSummary; warnings: Warning[] }> {
    return this.request('POST', '/invoices/manual', input);
  }

  updateManualInvoice(accessKey: string, input: Partial<ManualInvoiceInput>): Promise<InvoiceSummary> {
    return this.request('PATCH', `/invoices/${accessKey}`, input);
  }

  discardInvoice(accessKey: string): Promise<void> {
    return this.request('DELETE', `/invoices/${accessKey}`);
  }

  importXml(files: File[]): Promise<ImportReport> {
    return this.upload('/invoices/import-xml', 'files', files);
  }

  importPdf(files: File[]): Promise<ImportReport> {
    return this.upload('/invoices/import-pdf', 'files', files);
  }

  // ── lojas ──────────────────────────────────────────────────────────────────

  listStores(search?: string): Promise<{ items: StoreDto[]; total: number }> {
    return this.request('GET', `/stores${query({ search })}`);
  }

  unregisteredStores(): Promise<UnregisteredStore[]> {
    return this.request('GET', '/stores/unregistered');
  }

  saveStore(cnpj: string, nickname: string): Promise<SaveStoreResult> {
    return this.request('POST', '/stores', { cnpj, nickname });
  }

  removeStore(cnpj: string): Promise<void> {
    return this.request('DELETE', `/stores/${cnpj}`);
  }

  // ── produtos ───────────────────────────────────────────────────────────────

  listProducts(params: {
    search?: string;
    orderBy?: string;
    direction?: 'asc' | 'desc';
    page?: number;
    perPage?: number;
  }): Promise<Page<ProductDto>> {
    return this.request('GET', `/products${query(params)}`);
  }

  createProduct(input: ProductInput): Promise<ProductDto> {
    return this.request('POST', '/products', input);
  }

  updateProduct(id: number, input: Partial<ProductInput>): Promise<ProductDto> {
    return this.request('PATCH', `/products/${id}`, input);
  }

  removeProduct(id: number): Promise<void> {
    return this.request('DELETE', `/products/${id}`);
  }

  importProducts(file: File): Promise<SpreadsheetImportReport> {
    return this.upload('/products/import-spreadsheet', 'file', [file]);
  }

  // ── descarga ───────────────────────────────────────────────────────────────

  computeUnloading(request: ComputeRequest): Promise<UnloadingResult> {
    return this.request('POST', '/unloading/compute', request);
  }

  async exportUnloading(request: ComputeRequest): Promise<{ blob: Blob; fileName: string }> {
    const response = await fetch(`${API_BASE}/unloading/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.identityHeaders() },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw await ApiError.fromResponse(response);
    }
    const disposition = response.headers.get('content-disposition') ?? '';
    const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'descarga.xlsx';
    return { blob: await response.blob(), fileName };
  }

  // ── base ───────────────────────────────────────────────────────────────────

  private identityHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.settings.operator()) {
      headers['x-operator'] = this.settings.operator();
    }
    if (this.settings.adminKey()) {
      headers['x-admin-key'] = this.settings.adminKey();
    }
    return headers;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...this.identityHeaders(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw await ApiError.fromResponse(response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private async upload<T>(path: string, field: string, files: File[]): Promise<T> {
    const form = new FormData();
    for (const f of files) {
      form.append(field, f, f.name);
    }
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: this.identityHeaders(),
      body: form,
    });
    if (!response.ok) {
      throw await ApiError.fromResponse(response);
    }
    return (await response.json()) as T;
  }
}

/** Query string sem os valores vazios. */
export function query(params: object): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) {
      q.set(k, String(v as string | number | boolean));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}
