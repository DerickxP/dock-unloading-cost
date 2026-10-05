import { Component, input } from '@angular/core';

import {
  SOURCE_LABEL,
  STATUS_LABEL,
  formatAccessKey,
  formatBrl,
  formatCnpj,
  formatDateBr,
  formatNumber,
} from '../core/format';
import type { InvoiceDetail } from '../core/types';

const ITEM_STATUS: Record<string, string> = {
  converted: 'convertido pelo cadastro',
  packaging: 'embalagem conta direto',
  direct: 'unidade conta direto',
  continuous: 'medida contínua (peso)',
  uncataloged: 'sem cadastro (bruto)',
};

/** Detalhe da nota: cabeçalho, snapshot do recálculo e a cascata item a item. */
@Component({
  selector: 'app-invoice-detail',
  template: `
    @let d = invoice();
    <div class="kpis">
      <div class="kpi">
        <div class="label">Nº / série</div>
        <div class="value">
          {{ d.number }}<span class="muted">/{{ d.series }}</span>
        </div>
      </div>
      <div class="kpi">
        <div class="label">Emissão</div>
        <div class="value">{{ date(d.issueDate) }}</div>
      </div>
      <div class="kpi">
        <div class="label">Volumes (descarga)</div>
        <div class="value">{{ d.volumes }}</div>
      </div>
      <div class="kpi">
        <div class="label">Peso p/ descarga</div>
        <div class="value">{{ num(d.unloadWeight, 3) }} <span class="muted">kg</span></div>
      </div>
      <div class="kpi">
        <div class="label">Valor da NF</div>
        <div class="value">{{ brl(d.totalValue) }}</div>
      </div>
    </div>

    <div class="grid">
      <div>
        <span class="muted">Fornecedor</span><br />{{ d.issuerName }}
        <span class="mono muted">{{ cnpj(d.issuerCnpj) }}</span>
      </div>
      <div>
        <span class="muted">Loja</span><br />{{ d.storeLabel }}
        @if (d.storeLabel !== d.recipientName) {
          <span class="muted">({{ d.recipientName }})</span>
        }
        <span class="mono muted">{{ cnpj(d.recipientCnpj) }}</span>
      </div>
      <div>
        <span class="muted">Chave de acesso</span><br /><span class="mono">{{ key(d.accessKey) }}</span>
      </div>
      <div>
        <span class="muted">Origem / situação</span><br />
        <span class="badge">{{ source(d.source) }}</span>
        <span
          class="badge"
          [class.warn]="d.status === 'pending'"
          [class.ok]="d.status === 'reconciled'"
          [class.danger]="d.status === 'discarded'"
          >{{ status(d.status) }}</span
        >
      </div>
      <div>
        <span class="muted">Transporte</span><br />{{ d.carrierVolumes }} vol · {{ d.species }} · bruto
        {{ num(d.grossWeight, 3) }} kg · líquido {{ num(d.netWeight, 3) }} kg
      </div>
      <div>
        <span class="muted">Itens</span><br />{{ d.itemVolumes }} vol · {{ num(d.itemsWeight, 3) }} kg em massa
        @if (d.volumeMismatch) {
          <span class="badge warn">divergente da transportadora</span>
        }
      </div>
    </div>

    @if (d.note) {
      <div class="alert">📝 {{ d.note }}</div>
    }

    @if (d.items.length) {
      <table class="data" style="margin-top: 0.8rem">
        <thead>
          <tr>
            <th>#</th>
            <th>Código</th>
            <th>Descrição</th>
            <th>Un.</th>
            <th class="num">Qtd</th>
            <th class="num">Valor</th>
            <th class="num">Volumes</th>
            <th>Embalagem</th>
            <th>Como contou</th>
          </tr>
        </thead>
        <tbody>
          @for (it of d.items; track it.seq) {
            <tr>
              <td class="muted">{{ it.seq }}</td>
              <td class="mono">{{ it.code }}</td>
              <td>{{ it.description }}</td>
              <td>{{ it.unit }}</td>
              <td class="num">{{ num(it.quantity, it.unit === 'KG' ? 3 : 0) }}</td>
              <td class="num">{{ brl(it.value) }}</td>
              <td class="num">{{ it.volumes ?? '' }}</td>
              <td>
                {{ it.packagingUsed ?? '' }}
                @if (it.status === 'uncataloged') {
                  <span class="badge warn">sem cadastro</span>
                }
              </td>
              <td class="muted">{{ itemStatus(it.status) }}</td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <div class="alert">Nota sem itens: registrada pelo DANFE; o XML, quando chegar, traz os itens e reconcilia.</div>
    }
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 0.6rem 1rem;
      margin-top: 0.9rem;
    }
  `,
})
export class InvoiceDetailView {
  readonly invoice = input.required<InvoiceDetail>();
  readonly brl = formatBrl;
  readonly num = formatNumber;
  readonly date = formatDateBr;
  readonly cnpj = formatCnpj;
  readonly key = formatAccessKey;
  readonly source = (s: string) => SOURCE_LABEL[s] ?? s;
  readonly status = (s: string) => STATUS_LABEL[s] ?? s;
  readonly itemStatus = (s: string | null) => (s ? (ITEM_STATUS[s] ?? s) : '');
}
