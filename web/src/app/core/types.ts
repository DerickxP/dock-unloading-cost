/** Contrato da API (api/src), espelhado no front. */

export interface Warning {
  code: string;
  message: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
}

export type InvoiceSource = 'manual' | 'upload' | 'ingestion';
export type InvoiceStatus = 'pending' | 'confirmed' | 'reconciled' | 'discarded';

export interface InvoiceSummary {
  accessKey: string;
  number: string;
  series: string;
  issueDate: string;
  issuerCnpj: string;
  issuerName: string;
  recipientCnpj: string;
  recipientName: string;
  storeLabel: string;
  storeRegistered: boolean;
  volumes: number;
  itemVolumes: number;
  carrierVolumes: number;
  grossWeight: number;
  itemsWeight: number;
  unloadWeight: number;
  species: string;
  totalValue: number;
  volumeMismatch: boolean;
  source: InvoiceSource | string;
  status: InvoiceStatus | string;
  note: string | null;
}

export interface InvoiceItem {
  seq: number;
  ean: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  value: number;
  volumes: number | null;
  packagingUsed: string | null;
  status: string | null;
}

export interface InvoiceDetail extends InvoiceSummary {
  netWeight: number;
  productsValue: number;
  items: InvoiceItem[];
}

export interface InvoiceFilters {
  from?: string;
  to?: string;
  recipientCnpj?: string;
  issuerCnpj?: string;
  number?: string;
  source?: string;
  status?: string;
  mismatchOnly?: boolean;
  orderBy?: string;
  direction?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
}

export interface ManualInvoiceInput {
  accessKey: string;
  issueDate: string;
  recipientCnpj: string;
  recipientName?: string;
  issuerName: string;
  issuerCnpj?: string;
  volumes?: number;
  grossWeight?: number;
  species?: string;
  totalValue?: number;
  note?: string;
}

export interface DecodedKey {
  valid: boolean;
  key: string;
  uf?: string;
  year?: number;
  month?: number;
  issuerCnpj?: string;
  issuerCnpjFormatted?: string;
  series?: number;
  number?: number;
  formatted?: string;
}

export type ImportStatus = 'imported' | 'reconciled' | 'updated' | 'error';

export interface FileResult {
  file: string;
  status: ImportStatus;
  accessKey?: string;
  number?: string;
  reason?: string;
  warnings: Warning[];
}

export interface ImportReport {
  results: FileResult[];
  imported: number;
  reconciled: number;
  updated: number;
  errors: number;
}

export interface StoreDto {
  id: number;
  cnpj: string;
  cnpjFormatted: string;
  nickname: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveStoreResult {
  store: StoreDto;
  created: boolean;
  duplicateNickname: boolean;
}

export interface UnregisteredStore {
  cnpj: string;
  cnpjFormatted: string;
  name: string;
  invoices: number;
  lastIssueDate: string;
}

export interface ProductDto {
  id: number;
  ean: string | null;
  code: string | null;
  name: string;
  packaging: string;
  unitsPerPackage: number;
}

export interface ProductInput {
  ean?: string;
  code?: string;
  name: string;
  packaging: string;
  unitsPerPackage: number;
}

export interface SpreadsheetImportReport {
  file: string;
  columns: Record<string, string>;
  rows: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

export type UnloadingMethod = 'volume' | 'weight';

export interface StoreGroup {
  cnpj: string;
  label: string;
  legalName: string;
  registered: boolean;
  invoices: number;
  volumes: number;
  weight: number;
  totalValue: number;
  unloading: number;
  mismatchedInvoices: number;
  uncatalogedItems: string[];
}

export interface UnloadingResult {
  method: UnloadingMethod;
  unitPrice: number;
  stores: StoreGroup[];
  totals: { invoices: number; volumes: number; weight: number; totalValue: number; total: number };
  parameters: { method: UnloadingMethod; unitPrice: number; generatedAt: string; generatedBy: string };
  warnings: Warning[];
}

export interface ComputeRequest {
  accessKeys: string[];
  method: UnloadingMethod;
  unitPrice: number;
}
