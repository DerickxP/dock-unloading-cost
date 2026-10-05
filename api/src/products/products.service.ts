/**
 * Cadastro de produtos: cada linha é uma embalagem de compra (o mesmo código
 * pode ter CX/24 e UN/1). `nameNorm` é recalculado a cada escrita porque é por
 * ele que a cascata faz o último fallback.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { normalizeName } from '../domain/names';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseProductSpreadsheet } from './spreadsheet';

const PER_PAGE_MAX = 100;
const PER_PAGE_DEFAULT = 50;

export interface ProductDto {
  id: number;
  ean: string | null;
  code: string | null;
  name: string;
  packaging: string;
  unitsPerPackage: number;
}

export interface ProductFilters {
  search?: string;
  orderBy?: 'code' | 'ean' | 'name';
  direction?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
}

export interface ProductInput {
  ean?: string;
  code?: string;
  name: string;
  packaging: string;
  unitsPerPackage: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
}

export interface SpreadsheetImportReport {
  file: string;
  /** Cabeçalho reconhecido para cada papel. */
  columns: Record<string, string>;
  rows: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

interface ProductRow extends ProductDto {
  nameNorm?: string;
}

const toDto = (row: ProductRow): ProductDto => ({
  id: row.id,
  ean: row.ean,
  code: row.code,
  name: row.name,
  packaging: row.packaging,
  unitsPerPackage: row.unitsPerPackage,
});

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
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: ProductFilters): Promise<Page<ProductDto>> {
    const perPage = Math.min(
      Math.max(Math.trunc(filters.perPage ?? PER_PAGE_DEFAULT), 1),
      PER_PAGE_MAX,
    );
    const page = Math.max(Math.trunc(filters.page ?? 1), 1);

    const term = (filters.search ?? '').trim();
    let where: Prisma.ProductWhereInput = {};
    if (term) {
      const clauses: Prisma.ProductWhereInput[] = [
        { name: { contains: term, mode: 'insensitive' } },
      ];
      // Por tokens normalizados em qualquer ordem: nameNorm é token-set
      // ordenado, então cada token da busca precisa aparecer (AND).
      const tokens = normalizeName(term).split(' ').filter(Boolean);
      if (tokens.length) {
        clauses.push({
          AND: tokens.map((t) => ({ nameNorm: { contains: t } })),
        });
      }
      const digits = term.replace(/\D/g, '');
      if (digits) {
        clauses.push({ ean: { contains: digits } });
        clauses.push({ code: digits });
      }
      where = { OR: clauses };
    }

    const column = filters.orderBy ?? 'name';
    const orderBy: Prisma.ProductOrderByWithRelationInput[] = [
      { [column]: filters.direction === 'desc' ? 'desc' : 'asc' },
      { id: 'asc' }, // desempate: a paginação não embaralha linhas iguais
    ];

    const rows: ProductRow[] = await this.prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    });
    const total = await this.prisma.product.count({ where });
    return { items: rows.map(toDto), total, page, perPage };
  }

  async create(input: ProductInput): Promise<ProductDto> {
    const data = this.validate(input);
    try {
      const row: ProductRow = await this.prisma.product.create({ data });
      return toDto(row);
    } catch (e) {
      if (isPrismaError(e, 'P2002')) {
        throw new ConflictException({
          message:
            'Já existe esta embalagem para este código (código + embalagem + quantidade)',
        });
      }
      throw e;
    }
  }

  async update(id: number, input: Partial<ProductInput>): Promise<ProductDto> {
    const data: Prisma.ProductUpdateInput = {};
    if (input.ean !== undefined) {
      data.ean = input.ean.replace(/\D/g, '') || null;
    }
    if (input.code !== undefined) {
      data.code = input.code.trim() || null;
    }
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        fail('Informe o nome do produto', 'name');
      }
      data.name = name;
      data.nameNorm = normalizeName(name);
    }
    if (input.packaging !== undefined) {
      const packaging = input.packaging.toUpperCase().trim();
      if (!packaging) {
        fail('Informe a embalagem de compra (ex.: CX, FD, PCT)', 'packaging');
      }
      data.packaging = packaging;
    }
    if (input.unitsPerPackage !== undefined) {
      if (!(input.unitsPerPackage > 0)) {
        fail(
          'Quantidade por embalagem deve ser maior que zero',
          'unitsPerPackage',
        );
      }
      data.unitsPerPackage = input.unitsPerPackage;
    }
    try {
      const row: ProductRow = await this.prisma.product.update({
        where: { id },
        data,
      });
      return toDto(row);
    } catch (e) {
      if (isPrismaError(e, 'P2025')) {
        throw new NotFoundException({ message: 'Produto não encontrado' });
      }
      if (isPrismaError(e, 'P2002')) {
        throw new ConflictException({
          message:
            'Já existe esta embalagem para este código (código + embalagem + quantidade)',
        });
      }
      throw e;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (e) {
      if (isPrismaError(e, 'P2025')) {
        throw new NotFoundException({ message: 'Produto não encontrado' });
      }
      throw e;
    }
  }

  /**
   * Planilha do ERP (xlsx/csv): upsert pela tripla código + embalagem +
   * quantidade quando há código; sem código, cria. Linha ruim vira aviso e o
   * resto segue.
   */
  async importSpreadsheet(
    fileName: string,
    bytes: Uint8Array,
  ): Promise<SpreadsheetImportReport> {
    const parsed = await parseProductSpreadsheet(fileName, bytes);
    const warnings = [...parsed.warnings];
    let created = 0;
    let updated = 0;
    for (const row of parsed.rows) {
      const data = {
        ean: row.ean,
        code: row.code,
        name: row.name,
        nameNorm: normalizeName(row.name),
        packaging: row.packaging,
        unitsPerPackage: row.unitsPerPackage,
      };
      try {
        if (row.code) {
          const existing = await this.prisma.product.findUnique({
            where: {
              code_packaging_unitsPerPackage: {
                code: row.code,
                packaging: row.packaging,
                unitsPerPackage: row.unitsPerPackage,
              },
            },
            select: { id: true },
          });
          if (existing) {
            await this.prisma.product.update({
              where: { id: existing.id },
              data: { ean: row.ean, name: row.name, nameNorm: data.nameNorm },
            });
            updated++;
          } else {
            await this.prisma.product.create({ data });
            created++;
          }
        } else {
          await this.prisma.product.create({ data });
          created++;
        }
      } catch (e) {
        warnings.push(`Linha ${row.line}: ${(e as Error).message}`);
      }
    }
    return {
      file: fileName,
      columns: parsed.columns as Record<string, string>,
      rows: parsed.rows.length,
      processed: created + updated,
      created,
      updated,
      skipped: parsed.skipped,
      warnings,
    };
  }

  private validate(input: ProductInput): Prisma.ProductCreateInput {
    const name = (input.name ?? '').trim();
    if (!name) {
      fail('Informe o nome do produto', 'name');
    }
    const packaging = (input.packaging ?? '').toUpperCase().trim();
    if (!packaging) {
      fail('Informe a embalagem de compra (ex.: CX, FD, PCT)', 'packaging');
    }
    const units = Number(input.unitsPerPackage);
    if (!Number.isFinite(units) || units <= 0) {
      fail(
        'Quantidade por embalagem deve ser maior que zero',
        'unitsPerPackage',
      );
    }
    return {
      ean: (input.ean ?? '').replace(/\D/g, '') || null,
      code: (input.code ?? '').trim() || null,
      name,
      nameNorm: normalizeName(name),
      packaging,
      unitsPerPackage: units,
    };
  }
}
