import { Component, input } from '@angular/core';

import { formatBrl, formatCnpj, formatDateTimeBr, formatNumber } from '../core/format';
import type { UnloadingResult } from '../core/types';
import { Warnings } from '../shared/warnings';

/** Resultado do fechamento: uma linha por loja, TOTAL e avisos. Os mesmos números da planilha. */
@Component({
  selector: 'app-unloading-result',
  imports: [Warnings],
  template: `
    @let r = result();
    <p class="muted">
      Cobrança por <strong>{{ r.method === 'weight' ? 'peso' : 'volume' }}</strong> a
      <strong>{{ brl(r.unitPrice) }}</strong> por {{ r.method === 'weight' ? 'kg' : 'volume' }} · gerado em
      {{ when(r.parameters.generatedAt) }}
      @if (r.parameters.generatedBy) {
        por {{ r.parameters.generatedBy }}
      }
    </p>
    <div class="kpis">
      <div class="kpi">
        <div class="label">Notas</div>
        <div class="value">{{ r.totals.invoices }}</div>
      </div>
      <div class="kpi">
        <div class="label">Volumes</div>
        <div class="value">{{ num(r.totals.volumes, 0) }}</div>
      </div>
      <div class="kpi">
        <div class="label">Peso (kg)</div>
        <div class="value">{{ num(r.totals.weight, 3) }}</div>
      </div>
      <div class="kpi">
        <div class="label">Descarga</div>
        <div class="value">{{ brl(r.totals.total) }}</div>
      </div>
    </div>
    <table class="data" style="margin-top: 0.8rem">
      <thead>
        <tr>
          <th>Loja</th>
          <th>CNPJ</th>
          <th class="num">Notas</th>
          <th class="num">Volumes</th>
          <th class="num">Peso (kg)</th>
          <th class="num">Descarga</th>
          <th class="num">Valor NFs</th>
          <th class="num">Divergentes</th>
        </tr>
      </thead>
      <tbody>
        @for (s of r.stores; track s.cnpj) {
          <tr>
            <td>
              {{ s.label }}
              @if (!s.registered) {
                <span class="badge warn">sem apelido</span>
              }
            </td>
            <td class="mono">{{ cnpj(s.cnpj) }}</td>
            <td class="num">{{ s.invoices }}</td>
            <td class="num">{{ num(s.volumes, 0) }}</td>
            <td class="num">{{ num(s.weight, 3) }}</td>
            <td class="num">
              <strong>{{ brl(s.unloading) }}</strong>
            </td>
            <td class="num">{{ brl(s.totalValue) }}</td>
            <td class="num">{{ s.mismatchedInvoices || '' }}</td>
          </tr>
        }
        <tr class="total">
          <td colspan="2">TOTAL</td>
          <td class="num">{{ r.totals.invoices }}</td>
          <td class="num">{{ num(r.totals.volumes, 0) }}</td>
          <td class="num">{{ num(r.totals.weight, 3) }}</td>
          <td class="num">{{ brl(r.totals.total) }}</td>
          <td class="num">{{ brl(r.totals.totalValue) }}</td>
          <td></td>
        </tr>
      </tbody>
    </table>
    <app-warnings [warnings]="r.warnings" />
  `,
})
export class UnloadingResultView {
  readonly result = input.required<UnloadingResult>();
  readonly brl = formatBrl;
  readonly num = formatNumber;
  readonly cnpj = formatCnpj;
  readonly when = formatDateTimeBr;
}
