import type { GroupedByStore } from '../domain/grouping';
import type { UnloadingMethod } from '../domain/unloading';
import type { Warning } from '../invoices/invoice.types';

export const MAX_KEYS = 500;

export interface ComputeRequest {
  accessKeys: string[];
  method: UnloadingMethod;
  unitPrice: number;
}

export interface UnloadingResult extends GroupedByStore {
  parameters: {
    method: UnloadingMethod;
    unitPrice: number;
    generatedAt: string;
    generatedBy: string;
  };
  warnings: Warning[];
}
