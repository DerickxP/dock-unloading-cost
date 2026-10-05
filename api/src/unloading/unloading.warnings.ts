/**
 * Avisos do fechamento: o que compromete o valor cobrado. Função pura,
 * compartilhada pelo serviço HTTP e pela demonstração.
 */
import { formatCnpj } from '../domain/cnpj';
import type { GroupedByStore } from '../domain/grouping';
import type { Invoice } from '../domain/invoice';
import {
  SOURCE_MANUAL,
  STATUS_PENDING,
  Warning,
} from '../invoices/invoice.types';

export function unloadingWarnings(
  grouped: GroupedByStore,
  invoices: Invoice[],
): Warning[] {
  const warnings: Warning[] = [];

  const unregistered = grouped.stores.filter((s) => !s.registered && s.cnpj);
  if (unregistered.length) {
    warnings.push({
      code: 'UNREGISTERED_STORES',
      message:
        `${unregistered.length} destinatário(s) sem apelido cadastrado: ` +
        unregistered.map((s) => formatCnpj(s.cnpj)).join(', ') +
        '.',
    });
  }

  const mismatched = grouped.stores.reduce(
    (sum, s) => sum + s.mismatchedInvoices,
    0,
  );
  if (mismatched > 0) {
    warnings.push({
      code: 'MISMATCHED_INVOICES',
      message: `${mismatched} nota(s) com volumes da transportadora diferentes da soma dos itens; confira antes de cobrar.`,
    });
  }

  const uncataloged = new Set(
    grouped.stores.flatMap((s) => s.uncatalogedItems),
  );
  if (uncataloged.size) {
    warnings.push({
      code: 'UNCATALOGED_ITEMS',
      message: `${uncataloged.size} produto(s) fora do cadastro; os volumes desses itens contaram pela quantidade bruta.`,
    });
  }

  const pending = invoices.filter(
    (i) => i.source === SOURCE_MANUAL && i.status === STATUS_PENDING,
  ).length;
  if (pending) {
    warnings.push({
      code: 'PENDING_MANUAL_INVOICES',
      message: `${pending} nota(s) digitada(s) do DANFE ainda sem o XML; os números podem mudar na reconciliação.`,
    });
  }

  return warnings;
}
