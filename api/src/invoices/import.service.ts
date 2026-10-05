/**
 * Importação de XML da NF-e: a entrada de notas com itens.
 *
 * É aqui que a cascata de volumes trabalha: cada item recebe volumes pelo
 * cadastro (com aprendizado de alias) e a nota recebe o snapshot. Um job de
 * ingestão automática deve escrever por este mesmo caminho.
 *
 * Decisões:
 * - upsert pela chave de acesso: re-subir o mesmo XML atualiza, nunca duplica;
 * - nota manual pendente (ou descartada) com a mesma chave é reconciliada: o
 *   XML é a verdade, a observação do operador é preservada e a diferença entre
 *   o digitado e o real vira aviso, não bloqueio;
 * - arquivo ruim entra no relato como erro e o resto do lote segue;
 * - itens são regravados junto com a nota numa escrita só.
 */
import { Injectable } from '@nestjs/common';

import { CatalogService } from '../catalog/catalog.service';
import { isValidAccessKey } from '../domain/access-key';
import { dateFromIso } from '../domain/dates';
import { formatNumber } from '../domain/format';
import { decodeXml, parseNfe } from '../domain/nfe-parser';
import { VolumeConverter, recalculateInvoice } from '../domain/unloading';
import { PrismaService } from '../prisma/prisma.service';
import { toInvoiceColumns, toItemRows } from './invoice.mapper';
import { recalculationWarnings } from './invoice.warnings';
import {
  InvoiceRow,
  SOURCE_MANUAL,
  SOURCE_UPLOAD,
  STATUS_CONFIRMED,
  STATUS_DISCARDED,
  STATUS_PENDING,
  STATUS_RECONCILED,
  Warning,
} from './invoice.types';

export interface XmlFile {
  name: string;
  bytes: Uint8Array;
}

export type ImportStatus = 'imported' | 'reconciled' | 'updated' | 'error';

export interface FileResult {
  file: string;
  status: ImportStatus;
  accessKey?: string;
  number?: string;
  /** Preenchido quando status = 'error'. */
  reason?: string;
  warnings: Warning[];
}

export interface ImportReport {
  results: FileResult[];
  imported: number;
  reconciled: number;
  updated: number;
  errors: number;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async importXml(files: XmlFile[], operator?: string): Promise<ImportReport> {
    const results: FileResult[] = [];
    // Sequencial de propósito: dois arquivos com a mesma chave viram criação +
    // atualização, nunca uma corrida entre si.
    for (const file of files) {
      results.push(await this.importOne(file, this.catalog, operator));
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
    file: XmlFile,
    converter: VolumeConverter,
    operator?: string,
  ): Promise<FileResult> {
    const error = (reason: string): FileResult => ({
      file: file.name,
      status: 'error',
      reason,
      warnings: [],
    });

    const parsed = parseNfe(decodeXml(file.bytes));
    if (!parsed) {
      return error(
        'não é um XML de NF-e aproveitável (sem chave de acesso ou sem número)',
      );
    }
    if (!isValidAccessKey(parsed.accessKey)) {
      return error(
        'chave de acesso com dígito verificador inválido; o arquivo pode estar corrompido',
      );
    }
    const issueDate = dateFromIso(parsed.issueDate);
    if (!issueDate) {
      return error('XML sem data de emissão (dhEmi/dEmi)');
    }

    const invoice = await recalculateInvoice(parsed, converter);
    const warnings = recalculationWarnings(invoice);
    const common = toInvoiceColumns(invoice, issueDate);
    const items = toItemRows(invoice);

    const ok = (status: ImportStatus): FileResult => ({
      file: file.name,
      status,
      accessKey: invoice.accessKey,
      number: invoice.number,
      warnings,
    });

    const current: InvoiceRow | null = await this.prisma.invoice.findUnique({
      where: { accessKey: invoice.accessKey },
    });

    if (!current) {
      await this.prisma.invoice.create({
        data: {
          accessKey: invoice.accessKey,
          ...common,
          source: SOURCE_UPLOAD,
          status: STATUS_CONFIRMED,
          createdBy: operator ?? null,
          items: { create: items },
        },
      });
      return ok('imported');
    }

    // Nota digitada na doca aguardando o XML, inclusive a descartada: o XML em
    // mãos prova que a nota é real, então ela volta à cobrança.
    const reconciles =
      current.source === SOURCE_MANUAL &&
      (current.status === STATUS_PENDING ||
        current.status === STATUS_DISCARDED);

    if (reconciles) {
      const typedVolumes = Math.trunc(current.carrierVolumes ?? 0);
      const typedWeight = current.grossWeight ?? 0;
      if (
        typedVolumes !== invoice.volumes ||
        typedWeight !== invoice.unloadWeight
      ) {
        warnings.push({
          code: 'RECONCILED_WITH_DIFFERENCE',
          message:
            `A doca digitou ${formatNumber(typedVolumes, 0)} vol / ${formatNumber(typedWeight, 3)} kg ` +
            `e o XML traz ${formatNumber(invoice.volumes, 0)} vol / ${formatNumber(invoice.unloadWeight, 3)} kg; ` +
            'confira a descarga desta nota.',
        });
      }
      await this.prisma.invoice.update({
        where: { accessKey: invoice.accessKey },
        data: {
          ...common,
          status: STATUS_RECONCILED,
          reconciledAt: new Date(),
          updatedBy: operator ?? null,
          // source, note e createdBy são do operador; o XML não toca.
          items: { deleteMany: {}, create: items },
        },
      });
      return ok('reconciled');
    }

    await this.prisma.invoice.update({
      where: { accessKey: invoice.accessKey },
      data: {
        ...common,
        updatedBy: operator ?? null,
        items: { deleteMany: {}, create: items },
      },
    });
    return ok('updated');
  }
}
