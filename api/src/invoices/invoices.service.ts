/**
 * Notas fiscais: escrita manual e leitura.
 *
 * A nota manual é a da doca: o caminhão chegou, o XML ainda não veio, e o
 * operador tem o DANFE. A chave de acesso (44 dígitos, lida pelo leitor de
 * código de barras) é a identidade; o XML que chegar depois reconcilia por ela.
 *
 * Decisões:
 * - volumes e peso digitados vão para `carrierVolumes`/`grossWeight` (as
 *   colunas do transporte), e o snapshot espelha isso, senão a nota manual
 *   zeraria no recálculo;
 * - número, série e CNPJ do emitente saem da chave, não da digitação;
 * - nada é apagado: descartar é mudar o status;
 * - a razão social do destinatário nunca é sobrescrita pelo apelido da loja.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  accessKeyDigits,
  isValidAccessKey,
  parseAccessKey,
} from '../domain/access-key';
import { isValidTaxId, normalizeCnpj } from '../domain/cnpj';
import { dateFromIso, isoFromDate } from '../domain/dates';
import type { Invoice } from '../domain/invoice';
import { round2, round3 } from '../domain/money';
import { cleanSpecies } from '../domain/nfe-parser';
import { invoiceSpecies } from '../domain/species';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StoresService } from '../stores/stores.service';
import { rowToInvoice } from './invoice.mapper';
import {
  InvoiceDetail,
  InvoiceRow,
  InvoiceSummary,
  Page,
  SOURCE_MANUAL,
  STATUS_DISCARDED,
  STATUS_PENDING,
  Warning,
} from './invoice.types';

const PER_PAGE_MAX = 200;
const PER_PAGE_DEFAULT = 50;
const NOTE_MAX = 500;

export interface CreateManualInvoice {
  accessKey: string;
  issueDate: string;
  recipientCnpj: string;
  recipientName?: string;
  issuerName: string;
  issuerCnpj?: string;
  volumes?: number;
  grossWeight?: number;
  species?: string;
  totalValue?: number;
  note?: string;
}

export interface UpdateManualInvoice {
  volumes?: number;
  grossWeight?: number;
  species?: string;
  totalValue?: number;
  note?: string;
  recipientCnpj?: string;
  recipientName?: string;
  issuerName?: string;
  issueDate?: string;
}

export interface InvoiceFilters {
  from?: string;
  to?: string;
  recipientCnpj?: string;
  issuerCnpj?: string;
  number?: string;
  source?: string;
  status?: string;
  mismatchOnly?: boolean;
  orderBy?: string;
  direction?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
}

/** Colunas ordenáveis da tela → colunas do banco. 'store' ordena pela razão
 * social da nota: o apelido é junção de apresentação, não coluna. */
const SORTABLE: Record<string, keyof Prisma.InvoiceOrderByWithRelationInput> = {
  number: 'number',
  issuer: 'issuerName',
  store: 'recipientName',
  issueDate: 'issueDate',
  volumes: 'volumes',
  weight: 'grossWeight',
  totalValue: 'totalValue',
};

/** Declaração de função (não arrow) para o TypeScript estreitar tipos depois. */
function fail(message: string, field?: string): never {
  throw new BadRequestException(field ? { message, field } : { message });
}

function isPrismaError(e: unknown, code: string): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: string }).code === code
  );
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stores: StoresService,
  ) {}

  // ── escrita ────────────────────────────────────────────────────────────────

  async createManual(
    dto: CreateManualInvoice,
    operator?: string,
  ): Promise<{ invoice: InvoiceSummary; warnings: Warning[] }> {
    const accessKey = accessKeyDigits(dto.accessKey);
    if (!isValidAccessKey(accessKey)) {
      fail(
        'Chave de acesso inválida (44 dígitos e dígito verificador)',
        'accessKey',
      );
    }
    const fromKey = parseAccessKey(accessKey)!;

    const issueDate = dateFromIso(dto.issueDate);
    if (!issueDate) {
      fail('Data de emissão inválida (use AAAA-MM-DD)', 'issueDate');
    }

    const recipientCnpj = normalizeCnpj(dto.recipientCnpj);
    if (!isValidTaxId(recipientCnpj)) {
      fail('CNPJ/CPF do destinatário inválido', 'recipientCnpj');
    }

    if (
      dto.issuerCnpj &&
      normalizeCnpj(dto.issuerCnpj) !== fromKey.issuerCnpj
    ) {
      fail(
        'CNPJ do emitente não corresponde ao da chave de acesso',
        'issuerCnpj',
      );
    }

    const volumes = Math.trunc(dto.volumes ?? 0);
    const grossWeight = round3(dto.grossWeight ?? 0);
    if (volumes < 0 || grossWeight < 0) {
      fail('Volumes e peso não podem ser negativos', 'volumes');
    }
    if (volumes === 0 && grossWeight === 0) {
      fail(
        'Informe os volumes ou o peso do DANFE; sem um dos dois a nota não é cobrável',
        'volumes',
      );
    }

    const note = this.cleanNote(dto.note);

    const warnings: Warning[] = [];
    if (
      issueDate.getUTCFullYear() !== fromKey.year ||
      issueDate.getUTCMonth() + 1 !== fromKey.month
    ) {
      warnings.push({
        code: 'DATE_OUTSIDE_KEY_PERIOD',
        message:
          `A chave indica ${String(fromKey.month).padStart(2, '0')}/${fromKey.year} ` +
          `e a data informada é ${isoFromDate(issueDate)}; confira o DANFE.`,
      });
    }

    let row: InvoiceRow;
    try {
      row = await this.prisma.invoice.create({
        data: {
          accessKey,
          number: String(fromKey.number),
          series: String(fromKey.series),
          issueDate,
          issuerCnpj: fromKey.issuerCnpj,
          issuerName: (dto.issuerName ?? '').trim(),
          recipientCnpj,
          recipientName: (dto.recipientName ?? '').trim(),
          totalValue: round2(dto.totalValue ?? 0),
          carrierVolumes: volumes,
          species: cleanSpecies(dto.species ?? ''),
          grossWeight,
          volumes,
          itemVolumes: 0,
          itemsWeight: 0,
          volumeMismatch: false,
          source: SOURCE_MANUAL,
          status: STATUS_PENDING,
          note,
          createdBy: operator ?? null,
        },
      });
    } catch (e) {
      if (isPrismaError(e, 'P2002')) {
        throw new ConflictException({
          message: 'Já existe nota com essa chave de acesso',
          field: 'accessKey',
          accessKey,
        });
      }
      throw e;
    }
    return { invoice: await this.withStore(row), warnings };
  }

  async updateManual(
    rawKey: string,
    dto: UpdateManualInvoice,
    operator?: string,
  ): Promise<InvoiceSummary> {
    const { accessKey, current } = await this.requireManual(rawKey);

    const volumes =
      dto.volumes === undefined
        ? (current.carrierVolumes ?? 0)
        : Math.trunc(dto.volumes);
    const grossWeight =
      dto.grossWeight === undefined
        ? (current.grossWeight ?? 0)
        : round3(dto.grossWeight);
    if (volumes < 0 || grossWeight < 0) {
      fail('Volumes e peso não podem ser negativos', 'volumes');
    }
    if (volumes === 0 && grossWeight === 0) {
      fail('A nota tem que ter volumes ou peso', 'volumes');
    }

    const data: Prisma.InvoiceUpdateInput = {
      carrierVolumes: volumes,
      volumes, // sem itens, o snapshot espelha o transporte
      grossWeight,
      updatedBy: operator ?? null,
    };
    if (dto.species !== undefined) {
      data.species = cleanSpecies(dto.species);
    }
    if (dto.totalValue !== undefined) {
      data.totalValue = round2(dto.totalValue);
    }
    if (dto.note !== undefined) {
      data.note = this.cleanNote(dto.note);
    }
    if (dto.issuerName !== undefined) {
      data.issuerName = dto.issuerName.trim();
    }
    if (dto.recipientName !== undefined) {
      data.recipientName = dto.recipientName.trim();
    }
    if (dto.recipientCnpj !== undefined) {
      const doc = normalizeCnpj(dto.recipientCnpj);
      if (!isValidTaxId(doc)) {
        fail('CNPJ/CPF do destinatário inválido', 'recipientCnpj');
      }
      data.recipientCnpj = doc;
    }
    if (dto.issueDate !== undefined) {
      const issueDate = dateFromIso(dto.issueDate);
      if (!issueDate) {
        fail('Data de emissão inválida (use AAAA-MM-DD)', 'issueDate');
      }
      data.issueDate = issueDate;
    }

    const row: InvoiceRow = await this.prisma.invoice.update({
      where: { accessKey },
      data,
    });
    return this.withStore(row);
  }

  /** Baixa lógica: a nota sai da cobrança, mas fica no histórico. */
  async discard(rawKey: string, operator?: string): Promise<void> {
    const { accessKey } = await this.requireManual(rawKey);
    await this.prisma.invoice.update({
      where: { accessKey },
      data: { status: STATUS_DISCARDED, updatedBy: operator ?? null },
    });
  }

  // ── leitura ────────────────────────────────────────────────────────────────

  async list(filters: InvoiceFilters): Promise<Page<InvoiceSummary>> {
    const perPage = Math.min(
      Math.max(Math.trunc(filters.perPage ?? PER_PAGE_DEFAULT), 1),
      PER_PAGE_MAX,
    );
    const page = Math.max(Math.trunc(filters.page ?? 1), 1);

    const where: Prisma.InvoiceWhereInput = {
      status: filters.status ?? { not: STATUS_DISCARDED },
    };
    const from = dateFromIso(filters.from);
    const to = dateFromIso(filters.to);
    if (from || to) {
      where.issueDate = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    if (filters.recipientCnpj) {
      where.recipientCnpj = normalizeCnpj(filters.recipientCnpj);
    }
    if (filters.issuerCnpj) {
      const doc = normalizeCnpj(filters.issuerCnpj);
      if (doc) {
        where.issuerCnpj = { contains: doc };
      }
    }
    if (filters.number) {
      const numbers = filters.number
        .split(/[,;\s]+/)
        .map((n) => n.replace(/\D/g, ''))
        .filter(Boolean);
      if (numbers.length === 1) {
        where.number = { contains: numbers[0] };
      } else if (numbers.length > 1) {
        where.OR = numbers.map((n) => ({ number: { contains: n } }));
      }
    }
    if (filters.source) {
      where.source = filters.source;
    }
    if (filters.mismatchOnly) {
      where.volumeMismatch = true;
    }

    const column = SORTABLE[filters.orderBy ?? ''];
    const orderBy: Prisma.InvoiceOrderByWithRelationInput[] = column
      ? [
          { [column]: filters.direction === 'desc' ? 'desc' : 'asc' },
          { accessKey: 'asc' },
        ]
      : [{ issueDate: 'desc' }, { accessKey: 'asc' }];

    const rows: InvoiceRow[] = await this.prisma.invoice.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        items: {
          select: {
            packagingUsed: true,
            unit: true,
            status: true,
            description: true,
          },
        },
      },
    });
    const total = await this.prisma.invoice.count({ where });

    const nicknames = await this.stores.nicknameMap(
      rows.map((r) => r.recipientCnpj),
    );
    return {
      items: rows.map((r) => this.toSummary(r, nicknames)),
      total,
      page,
      perPage,
    };
  }

  async findByKey(rawKey: string): Promise<InvoiceDetail> {
    const accessKey = accessKeyDigits(rawKey);
    const row: InvoiceRow | null = await this.prisma.invoice.findUnique({
      where: { accessKey },
      include: { items: { orderBy: { seq: 'asc' } } },
    });
    if (!row) {
      throw new NotFoundException({ message: 'Nota não encontrada' });
    }
    const nicknames = await this.stores.nicknameMap([row.recipientCnpj]);
    return {
      ...this.toSummary(row, nicknames),
      netWeight: row.netWeight ?? 0,
      productsValue: row.productsValue ?? 0,
      items: (row.items ?? []).map((it) => ({
        seq: it.seq ?? 0,
        ean: it.ean ?? '',
        code: it.code ?? '',
        description: it.description ?? '',
        unit: it.unit ?? '',
        quantity: it.quantity ?? 0,
        value: it.value ?? 0,
        volumes: it.volumes ?? null,
        packagingUsed: it.packagingUsed ?? null,
        status: it.status ?? null,
      })),
    };
  }

  /** Notas do domínio para o cálculo; descartadas contam como ausentes. */
  async findByKeys(
    rawKeys: string[],
  ): Promise<{ invoices: Invoice[]; missing: string[] }> {
    const keys = [...new Set(rawKeys.map(accessKeyDigits).filter(Boolean))];
    if (!keys.length) {
      return { invoices: [], missing: [] };
    }
    const rows: InvoiceRow[] = await this.prisma.invoice.findMany({
      where: { accessKey: { in: keys }, status: { not: STATUS_DISCARDED } },
      include: { items: { orderBy: { seq: 'asc' } } },
    });
    const found = new Set(rows.map((r) => r.accessKey));
    return {
      invoices: rows.map(rowToInvoice),
      missing: keys.filter((k) => !found.has(k)),
    };
  }

  // ── apoio ──────────────────────────────────────────────────────────────────

  private cleanNote(note: string | undefined): string | null {
    const clean = (note ?? '').trim();
    if (clean.length > NOTE_MAX) {
      fail(`Observação deve ter no máximo ${NOTE_MAX} caracteres`, 'note');
    }
    return clean || null;
  }

  /** Só nota manual pendente pode ser corrigida ou descartada. */
  private async requireManual(
    rawKey: string,
  ): Promise<{ accessKey: string; current: InvoiceRow }> {
    const accessKey = accessKeyDigits(rawKey);
    const current: InvoiceRow | null = await this.prisma.invoice.findUnique({
      where: { accessKey },
    });
    if (!current) {
      throw new NotFoundException({ message: 'Nota não encontrada' });
    }
    if (current.source !== SOURCE_MANUAL || current.status !== STATUS_PENDING) {
      throw new ConflictException({
        message:
          'Só nota manual pendente pode ser alterada; esta já veio do XML ou foi reconciliada',
        source: current.source,
        status: current.status,
      });
    }
    return { accessKey, current };
  }

  private async withStore(row: InvoiceRow): Promise<InvoiceSummary> {
    const nicknames = await this.stores.nicknameMap([row.recipientCnpj]);
    return this.toSummary(row, nicknames);
  }

  private toSummary(
    row: InvoiceRow,
    nicknames: Map<string, string>,
  ): InvoiceSummary {
    const inv = rowToInvoice(row);
    const nickname = nicknames.get(inv.recipientCnpj);
    return {
      accessKey: inv.accessKey,
      number: inv.number,
      series: inv.series,
      issueDate: inv.issueDate,
      issuerCnpj: inv.issuerCnpj,
      issuerName: inv.issuerName,
      recipientCnpj: inv.recipientCnpj,
      recipientName: inv.recipientName,
      storeLabel: nickname ?? inv.recipientName,
      storeRegistered: nickname !== undefined,
      volumes: inv.volumes ?? 0,
      itemVolumes: inv.itemVolumes ?? 0,
      carrierVolumes: inv.carrierVolumes,
      grossWeight: inv.grossWeight,
      itemsWeight: inv.itemsWeight ?? 0,
      unloadWeight: inv.unloadWeight ?? 0,
      species: invoiceSpecies(inv.items, inv.species),
      totalValue: inv.totalValue,
      volumeMismatch: inv.volumeMismatch ?? false,
      source: inv.source ?? '',
      status: inv.status ?? '',
      note: inv.note ?? null,
    };
  }
}
