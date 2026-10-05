/**
 * Prisma falso para os testes de serviço: cada método é um jest.fn com um
 * retorno padrão vazio. Os specs sobrescrevem o que precisam e inspecionam
 * `mock.calls` para travar a consulta que o serviço faz.
 */
import type { PrismaService } from '../../src/prisma/prisma.service';

type Fn = jest.Mock;

export interface PrismaMock {
  product: { findMany: Fn; count: Fn; create: Fn; update: Fn; delete: Fn };
  productAlias: { findFirst: Fn; createMany: Fn };
  store: {
    findMany: Fn;
    findFirst: Fn;
    findUnique: Fn;
    create: Fn;
    update: Fn;
    delete: Fn;
  };
  invoice: {
    findMany: Fn;
    findUnique: Fn;
    count: Fn;
    create: Fn;
    update: Fn;
    groupBy: Fn;
  };
}

export function prismaMock(): PrismaMock {
  const resolved = (value: unknown) => jest.fn().mockResolvedValue(value);
  return {
    product: {
      findMany: resolved([]),
      count: resolved(0),
      create: resolved(null),
      update: resolved(null),
      delete: resolved(null),
    },
    productAlias: {
      findFirst: resolved(null),
      createMany: resolved({ count: 0 }),
    },
    store: {
      findMany: resolved([]),
      findFirst: resolved(null),
      findUnique: resolved(null),
      create: resolved(null),
      update: resolved(null),
      delete: resolved(null),
    },
    invoice: {
      findMany: resolved([]),
      findUnique: resolved(null),
      count: resolved(0),
      create: resolved(null),
      update: resolved(null),
      groupBy: resolved([]),
    },
  };
}

export const asPrisma = (mock: PrismaMock): PrismaService =>
  mock as unknown as PrismaService;

/** Erro no formato que o Prisma lança (código P2002 = unique, P2025 = não encontrado). */
export function prismaError(code: string): Error & { code: string } {
  return Object.assign(new Error(`prisma ${code}`), { code });
}
