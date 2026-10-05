/**
 * Lojas destinatárias: CNPJ → apelido. O CNPJ vem da nota (é a chave do
 * agrupamento); o apelido é o rótulo que a operação reconhece no relatório.
 * Remover o apelido não mexe nas notas.
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { formatCnpj, isValidCnpj, normalizeCnpj } from '../domain/cnpj';
import { isoFromDate } from '../domain/dates';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STATUS_DISCARDED } from '../invoices/invoice.types';

const NICKNAME_MAX = 60;

export interface StoreDto {
  id: number;
  cnpj: string;
  cnpjFormatted: string;
  nickname: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveStoreResult {
  store: StoreDto;
  created: boolean;
  /** Outra loja já usa este apelido (aviso, não bloqueio). */
  duplicateNickname: boolean;
}

export interface UnregisteredStore {
  cnpj: string;
  cnpjFormatted: string;
  name: string;
  invoices: number;
  lastIssueDate: string;
}

export interface StoreRow {
  id: number;
  cnpj: string;
  nickname: string;
  createdAt: Date;
  updatedAt: Date;
}

const toDto = (row: StoreRow): StoreDto => ({
  id: row.id,
  cnpj: row.cnpj,
  cnpjFormatted: formatCnpj(row.cnpj),
  nickname: row.nickname,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string): Promise<{ items: StoreDto[]; total: number }> {
    const term = (search ?? '').trim();
    const digits = term.replace(/\D/g, '');
    const where: Prisma.StoreWhereInput | undefined = term
      ? {
          OR: [
            { nickname: { contains: term, mode: 'insensitive' } },
            ...(digits ? [{ cnpj: { contains: digits } }] : []),
          ],
        }
      : undefined;
    const rows: StoreRow[] = await this.prisma.store.findMany({ where });
    const items = rows
      .map(toDto)
      .sort(
        (a, b) =>
          collator.compare(a.nickname, b.nickname) ||
          a.cnpj.localeCompare(b.cnpj),
      );
    return { items, total: items.length };
  }

  /** Destinatários que já apareceram em notas (não descartadas) e não têm apelido. */
  async unregistered(): Promise<UnregisteredStore[]> {
    const registered = (
      await this.prisma.store.findMany({ select: { cnpj: true } })
    ).map((s) => s.cnpj);
    const where: Prisma.InvoiceWhereInput = {
      status: { not: STATUS_DISCARDED },
      ...(registered.length ? { recipientCnpj: { notIn: registered } } : {}),
    };
    const groups = await this.prisma.invoice.groupBy({
      by: ['recipientCnpj'],
      where,
      _count: { _all: true },
      _max: { issueDate: true },
    });
    const names = await this.prisma.invoice.findMany({
      where,
      distinct: ['recipientCnpj'],
      select: { recipientCnpj: true, recipientName: true },
      orderBy: { issueDate: 'desc' },
    });
    const nameOf = new Map(
      names.map((n) => [n.recipientCnpj, n.recipientName]),
    );
    return groups
      .map((g) => ({
        cnpj: g.recipientCnpj,
        cnpjFormatted: formatCnpj(g.recipientCnpj),
        name: nameOf.get(g.recipientCnpj) ?? '',
        invoices: g._count._all,
        lastIssueDate: isoFromDate(g._max.issueDate),
      }))
      .sort((a, b) => b.invoices - a.invoices || a.cnpj.localeCompare(b.cnpj));
  }

  async save(cnpj: string, nickname: string): Promise<SaveStoreResult> {
    const doc = normalizeCnpj(cnpj);
    if (!isValidCnpj(doc)) {
      throw new BadRequestException({
        message: 'CNPJ inválido',
        field: 'cnpj',
      });
    }
    const name = (nickname ?? '').trim();
    if (!name) {
      throw new BadRequestException({
        message: 'Apelido é obrigatório',
        field: 'nickname',
      });
    }
    if (name.length > NICKNAME_MAX) {
      throw new BadRequestException({
        message: `Apelido deve ter no máximo ${NICKNAME_MAX} caracteres`,
        field: 'nickname',
      });
    }

    const sameNickname = await this.prisma.store.findFirst({
      where: {
        nickname: { equals: name, mode: 'insensitive' },
        cnpj: { not: doc },
      },
    });
    const existing: StoreRow | null = await this.prisma.store.findUnique({
      where: { cnpj: doc },
    });
    const row: StoreRow = existing
      ? await this.prisma.store.update({
          where: { cnpj: doc },
          data: { nickname: name },
        })
      : await this.prisma.store.create({ data: { cnpj: doc, nickname: name } });

    return {
      store: toDto(row),
      created: !existing,
      duplicateNickname: sameNickname !== null,
    };
  }

  async remove(cnpj: string): Promise<void> {
    const doc = normalizeCnpj(cnpj);
    const existing = await this.prisma.store.findUnique({
      where: { cnpj: doc },
    });
    if (!existing) {
      throw new NotFoundException({
        message: 'Loja não cadastrada',
        field: 'cnpj',
      });
    }
    await this.prisma.store.delete({ where: { cnpj: doc } });
  }

  /** CNPJ → apelido para os CNPJs pedidos (só os cadastrados aparecem). */
  async nicknameMap(cnpjs: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(cnpjs.map(normalizeCnpj).filter(Boolean))];
    if (!unique.length) {
      return new Map();
    }
    const rows = await this.prisma.store.findMany({
      where: { cnpj: { in: unique } },
      select: { cnpj: true, nickname: true },
    });
    return new Map(rows.map((r) => [r.cnpj, r.nickname]));
  }
}
