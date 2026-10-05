/**
 * A nota fiscal como o domínio a enxerga: o que vem do XML/DANFE e o que o
 * recálculo de descarga acrescenta. Os campos calculados são opcionais porque a
 * nota pode estar "crua" (recém-ingerida) ou já recalculada.
 */
import type { ItemVolumeStatus } from './volumes';

export interface InvoiceItem {
  ean: string;
  /** Código do produto no fornecedor (cProd). */
  code: string;
  description: string;
  /** Unidade comercial (uCom). */
  unit: string;
  quantity: number;
  value: number;

  // Calculados pelo recálculo de descarga.
  volumes?: number;
  packagingUsed?: string;
  status?: ItemVolumeStatus;
}

export interface Invoice {
  accessKey: string;
  number: string;
  series: string;
  /** 'AAAA-MM-DD'. */
  issueDate: string;
  issuerCnpj: string;
  issuerName: string;
  recipientCnpj: string;
  recipientName: string;
  totalValue: number;
  productsValue: number;
  /** Espécie declarada no transporte (esp). */
  species: string;
  /** Volumes declarados pela transportadora (qVol). */
  carrierVolumes: number;
  /** Peso bruto do transporte (pesoB), em kg. */
  grossWeight: number;
  netWeight: number;
  items: InvoiceItem[];

  // Calculados pelo recálculo de descarga.
  /** Volumes considerados na descarga (transportadora ou soma dos itens). */
  volumes?: number;
  /** Soma dos volumes dos itens. */
  itemVolumes?: number;
  volumeMismatch?: boolean;
  /** Peso somado dos itens em massa, em kg. */
  itemsWeight?: number;
  /** Peso considerado na descarga (bruto ou dos itens). */
  unloadWeight?: number;
  /** Descrições dos itens sem cadastro. */
  uncatalogedItems?: string[];

  // Ciclo de vida na aplicação (de onde veio e em que situação está).
  /** 'manual' | 'upload' | 'ingestion' */
  source?: string;
  /** 'pending' | 'confirmed' | 'reconciled' | 'discarded' */
  status?: string;
  note?: string | null;
}
