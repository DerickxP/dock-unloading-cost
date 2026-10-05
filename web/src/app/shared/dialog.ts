import { Component, ElementRef, input, output, viewChild } from '@angular/core';

/** Caixa de diálogo nativa (<dialog>) com cabeçalho, corpo e rodapé projetados. */
@Component({
  selector: 'app-dialog',
  template: `
    <dialog #dlg (close)="closed.emit()" (click)="onBackdrop($event)">
      <div class="dialog-head">
        <h2>{{ title() }}</h2>
        <button class="small" (click)="close()" aria-label="Fechar">✕</button>
      </div>
      <div class="dialog-body"><ng-content /></div>
      <div class="dialog-foot"><ng-content select="[footer]" /></div>
    </dialog>
  `,
})
export class Dialog {
  readonly title = input('');
  readonly closed = output<void>();
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  open(): void {
    const el = this.dlg().nativeElement;
    if (el.open) {
      return;
    }
    // jsdom (testes) não implementa showModal.
    if (typeof el.showModal === 'function') {
      el.showModal();
    } else {
      el.setAttribute('open', '');
    }
  }

  close(): void {
    const el = this.dlg().nativeElement;
    if (!el.open) {
      return;
    }
    if (typeof el.close === 'function') {
      el.close();
    } else {
      el.removeAttribute('open');
    }
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === this.dlg().nativeElement) {
      this.close();
    }
  }
}
