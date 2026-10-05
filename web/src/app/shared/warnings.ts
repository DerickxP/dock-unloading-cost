import { Component, input } from '@angular/core';

import type { Warning } from '../core/types';

@Component({
  selector: 'app-warnings',
  template: `
    @for (w of warnings(); track $index) {
      <div class="alert warn">⚠ {{ w.message }}</div>
    }
  `,
})
export class Warnings {
  readonly warnings = input<Warning[]>([]);
}
