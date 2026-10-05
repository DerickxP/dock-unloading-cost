/**
 * Cadastro de produtos e a cascata de busca que casa um item da nota com a
 * embalagem de compra.
 *
 * Cada fornecedor identifica o produto do seu jeito: uns mandam o EAN, outros
 * só o código interno, outros só a descrição. A busca tenta do identificador
 * mais confiável para o menos:
 *
 * 1. EAN, em todas as variantes (zeros à esquerda, GTIN-14 de caixa).
 * 2. Código do fornecedor.
 * 3. Nome exato, sem diferenciar maiúsculas.
 * 4. Alias aprendido (EAN ou nome normalizado que já casou antes).
 * 5. Nome normalizado (tokens ordenados), só quando aponta para um único
 *    produto. Um acerto aqui é aprendido como alias, então a próxima nota do
 *    mesmo fornecedor casa direto na etapa 4.
 *
 * Esta implementação em memória é a referência da regra; o serviço com banco
 * implementa o mesmo contrato (`VolumeConverter`).
 */
import { eanVariants } from './ean';
import { normalizeName } from './names';
import {
  ItemLookup,
  ItemVolumes,
  Packaging,
  VolumeItem,
  choosePackaging,
  computeItemVolumes,
} from './volumes';

export interface CatalogProduct extends Packaging {
  ean: string;
  code: string;
  name: string;
}

export type MatchedBy = 'ean' | 'code' | 'name' | 'alias' | 'normalized';

export interface PackagingMatch extends Packaging {
  code: string;
  name: string;
  matchedBy: MatchedBy;
}

export type AliasKind = 'ean' | 'name';

/** Chave de alias: EAN canônico ou nome normalizado. O serviço com banco grava
 * exatamente estas chaves, então memória e Postgres aprendem a mesma coisa. */
export interface AliasRef {
  kind: AliasKind;
  key: string;
}

/** Forma canônica do EAN para indexar: só dígitos, sem zeros à esquerda. */
export function canonicalEan(ean: string): string | null {
  const raw = ean.trim();
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  return raw.replace(/^0+/, '') || '0';
}

function pushTo<K>(
  index: Map<K, CatalogProduct[]>,
  key: K,
  product: CatalogProduct,
): void {
  const list = index.get(key);
  if (list) {
    list.push(product);
  } else {
    index.set(key, [product]);
  }
}

export class InMemoryCatalog {
  private readonly byEan = new Map<string, CatalogProduct[]>();
  private readonly byCode = new Map<string, CatalogProduct[]>();
  private readonly byName = new Map<string, CatalogProduct[]>();
  private readonly byNormalizedName = new Map<string, CatalogProduct[]>();
  /** 'ean:<chave>' ou 'name:<normalizado>' → código do produto. */
  private readonly aliases = new Map<string, string>();

  private static aliasKey(ref: AliasRef): string {
    return `${ref.kind}:${ref.key}`;
  }

  add(product: CatalogProduct): void {
    const key = canonicalEan(product.ean ?? '');
    if (key) {
      pushTo(this.byEan, key, product);
    }
    if (product.code) {
      pushTo(this.byCode, product.code.trim(), product);
    }
    const name = product.name.toUpperCase().trim();
    if (name) {
      pushTo(this.byName, name, product);
      pushTo(this.byNormalizedName, normalizeName(name), product);
    }
  }

  findPackaging(ref: ItemLookup): PackagingMatch | null {
    return (
      this.matchByEan(ref) ??
      this.matchByCode(ref) ??
      this.matchByExactName(ref) ??
      this.matchByAlias(ref) ??
      this.matchByNormalizedName(ref)
    );
  }

  /** Código aprendido para este EAN ou nome, ou `null`. Nunca consulta o cadastro. */
  findAlias(ref: ItemLookup): string | null {
    for (const alias of aliasRefs(ref)) {
      const code = this.aliases.get(InMemoryCatalog.aliasKey(alias));
      if (code) {
        return code;
      }
    }
    return null;
  }

  /** Grava o alias para o EAN e/ou nome informados, sem sobrescrever os existentes. */
  learnAlias(ref: ItemLookup, code: string): void {
    for (const alias of aliasRefs(ref)) {
      const key = InMemoryCatalog.aliasKey(alias);
      if (!this.aliases.has(key)) {
        this.aliases.set(key, code);
      }
    }
  }

  /** Regra completa de volumes para um item, usando este cadastro. */
  itemVolumes(item: VolumeItem): ItemVolumes {
    return computeItemVolumes(item, (i) => this.findPackaging(i));
  }

  private matchByEan(ref: ItemLookup): PackagingMatch | null {
    for (const variant of eanVariants(ref.ean)) {
      const key = canonicalEan(variant);
      const found = key ? this.byEan.get(key) : undefined;
      if (found) {
        return selectPackaging(found, 'ean');
      }
    }
    return null;
  }

  private matchByCode(ref: ItemLookup): PackagingMatch | null {
    const code = (ref.code ?? '').trim();
    const found = code ? this.byCode.get(code) : undefined;
    return found ? selectPackaging(found, 'code') : null;
  }

  private matchByExactName(ref: ItemLookup): PackagingMatch | null {
    const name = (ref.name ?? '').toUpperCase().trim();
    const found = name ? this.byName.get(name) : undefined;
    return found ? selectPackaging(found, 'name') : null;
  }

  private matchByAlias(ref: ItemLookup): PackagingMatch | null {
    const code = this.findAlias(ref);
    const found = code ? this.byCode.get(code) : undefined;
    return found ? selectPackaging(found, 'alias') : null;
  }

  private matchByNormalizedName(ref: ItemLookup): PackagingMatch | null {
    const normalized = normalizeName(ref.name);
    const found = normalized
      ? this.byNormalizedName.get(normalized)
      : undefined;
    if (!found) {
      return null;
    }
    const codes = new Set(found.map((p) => p.code));
    if (codes.size !== 1) {
      return null; // ambíguo: não casa nem aprende
    }
    const match = selectPackaging(found, 'normalized');
    this.learnAlias(ref, match.code);
    return match;
  }
}

/**
 * Chaves de alias derivadas de um item: EANs numéricos (canônicos, com as
 * variantes GS1) e o nome normalizado, quando não vazio. O EAN vem primeiro,
 * que é o identificador mais confiável.
 */
export function aliasRefs(ref: ItemLookup): AliasRef[] {
  const refs: AliasRef[] = [];
  const seen = new Set<string>();
  for (const variant of eanVariants(ref.ean)) {
    const key = canonicalEan(variant);
    if (key && !seen.has(key)) {
      seen.add(key);
      refs.push({ kind: 'ean', key });
    }
  }
  const normalized = normalizeName(ref.name);
  if (normalized) {
    refs.push({ kind: 'name', key: normalized });
  }
  return refs;
}

/** Entre as linhas que casaram, a embalagem que a doca recebe (master pack). */
export function selectPackaging(
  products: CatalogProduct[],
  matchedBy: MatchedBy,
): PackagingMatch {
  const chosen =
    (choosePackaging(products) as CatalogProduct | null) ?? products[0];
  return {
    code: chosen.code,
    name: chosen.name,
    packaging: chosen.packaging,
    unitsPerPackage: chosen.unitsPerPackage,
    matchedBy,
  };
}
