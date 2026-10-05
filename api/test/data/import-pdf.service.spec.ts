/**
 * ImportPdfService com PDFs de verdade (gerados pelo pdfkit e lidos pelo
 * pdf-parse), Prisma e InvoicesService mockados, cadastro em memória.
 */
import { ConflictException } from '@nestjs/common';

import type { CatalogService } from '../../src/catalog/catalog.service';
import { buildDanfePdf, buildImageOnlyPdf } from '../../src/demo/danfe-pdf';
import { InMemoryCatalog } from '../../src/domain/catalog';
import { ImportPdfService } from '../../src/invoices/import-pdf.service';
import type { InvoicesService } from '../../src/invoices/invoices.service';
import { STORE, danfeSpec } from '../support/danfe';
import { asPrisma, prismaError, prismaMock } from '../support/prisma-mock';

function catalog(): CatalogService {
  const c = new InMemoryCatalog();
  c.add({
    ean: '7890000000017',
    code: 'F-01',
    name: 'BISCOITO 140G RECHEADO CHOCOLATE',
    packaging: 'CX',
    unitsPerPackage: 24,
  });
  return c as unknown as CatalogService;
}

function service(mock = prismaMock()) {
  const invoices = {
    createManual: jest.fn().mockResolvedValue({
      invoice: { accessKey: 'x' },
      warnings: [{ code: 'DATE_OUTSIDE_KEY_PERIOD', message: 'aviso' }],
    }),
  };
  mock.store.findMany.mockResolvedValue([{ cnpj: STORE }]);
  return {
    svc: new ImportPdfService(
      asPrisma(mock),
      invoices as unknown as InvoicesService,
      catalog(),
    ),
    invoices,
    mock,
  };
}

const file = (name: string, bytes: Buffer) => ({ name, bytes });

describe('ImportPdfService.importPdf', () => {
  it('DANFE com itens que fecham: nota pendente gravada com os itens e a cascata', async () => {
    const spec = danfeSpec();
    const { svc, mock, invoices } = service();
    const report = await svc.importPdf(
      [file('carga.pdf', await buildDanfePdf([spec]))],
      'doca',
    );

    expect(report).toMatchObject({ imported: 1, errors: 0 });
    expect(report.results[0]).toMatchObject({
      file: 'carga.pdf',
      status: 'imported',
      accessKey: spec.accessKey,
      number: '1234',
    });
    expect(invoices.createManual).not.toHaveBeenCalled();

    const data = mock.invoice.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      accessKey: spec.accessKey,
      number: '1234',
      issuerCnpj: spec.issuerCnpj,
      recipientCnpj: STORE,
      carrierVolumes: 4,
      grossWeight: 150.5,
      totalValue: 432.59,
      productsValue: 400.55,
      source: 'manual',
      status: 'pending',
      note: 'Importada do PDF carga.pdf',
      createdBy: 'doca',
      itemVolumes: 2 + 37 + 0, // 48 UN → 2 CX; detergente sem cadastro → 37 brutos; tomate KG → 0
      volumeMismatch: false, // há medida contínua: a soma não é comparável
    });
    expect(data.issueDate.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    expect(data.items.create.map((i: { status: string }) => i.status)).toEqual([
      'converted',
      'uncataloged',
      'continuous',
    ]);
    expect(report.results[0].warnings.map((w) => w.code)).toEqual([
      'UNCATALOGED_ITEMS',
    ]);
  });

  it('nota de duas folhas no mesmo PDF é agregada antes da gravação', async () => {
    const spec = danfeSpec();
    const { svc, mock } = service();
    const report = await svc.importPdf([
      file('carga.pdf', await buildDanfePdf([spec], { itemsPerPage: 1 })),
    ]);
    expect(report.imported).toBe(1);
    expect(mock.invoice.create.mock.calls[0][0].data.items.create).toHaveLength(
      3,
    );
  });

  it('itens que não conferem: a nota entra pelo caminho manual, sem itens, com aviso de extração', async () => {
    const spec = danfeSpec({ productsValue: 999.99 });
    const { svc, mock, invoices } = service();
    const report = await svc.importPdf(
      [file('carga.pdf', await buildDanfePdf([spec]))],
      'doca',
    );

    expect(mock.invoice.create).not.toHaveBeenCalled();
    expect(invoices.createManual).toHaveBeenCalledWith(
      expect.objectContaining({
        accessKey: spec.accessKey,
        issueDate: '2026-07-15',
        recipientCnpj: STORE,
        issuerCnpj: spec.issuerCnpj,
        volumes: 4,
        grossWeight: 150.5,
        species: 'CAIXAS',
        totalValue: spec.totalValue,
        note: 'Importada do PDF carga.pdf',
      }),
      'doca',
    );
    expect(report.results[0].warnings.map((w) => w.code)).toEqual([
      'PDF_EXTRACTION',
      'DATE_OUTSIDE_KEY_PERIOD',
    ]);
  });

  it('vários DANFEs numa carga: cada um vira um resultado; página estranha vira erro com o número da página', async () => {
    const { svc } = service();
    const pdf = await buildDanfePdf([
      danfeSpec({ number: 1 }),
      danfeSpec({ number: 2 }),
    ]);
    const report = await svc.importPdf([file('carga.pdf', pdf)]);
    expect(report.results.map((r) => [r.status, r.number])).toEqual([
      ['imported', '1'],
      ['imported', '2'],
    ]);
  });

  it('PDF sem camada de texto e arquivo que não é PDF entram como erro', async () => {
    const { svc } = service();
    const report = await svc.importPdf([
      file('foto.pdf', await buildImageOnlyPdf()),
      file('lixo.pdf', Buffer.from('nao e pdf')),
    ]);
    expect(report.errors).toBe(2);
    expect(report.results[0].reason).toMatch(/camada de texto/);
    expect(report.results[1].reason).toMatch(/corrompido|não é um PDF/);
  });

  it('chave já registrada: o PDF não substitui a nota', async () => {
    const mock = prismaMock();
    mock.invoice.create.mockRejectedValueOnce(prismaError('P2002'));
    const { svc, invoices } = service(mock);
    invoices.createManual.mockRejectedValueOnce(
      new ConflictException({
        message: 'Já existe nota com essa chave de acesso',
      }),
    );

    const pdf = await buildDanfePdf([
      danfeSpec({ number: 1 }),
      danfeSpec({ number: 2, productsValue: 999.99 }),
    ]);
    const report = await svc.importPdf([file('carga.pdf', pdf)]);
    expect(report.errors).toBe(2);
    expect(report.results.map((r) => r.reason)).toEqual([
      'já existe nota com essa chave; o PDF não substitui nota registrada',
      'já existe nota com essa chave; o PDF não substitui nota registrada',
    ]);
  });
});
