import { Component, input } from '@angular/core';

import type { ImportReport } from '../core/types';

const STATUS: Record<string, { label: string; cls: string }> = {
  imported: { label: 'importada', cls: 'ok' },
  reconciled: { label: 'reconciliada', cls: 'info' },
  updated: { label: 'atualizada', cls: '' },
  error: { label: 'erro', cls: 'danger' },
};

/** Relato de uma importação (XML ou PDF): resumo e uma linha por arquivo. */
@Component({
  selector: 'app-import-report',
  template: `
    @let r = report();
    <div class="kpis">
      <div class="kpi">
        <div class="label">Importadas</div>
        <div class="value">{{ r.imported }}</div>
      </div>
      <div class="kpi">
        <div class="label">Reconciliadas</div>
        <div class="value">{{ r.reconciled }}</div>
      </div>
      <div class="kpi">
        <div class="label">Atualizadas</div>
        <div class="value">{{ r.updated }}</div>
      </div>
      <div class="kpi">
        <div class="label">Erros</div>
        <div class="value">{{ r.errors }}</div>
      </div>
    </div>
    <table class="data" style="margin-top: 0.8rem">
      <thead>
        <tr>
          <th>Arquivo</th>
          <th>Situação</th>
          <th>Nº</th>
          <th>Avisos / motivo</th>
        </tr>
      </thead>
      <tbody>
        @for (x of r.results; track $index) {
          <tr>
            <td class="mono">{{ x.file }}</td>
            <td>
              <span class="badge" [class]="'badge ' + status(x.status).cls">{{ status(x.status).label }}</span>
            </td>
            <td class="mono">{{ x.number ?? '' }}</td>
            <td>
              @if (x.reason) {
                <div class="muted">{{ x.reason }}</div>
              }
              @for (w of x.warnings; track $index) {
                <div>⚠ {{ w.message }}</div>
              }
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class ImportReportView {
  readonly report = input.required<ImportReport>();

  status(s: string): { label: string; cls: string } {
    return STATUS[s] ?? { label: s, cls: '' };
  }
}
