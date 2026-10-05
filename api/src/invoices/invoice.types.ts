/** Vocabulário do ciclo de vida da nota e contratos de saída da API. */

export const SOURCE_MANUAL = 'manual';
export const SOURCE_UPLOAD = 'upload';
export const SOURCE_INGESTION = 'ingestion';
export const SOURCES = [
  SOURCE_MANUAL,
  SOURCE_UPLOAD,
  SOURCE_INGESTION,
] as const;

export const STATUS_PENDING = 'pending';
export const STATUS_CONFIRMED = 'confirmed';
export const STATUS_RECONCILED = 'reconciled';
export const STATUS_DISCARDED = 'discarded';
export const STATUSES = [
  STATUS_PENDING,
  STATUS_CONFIRMED,
  STATUS_RECONCILED,
  STATUS_DISCARDED,
] as const;

export interface Warning {
  code: string;
  message: string;
}

/** Linha de `invoice_items` como o Prisma devolve (campos opcionais para selects parciais). */
export interface InvoiceItemRow {
  seq?: number;
  ean?: string | null;
  code?: string | null;
  description?: string | null;
  unit?: string | null;
  quantity?: number | null;
  value?: number | null;
  volumes?: number | null;
  packagingUsed?: string | null;
  status?: string | null;
}

/** Linha de `invoices` como o Prisma devolve. */
export interface InvoiceRow {
  accessKey: string;
  number: string;
  series?: string | null;
  issueDate: Date | null;
  issuerCnpj: string;
  issuerName: string;
  recipientCnpj: string;
  recipientName: string;
  totalValue?: number | null;
  productsValue?: number | null;
  carrierVolumes?: number | null;
  species?: string | null;
  grossWeight?: number | null;
  netWeight?: number | null;
  volumes?: number | null;
  itemVolumes?: number | null;
  itemsWeight?: number | null;
  volumeMismatch?: boolean | null;
  source?: string | null;
  status?: string | null;
  note?: string | null;
  items?: InvoiceItemRow[];
}

export interface InvoiceSummary {
  accessKey: string;
  number: string;
  series: string;
  issueDate: string;
  issuerCnpj: string;
  issuerName: string;
  recipientCnpj: string;
  recipientName: string;
  /** Apelido da loja ou a razão social da nota. */
  storeLabel: string;
  storeRegistered: boolean;
  volumes: number;
  itemVolumes: number;
  carrierVolumes: number;
  grossWeight: number;
  itemsWeight: number;
  /** Peso que a descarga cobra: bruto, ou a soma dos itens quando é zero. */
  unloadWeight: number;
  species: string;
  totalValue: number;
  volumeMismatch: boolean;
  source: string;
  status: string;
  note: string | null;
}

export interface InvoiceItemDto {
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
  items: InvoiceItemDto[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
}
