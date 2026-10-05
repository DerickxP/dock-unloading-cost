/**
 * Regra de volumes de um item da NF-e.
 *
 * O que a doca descarrega é uma contagem de embalagens físicas; a nota traz
 * quantidade comercial em unidades variadas. A regra em três etapas:
 *
 * 1. A unidade já é uma embalagem (CX, FD, PCT…): a quantidade é o volume.
 * 2. A unidade é medida contínua (KG, L, M…): não gera volume; o custo dessa
 *    nota sai pelo peso.
 * 3. A unidade é avulsa (UN ou vazia): converte pela embalagem de compra do
 *    cadastro. Caixas fechadas contam como um volume cada; cada unidade solta
 *    também é um volume, porque ela é descarregada separadamente.
 */
import { CONTINUOUS_UNITS, PACKAGING_UNITS, baseUnit } from './units';

export type ItemVolumeStatus =
  /** Medida contínua, não vira volume. */
  | 'continuous'
  /** A unidade comercial já é a embalagem. */
  | 'packaging'
  /** Unidade conhecida que conta direto. */
  | 'direct'
  /** Convertido pela embalagem do cadastro. */
  | 'converted'
  /** Sem cadastro: quantidade bruta, precisa de revisão. */
  | 'uncataloged';

export interface ItemVolumes {
  volumes: number;
  /** Unidade/embalagem efetivamente usada; "UN*" marca falta de cadastro. */
  packagingUsed: string;
  status: ItemVolumeStatus;
}

/** Embalagem de compra cadastrada para um produto. */
export interface Packaging {
  packaging: string;
  unitsPerPackage: number;
}

/** Identificadores que a nota traz de um item, todos opcionais. */
export interface ItemLookup {
  ean?: string | null;
  code?: string | null;
  name?: string | null;
}

export interface VolumeItem extends ItemLookup {
  unit: string;
  quantity: number;
}

export type UnitClassification =
  { kind: 'resolved'; result: ItemVolumes } | { kind: 'needs_conversion' };

const LOOSE_UNITS: ReadonlySet<string> = new Set(['', 'UN', 'UNID', 'UNIDADE']);

/** Rótulo da unidade como veio na nota, só normalizado em caixa e espaços. */
function unitLabel(unit: string): string {
  return unit.toUpperCase().trim();
}

/**
 * Etapas 1 e 2 da regra, que não dependem do cadastro. Para a unidade avulsa
 * devolve `needs_conversion`, e o chamador consulta o cadastro só então.
 */
export function classifyUnit(
  unit: string,
  quantity: number,
): UnitClassification {
  const base = baseUnit(unit);
  const label = unitLabel(unit);

  if (CONTINUOUS_UNITS.has(base)) {
    return {
      kind: 'resolved',
      result: { volumes: 0, packagingUsed: label, status: 'continuous' },
    };
  }
  if (PACKAGING_UNITS.has(base)) {
    return {
      kind: 'resolved',
      result: {
        volumes: wholeVolumes(quantity),
        packagingUsed: label,
        status: 'packaging',
      },
    };
  }
  if (LOOSE_UNITS.has(base)) {
    return { kind: 'needs_conversion' };
  }
  return {
    kind: 'resolved',
    result: {
      volumes: wholeVolumes(quantity),
      packagingUsed: label,
      status: 'direct',
    },
  };
}

/** Volumes são inteiros; fração de embalagem não existe na doca. */
function wholeVolumes(quantity: number): number {
  return Number.isFinite(quantity) && quantity > 0 ? Math.trunc(quantity) : 0;
}

/**
 * Etapa 3: converte uma quantidade avulsa pela embalagem cadastrada.
 * Sem cadastro (ou com embalagem de quantidade zero), a quantidade bruta é
 * usada e o item é sinalizado para revisão.
 */
export function convertByPackaging(
  quantity: number,
  packaging: Packaging | null,
): ItemVolumes {
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  if (!packaging || !(packaging.unitsPerPackage > 0)) {
    return {
      volumes: Math.ceil(qty),
      packagingUsed: 'UN*',
      status: 'uncataloged',
    };
  }
  const fullPackages = Math.floor(qty / packaging.unitsPerPackage);
  const looseUnits = qty - fullPackages * packaging.unitsPerPackage;
  return {
    volumes: fullPackages + Math.ceil(looseUnits),
    packagingUsed: packaging.packaging,
    status: 'converted',
  };
}

/**
 * Regra completa para um item. `lookup` só é chamado quando a unidade é
 * avulsa, porque é a única etapa que precisa do cadastro (e, em produção, do
 * banco).
 */
export function computeItemVolumes(
  item: VolumeItem,
  lookup: (item: VolumeItem) => Packaging | null,
): ItemVolumes {
  const classified = classifyUnit(item.unit, item.quantity);
  if (classified.kind === 'resolved') {
    return classified.result;
  }
  return convertByPackaging(item.quantity, lookup(item));
}

/**
 * Entre várias embalagens cadastradas para o mesmo produto, escolhe a que a
 * doca de fato recebe: a maior embalagem física (master pack). Se só houver UN
 * ou medida contínua, fica a maior quantidade válida; sem quantidade válida,
 * a primeira; sem opções, `null`.
 */
export function choosePackaging(options: Packaging[]): Packaging | null {
  if (options.length === 0) {
    return null;
  }
  const valid = options.filter((o) => o.unitsPerPackage > 0);
  const physical = valid.filter((o) =>
    PACKAGING_UNITS.has(baseUnit(o.packaging)),
  );
  const pool = physical.length > 0 ? physical : valid;
  if (pool.length === 0) {
    return options[0];
  }
  return pool.reduce((best, o) =>
    o.unitsPerPackage > best.unitsPerPackage ? o : best,
  );
}
