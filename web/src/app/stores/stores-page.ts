import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiError } from '../core/api-error';
import { ApiService } from '../core/api.service';
import { formatDateBr, formatDateTimeBr } from '../core/format';
import { SettingsService } from '../core/settings.service';
import { ToastService } from '../core/toast.service';
import type { StoreDto, UnregisteredStore } from '../core/types';

/** Lojas: CNPJ → apelido. O CNPJ vem da nota; o apelido é o rótulo do relatório. */
@Component({
  selector: 'app-stores-page',
  imports: [FormsModule],
  templateUrl: './stores-page.html',
  styleUrl: './stores-page.css',
})
export class StoresPage {
  private readonly api = inject(ApiService);
  private readonly toasts = inject(ToastService);
  readonly settings = inject(SettingsService);

  readonly search = signal('');
  readonly stores = signal<StoreDto[]>([]);
  readonly unregistered = signal<UnregisteredStore[]>([]);
  readonly loading = signal(false);
  readonly form = signal({ cnpj: '', nickname: '' });
  readonly saving = signal(false);

  readonly date = formatDateBr;
  readonly when = formatDateTimeBr;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [stores, unregistered] = await Promise.all([
        this.api.listStores(this.search()),
        this.api.unregisteredStores(),
      ]);
      this.stores.set(stores.items);
      this.unregistered.set(unregistered);
    } catch (e) {
      this.fail(e);
    } finally {
      this.loading.set(false);
    }
  }

  setForm(field: 'cnpj' | 'nickname', value: string): void {
    this.form.update((f) => ({ ...f, [field]: value }));
  }

  prefill(u: UnregisteredStore): void {
    this.form.set({ cnpj: u.cnpjFormatted, nickname: '' });
    document.getElementById('store-nickname')?.focus();
  }

  rename(s: StoreDto): void {
    this.form.set({ cnpj: s.cnpjFormatted, nickname: s.nickname });
    document.getElementById('store-nickname')?.focus();
  }

  async save(): Promise<void> {
    const { cnpj, nickname } = this.form();
    this.saving.set(true);
    try {
      const r = await this.api.saveStore(cnpj, nickname);
      this.toasts.ok(`Loja ${r.store.nickname} ${r.created ? 'cadastrada' : 'atualizada'}`);
      if (r.duplicateNickname) {
        this.toasts.show('info', 'Outra loja já usa esse apelido; confira se não é a mesma.', 7000);
      }
      this.form.set({ cnpj: '', nickname: '' });
      await this.load();
    } catch (e) {
      this.fail(e);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(s: StoreDto): Promise<void> {
    if (!confirm(`Remover o apelido "${s.nickname}"? As notas da loja continuam, só sem o rótulo.`)) {
      return;
    }
    try {
      await this.api.removeStore(s.cnpj);
      this.toasts.ok('Apelido removido');
      await this.load();
    } catch (e) {
      this.fail(e);
    }
  }

  private fail(e: unknown): void {
    this.toasts.error(e instanceof ApiError ? e.message : 'Falha ao falar com a API');
  }
}
