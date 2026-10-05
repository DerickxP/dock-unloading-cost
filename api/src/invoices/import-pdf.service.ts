/**
 * Importação de notas por PDF do DANFE.
 *
 * O fornecedor às vezes manda a nota em PDF, sem XML. Cada arquivo pode ser
 * uma carga com vários DANFEs (um por página, notas grandes em duas folhas);
 * o domínio agrupa pela chave.
 *
 * A nota entra como manual/pendente e é reconciliada quando o XML chegar.
 * Quando os itens passam na prova aritmética, entram junto e a cascata de
 * volumes roda neles, como no XML; senão a nota entra sem itens, com aviso.
 * Página ambígua é rejeitada com motivo no relato, nunca adivinhada.
 */
import { BadRequestException, Injectable } from '@nestjs/common';

import { CatalogService } from '../catalog/catalog.service';
import { DanfeInvoice, extractDanfes } from '../domain/danfe-text';
import { dateFromIso } from '../domain/dates';
import type { Invoice } from '../domain/invoice';
import { recalculateInvoice } from '../domain/unloading';
import { PrismaService } from '../prisma/prisma.service';
import { PdfUnreadableError, hasNoTextLayer, readPdfPages } from './danfe-pdf';
import {
  FileResult,
  ImportReport,
  ImportStatus,
  XmlFile,
} from './import.service';
import { toInvoiceColumns, toItemRows } from './invoice.mapper';
import { SOURCE_MANUAL, STATUS_PENDING, Warning } from './invoice.types';
import { recalculationWarnings } from './invoice.warnings';
import { InvoicesService } from './invoices.service';

export type PdfFile = XmlFile;

const CONFLICT_REASON =
  'já existe nota com essa chave; o PDF não substitui nota registrada';

function isPrismaError(e: unknown, code: string): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: string }).code === code
  );
}

function httpMessage(e: unknown): string {
  const response = (e as { getResponse?: () => unknown }).getResponse?.();
  if (response && typeof response === 'object' && 'message' in response) {
    const message = (response as { message: unknown }).message;
    return Array.isArray(message) ? message.join('; ') : String(message);
  }
  return e instanceof Error ? e.message : 'falha ao gravar a nota';
}

@Injectable()
export class ImportPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly catalog: CatalogService,
  ) {}

  async importPdf(files: PdfFile[], operator?: string): Promise<ImportReport> {
    // CNPJs das lojas: desempatam o destinatário quando o DANFE imprime também
    // o CNPJ da transportadora.
    const stores = await this.prisma.store.findMany({ select: { cnpj: true } });
    const known = new Set(stores.map((s) => s.cnpj));

    const results: FileResult[] = [];
    for (const file of files) {
      results.push(...(await this.importOne(file, known, operator)));
    }
    const count = (s: ImportStatus) =>
      results.filter((r) => r.status === s).length;
    return {
      results,
      imported: count('imported'),
      reconciled: count('reconciled'),
      updated: count('updated'),
      errors: count('error'),
    };
  }

  private async importOne(
    file: PdfFile,
    known: ReadonlySet<string>,
    operator?: string,
  ): Promise<FileResult[]> {
    const fileError = (reason: string): FileResult[] => [
      { file: file.name, status: 'error', reason, warnings: [] },
    ];

    let pages: string[];
    try {
      pages = await readPdfPages(file.bytes);
    } catch (e) {
      return fileError(
        e instanceof PdfUnreadableError ? e.message : 'falha ao ler o PDF',
      );
    }
    if (hasNoTextLayer(pages)) {
      return fileError(
        'o PDF não tem camada de texto (digitalizado ou foto); importe o XML ou registre pela nota do DANFE',
      );
    }

    const { invoices, invalid } = extractDanfes(pages, known);
    const results: FileResult[] = invalid.map((p) => ({
      file: `${file.name} (pág. ${p.page})`,
      status: 'error' as const,
      reason: p.reason,
      warnings: [],
    }));

    for (const danfe of invoices) {
      const note = `Importada do PDF ${file.name}`;
      const extraction: Warning[] = danfe.warnings.map((message) => ({
        code: 'PDF_EXTRACTION',
        message,
      }));
      try {
        const warnings = danfe.items.length
          ? await this.saveWithItems(danfe, note, operator)
          : (
              await this.invoices.createManual(
                {
                  accessKey: danfe.accessKey,
                  issueDate: danfe.issueDate,
                  recipientCnpj: danfe.recipientCnpj,
                  recipientName: danfe.recipientName,
                  issuerName: danfe.issuerName,
                  issuerCnpj: danfe.issuerCnpj,
                  volumes: danfe.carrierVolumes,
                  grossWeight: danfe.grossWeight,
                  species: danfe.species,
                  totalValue: danfe.totalValue,
                  note,
                },
                operator,
              )
            ).warnings;
        results.push({
          file: file.name,
          status: 'imported',
          accessKey: danfe.accessKey,
          number: danfe.number,
          warnings: [...extraction, ...warnings],
        });
      } catch (e) {
        const conflict =
          (e as { status?: number }).status === 409 ||
          isPrismaError(e, 'P2002');
        results.push({
          file: file.name,
          status: 'error',
          accessKey: danfe.accessKey,
          number: danfe.number,
          reason: conflict
            ? CONFLICT_REASON
            : e instanceof BadRequestException
              ? httpMessage(e)
              : 'falha ao gravar a nota',
          warnings: extraction,
        });
      }
    }
    return results;
  }

  /** Nota pendente com os itens do DANFE: a cascata roda neles e o snapshot sai do recálculo. */
  private async saveWithItems(
    danfe: DanfeInvoice,
    note: string,
    operator?: string,
  ): Promise<Warning[]> {
    const issueDate = dateFromIso(danfe.issueDate);
    if (!issueDate) {
      throw new BadRequestException({
        message: 'Data de emissão inválida no DANFE',
        field: 'issueDate',
      });
    }
    const parsed: Invoice = {
      accessKey: danfe.accessKey,
      number: danfe.number,
      series: danfe.series,
      issueDate: danfe.issueDate,
      issuerCnpj: danfe.issuerCnpj,
      issuerName: danfe.issuerName,
      recipientCnpj: danfe.recipientCnpj,
      recipientName: danfe.recipientName,
      totalValue: danfe.totalValue,
      productsValue: danfe.productsValue,
      species: danfe.species,
      carrierVolumes: danfe.carrierVolumes,
      grossWeight: danfe.grossWeight,
      netWeight: danfe.netWeight,
      items: danfe.items.map((it) => ({
        ean: '',
        code: it.code,
        description: it.description,
        unit: it.unit,
        quantity: it.quantity,
        value: it.total,
      })),
    };
    const invoice = await recalculateInvoice(parsed, this.catalog);
    const warnings = recalculationWarnings(invoice);
    await this.prisma.invoice.create({
      data: {
        accessKey: invoice.accessKey,
        ...toInvoiceColumns(invoice, issueDate),
        source: SOURCE_MANUAL,
        status: STATUS_PENDING,
        note,
        createdBy: operator ?? null,
        items: { create: toItemRows(invoice) },
      },
    });
    return warnings;
  }
}
