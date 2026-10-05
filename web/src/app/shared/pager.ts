import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pager',
  template: `
    <div class="pager">
      <span class="muted">{{ total() }} registro(s) · página {{ page() }} de {{ pages() }}</span>
      <button class="small" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)">‹ Anterior</button>
      <button class="small" [disabled]="page() >= pages()" (click)="pageChange.emit(page() + 1)">Próxima ›</button>
    </div>
  `,
})
export class Pager {
  readonly page = input(1);
  readonly perPage = input(50);
  readonly total = input(0);
  readonly pageChange = output<number>();
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / Math.max(1, this.perPage()))));
}
