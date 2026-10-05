import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiError } from '../core/api-error';
import { ApiService } from '../core/api.service';
import { formatAccessKey, parseDecimal } from '../core/format';
import { ToastService } from '../core/toast.service';
import type { DecodedKey, InvoiceDetail, ManualInvoiceInput, Warning } from '../core/types';
import { Warnings } from '../shared/warnings';

interface Draft {
  accessKey: string;
  issueDate: string;
  recipientCnpj: string;
  recipientName: string;
  issuerName: string;
  volumes: string;
  grossWeight: string;
  species: string;
  totalValue: string;
  note: string;
}

const EMPTY: Draft = {
  accessKey: '',
  issueDate: '',
  recipientCnpj: '',
  recipientName: '',
  issuerName: '',
  volumes: '',
  grossWeight: '',
  species: '',
  totalValue: '',
  note: '',
};

/**
 * Nota digitada do DANFE enquanto o XML não chega. A chave lida pelo leitor
 * de código de barras é decodificada na hora (número, série, CNPJ do emitente,
 * competência) para a doca conferir antes de salvar.
 */
@Component({
  selector: 'app-manual-invoice-form',
  imports: [FormsModule, Warnings],
  template: `
    <div class="row">
      <label class="field grow">
        Chave de acesso (44 dígitos, do DANFE)
        <input
          class="mono"
          [ngModel]="draft().accessKey"
          (ngModelChange)="onKey($event)"
          [disabled]="!!editing()"
          placeholder="3526 0730 0000 0000 0152 5500 1000 0010 0015 8678 4378"
          autocomplete="off"
        />
      </label>
    </div>
    @if (decoded(); as k) {
      @if (k.valid) {
        <div class="alert ok">
          Chave válida · nota nº <strong>{{ k.number }}</strong> série {{ k.series }} · emitente
          <span class="mono">{{ k.issuerCnpjFormatted }}</span> · competência {{ pad(k.month) }}/{{ k.year }}
        </div>
      } @else if (k.key.length >= 44) {
        <div class="alert danger">Chave inválida: confira o dígito verificador.</div>
      }
    }
    <div class="row">
      <label class="field grow"
        >Fornecedor (razão social)<input [ngModel]="draft().issuerName" (ngModelChange)="set('issuerName', $event)"
      /></label>
      <label class="field"
        >Data de emissão<input type="date" [ngModel]="draft().issueDate" (ngModelChange)="set('issueDate', $event)"
      /></label>
    </div>
    <div class="row">
      <label class="field"
        >CNPJ da loja destinatária<input
          [ngModel]="draft().recipientCnpj"
          (ngModelChange)="set('recipientCnpj', $event)"
      /></label>
      <label class="field grow"
        >Nome da loja na nota<input [ngModel]="draft().recipientName" (ngModelChange)="set('recipientName', $event)"
      /></label>
    </div>
    <div class="row">
      <label class="field"
        >Volumes<input inputmode="numeric" [ngModel]="draft().volumes" (ngModelChange)="set('volumes', $event)"
      /></label>
      <label class="field"
        >Peso bruto (kg)<input
          inputmode="decimal"
          [ngModel]="draft().grossWeight"
          (ngModelChange)="set('grossWeight', $event)"
      /></label>
      <label class="field"
        >Espécie<input [ngModel]="draft().species" (ngModelChange)="set('species', $event)" placeholder="CAIXAS"
      /></label>
      <label class="field"
        >Valor da NF (R$)<input
          inputmode="decimal"
          [ngModel]="draft().totalValue"
          (ngModelChange)="set('totalValue', $event)"
      /></label>
    </div>
    <label class="field"
      >Observação<textarea rows="2" [ngModel]="draft().note" (ngModelChange)="set('note', $event)"></textarea>
    </label>
    <p class="muted">
      Informe volumes ou peso; sem um dos dois a nota não é cobrável. O XML que chegar depois reconcilia esta nota pela
      chave.
    </p>
    @if (error(); as err) {
      <div class="alert danger">{{ err }}</div>
    }
    <app-warnings [warnings]="warnings()" />
    <div class="row" style="justify-content: flex-end; margin-top: 0.6rem">
      <button (click)="cancelled.emit()">Cancelar</button>
      <button class="primary" [disabled]="saving()" (click)="save()">
        {{ editing() ? 'Salvar correção' : 'Registrar nota pendente' }}
      </button>
    </div>
  `,
})
export class ManualInvoiceForm {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);

  /** Nota manual pendente em correção; null para registrar uma nova. */
  readonly editing = input<InvoiceDetail | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  readonly draft = signal<Draft>(EMPTY);
  readonly decoded = signal<DecodedKey | null>(null);
  readonly warnings = signal<Warning[]>([]);
  readonly error = signal('');
  readonly saving = signal(false);

  constructor() {
    effect(() => {
      const e = this.editing();
      this.warnings.set([]);
      this.error.set('');
      this.decoded.set(null);
      this.draft.set(
        e
          ? {
              accessKey: formatAccessKey(e.accessKey),
              issueDate: e.issueDate,
              recipientCnpj: e.recipientCnpj,
              recipientName: e.recipientName,
              issuerName: e.issuerName,
              volumes: String(e.carrierVolumes),
              grossWeight: e.grossWeight ? String(e.grossWeight).replace('.', ',') : '',
              species: e.species,
              totalValue: e.totalValue ? String(e.totalValue).replace('.', ',') : '',
              note: e.note ?? '',
            }
          : EMPTY,
      );
    });
  }

  set<K extends keyof Draft>(key: K, value: Draft[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  pad(n: number | undefined): string {
    return String(n ?? 0).padStart(2, '0');
  }

  async onKey(value: string): Promise<void> {
    this.set('accessKey', value);
    const digits = value.replace(/\D/g, '');
    if (digits.length < 44) {
      this.decoded.set(null);
      return;
    }
    try {
      this.decoded.set(await this.api.decodeKey(digits));
    } catch {
      this.decoded.set(null);
    }
  }

  async save(): Promise<void> {
    const d = this.draft();
    const num = (s: string) => (s.trim() ? parseDecimal(s) : undefined);
    const payload: ManualInvoiceInput = {
      accessKey: d.accessKey.replace(/\D/g, ''),
      issueDate: d.issueDate,
      recipientCnpj: d.recipientCnpj,
      recipientName: d.recipientName || undefined,
      issuerName: d.issuerName,
      volumes: num(d.volumes),
      grossWeight: num(d.grossWeight),
      species: d.species || undefined,
      totalValue: num(d.totalValue),
      note: d.note || undefined,
    };
    this.saving.set(true);
    this.error.set('');
    try {
      const editing = this.editing();
      if (editing) {
        const { accessKey: _k, issuerCnpj: _c, ...rest } = payload;
        await this.api.updateManualInvoice(editing.accessKey, rest);
        this.toasts.ok(`Nota ${editing.number} corrigida`);
      } else {
        const r = await this.api.createManualInvoice(payload);
        this.toasts.ok(`Nota ${r.invoice.number} registrada como pendente`);
        if (r.warnings.length) {
          this.warnings.set(r.warnings);
          r.warnings.forEach((w) => this.toasts.show('info', w.message, 8000));
        }
      }
      this.saved.emit();
    } catch (e) {
      this.error.set(e instanceof ApiError ? e.message : 'Falha ao salvar');
    } finally {
      this.saving.set(false);
    }
  }
}
