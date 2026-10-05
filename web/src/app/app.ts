import { Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { SettingsService } from './core/settings.service';
import { ToastService } from './core/toast.service';
import { Dialog } from './shared/dialog';
import { Logo } from './shared/logo';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, Dialog, Logo],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly settings = inject(SettingsService);
  readonly toasts = inject(ToastService);
  readonly settingsDialog = viewChild.required<Dialog>('settingsDialog');

  readonly operatorDraft = signal('');
  readonly adminKeyDraft = signal('');

  openSettings(): void {
    this.operatorDraft.set(this.settings.operator());
    this.adminKeyDraft.set(this.settings.adminKey());
    this.settingsDialog().open();
  }

  saveSettings(): void {
    this.settings.setOperator(this.operatorDraft());
    this.settings.setAdminKey(this.adminKeyDraft());
    this.settingsDialog().close();
    this.toasts.ok('Configurações salvas neste navegador');
  }
}
