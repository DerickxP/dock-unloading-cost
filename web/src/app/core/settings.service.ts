import { Injectable, signal } from '@angular/core';

const OPERATOR_KEY = 'dock.operator';
const ADMIN_KEY = 'dock.adminKey';

/**
 * Identidade da sessão sem SSO: quem opera (header x-operator) e a chave de
 * administração (header x-admin-key), guardadas no navegador.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly operator = signal(localStorage.getItem(OPERATOR_KEY) ?? '');
  readonly adminKey = signal(localStorage.getItem(ADMIN_KEY) ?? '');

  setOperator(value: string): void {
    this.operator.set(value.trim());
    localStorage.setItem(OPERATOR_KEY, this.operator());
  }

  setAdminKey(value: string): void {
    this.adminKey.set(value.trim());
    localStorage.setItem(ADMIN_KEY, this.adminKey());
  }

  get isAdmin(): boolean {
    return this.adminKey().length > 0;
  }
}
