import { Component, input } from '@angular/core';

/**
 * Marca do sistema: a seta de descarga sobre a caixa, na linha da doca.
 * Mesmo desenho do favicon (public/favicon.svg), aqui em currentColor para
 * herdar a cor do fundo onde estiver.
 */
@Component({
  selector: 'app-logo',
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="8 6 48 54" fill="none" aria-hidden="true">
      <path d="M32 9v16" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
      <path
        d="M24.5 19.5 32 27l7.5-7.5"
        stroke="currentColor"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <rect x="16" y="32" width="32" height="19" rx="3.5" fill="currentColor" />
      <path d="M16 39.5h32M28.5 32v7.5M35.5 32v7.5" stroke="var(--logo-bg, #1c719c)" stroke-width="2.6" />
      <path d="M11 56h42" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".75" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
    }
  `,
})
export class Logo {
  readonly size = input(22);
}
