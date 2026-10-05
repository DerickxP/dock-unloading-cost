import { Component, ElementRef, input, output, viewChild } from '@angular/core';

/** Botão que abre o seletor de arquivos e emite a lista escolhida. */
@Component({
  selector: 'app-file-button',
  template: `
    <button [class]="primary() ? 'primary' : ''" [disabled]="disabled()" (click)="picker.click()">
      <ng-content />
    </button>
    <input #picker type="file" hidden [accept]="accept()" [multiple]="multiple()" (change)="onChange()" />
  `,
})
export class FileButton {
  readonly accept = input('');
  readonly multiple = input(false);
  readonly primary = input(false);
  readonly disabled = input(false);
  readonly files = output<File[]>();
  protected readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('picker');

  protected onChange(): void {
    const el = this.picker().nativeElement;
    const list = Array.from(el.files ?? []);
    el.value = '';
    if (list.length) {
      this.files.emit(list);
    }
  }
}
