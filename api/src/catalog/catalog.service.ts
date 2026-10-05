/**
 * Cadastro de produtos no Postgres: a mesma cascata do `InMemoryCatalog`
 * (que é a especificação testada), consulta a consulta:
 *
 *   EAN (variantes GS1) → código → nome exato (sem caixa) → alias gravado →
 *   nome normalizado (só quando único) + aprendizado do alias
 *
 * Implementa `VolumeConverter`, então o recálculo de uma nota usa este serviço
 * em produção e o catálogo em memória nos testes, sem mudar a regra.
 */
import { Injectable } from '@nestjs/common';

import {
  CatalogProduct,
  MatchedBy,
  PackagingMatch,
  aliasRefs,
  selectPackaging,
} from '../domain/catalog';
import { eanVariants } from '../domain/ean';
import { normalizeName } from '../domain/names';
import type { VolumeConverter } from '../domain/unloading';
import {
  ItemLookup,
  ItemVolumes,
  VolumeItem,
  classifyUnit,
  convertByPackaging,
} from '../domain/volumes';
import { PrismaService } from '../prisma/prisma.service';

/** Linha de `products` como o Prisma devolve. */
export interface ProductRow {
  id: number;
  ean: string | null;
  code: string | null;
  name: string;
  packaging: string;
  unitsPerPackage: number;
}

const ALIAS_SOURCE = 'auto_name_norm';

const toProduct = (row: ProductRow): CatalogProduct => ({
  ean: row.ean ?? '',
  code: row.code ?? '',
  name: row.name,
  packaging: row.packaging,
  unitsPerPackage: row.unitsPerPackage,
});

@Injectable()
export class CatalogService implements VolumeConverter {
  constructor(private readonly prisma: PrismaService) {}

  async findPackaging(ref: ItemLookup): Promise<PackagingMatch | null> {
    const code = (ref.code ?? '').trim();
    const name = (ref.name ?? '').trim();
    const variants = eanVariants(ref.ean);

    let rows: ProductRow[] = [];
    let matchedBy: MatchedBy = 'ean';

    if (variants.length) {
      rows = await this.prisma.product.findMany({
        where: { ean: { in: variants } },
      });
    }
    if (!rows.length && code) {
      rows = await this.prisma.product.findMany({ where: { code } });
      matchedBy = 'code';
    }
    if (!rows.length && name) {
      rows = await this.prisma.product.findMany({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      matchedBy = 'name';
    }
    if (!rows.length) {
      const aliasCode = await this.findAlias(ref);
      if (aliasCode) {
        rows = await this.prisma.product.findMany({
          where: { code: aliasCode },
        });
        matchedBy = 'alias';
      }
    }
    if (!rows.length && name) {
      const candidates = await this.prisma.product.findMany({
        where: { nameNorm: normalizeName(name) },
      });
      const codes = new Set(
        candidates.map((c) => c.code).filter((c): c is string => !!c),
      );
      if (codes.size === 1) {
        rows = candidates;
        matchedBy = 'normalized';
        await this.learnAlias(ref, [...codes][0]);
      }
    }
    if (!rows.length) {
      return null;
    }
    return selectPackaging(rows.map(toProduct), matchedBy);
  }

  /** Código já aprendido para o EAN (prioridade) ou para o nome normalizado. */
  async findAlias(ref: ItemLookup): Promise<string | null> {
    const refs = aliasRefs(ref);
    if (!refs.length) {
      return null;
    }
    const alias = await this.prisma.productAlias.findFirst({
      where: { OR: refs.map((r) => ({ kind: r.kind, key: r.key })) },
      orderBy: { kind: 'asc' }, // 'ean' antes de 'name'
    });
    return alias?.code ?? null;
  }

  /**
   * Grava o vínculo descoberto sem sobrescrever os existentes. O aprendizado é
   * oportunista: falha de escrita não pode derrubar a busca que já acertou.
   */
  async learnAlias(ref: ItemLookup, code: string): Promise<void> {
    const data = aliasRefs(ref).map((r) => ({
      ...r,
      code,
      source: ALIAS_SOURCE,
    }));
    if (!data.length) {
      return;
    }
    try {
      await this.prisma.productAlias.createMany({ data, skipDuplicates: true });
    } catch {
      // sem log do conteúdo: pode carregar dados de nota
    }
  }

  /** Regra completa de volumes de um item; só consulta o banco para UN. */
  async itemVolumes(item: VolumeItem): Promise<ItemVolumes> {
    const classified = classifyUnit(item.unit, item.quantity);
    if (classified.kind === 'resolved') {
      return classified.result;
    }
    return convertByPackaging(item.quantity, await this.findPackaging(item));
  }
}
