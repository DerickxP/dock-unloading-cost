/** Avisos que o recálculo de uma nota produz; usados pela importação de XML e de PDF. */
import type { RecalculatedInvoice } from '../domain/unloading';
import type { Warning } from './invoice.types';

export function recalculationWarnings(invoice: RecalculatedInvoice): Warning[] {
  const warnings: Warning[] = [];
  if (invoice.volumeMismatch) {
    warnings.push({
      code: 'VOLUME_MISMATCH',
      message:
        `Transportadora declarou ${invoice.carrierVolumes} volume(s) e os itens somam ` +
        `${invoice.itemVolumes}; a descarga considera ${invoice.volumes}.`,
    });
  }
  if (invoice.uncatalogedItems.length) {
    warnings.push({
      code: 'UNCATALOGED_ITEMS',
      message:
        `${invoice.uncatalogedItems.length} item(ns) sem cadastro contaram pela quantidade bruta: ` +
        invoice.uncatalogedItems.slice(0, 5).join('; ') +
        (invoice.uncatalogedItems.length > 5 ? '…' : ''),
    });
  }
  if (invoice.volumes === 0 && invoice.unloadWeight === 0) {
    warnings.push({
      code: 'NOT_CHARGEABLE',
      message:
        'A nota não tem volumes nem peso; não entra na cobrança até ser corrigida.',
    });
  }
  return warnings;
}
