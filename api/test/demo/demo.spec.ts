import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runDemo } from '../../src/demo/main';
import { syntheticInvoices } from '../../src/demo/synthetic';
import { isValidAccessKey } from '../../src/domain/access-key';
import { parseNfe } from '../../src/domain/nfe-parser';

describe('demonstração', () => {
  it('XMLs sintéticos são NF-e válidas e determinísticas', () => {
    const a = syntheticInvoices(6, 42);
    const b = syntheticInvoices(6, 42);
    expect(a).toEqual(b);
    for (const f of a) {
      const inv = parseNfe(f.xml)!;
      expect(inv).not.toBeNull();
      expect(isValidAccessKey(inv.accessKey)).toBe(true);
      expect(inv.items.length).toBeGreaterThan(0);
    }
  });

  it('roda ponta a ponta e grava xml/, resultado.json e a planilha', async () => {
    const out = mkdtempSync(join(tmpdir(), 'dock-demo-'));
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const result = await runDemo({
        out,
        invoices: 8,
        seed: 3,
        method: 'volume',
        price: 2,
      });
      expect(result.totals.invoices).toBe(8);
      expect(result.stores.length).toBeGreaterThan(0);
      expect(readdirSync(join(out, 'xml'))).toHaveLength(8);
      expect(existsSync(join(out, 'resultado.json'))).toBe(true);
      expect(
        readdirSync(out).some((f) => /^descarga_\d{8}_\d{6}\.xlsx$/.test(f)),
      ).toBe(true);
      const json = JSON.parse(
        readFileSync(join(out, 'resultado.json'), 'utf-8'),
      );
      expect(json.invoices).toHaveLength(8);
    } finally {
      log.mockRestore();
      rmSync(out, { recursive: true, force: true });
    }
  });
});
