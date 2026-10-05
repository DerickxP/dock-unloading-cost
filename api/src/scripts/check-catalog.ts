/**
 * Prova real da cascata contra o banco: resolve cada identificador informado
 * (EAN, código ou nome como vem na nota) e mostra por onde casou e quantos
 * volumes uma quantidade avulsa viraria.
 *
 *   node dist/scripts/check-catalog.js [--quantity 50] <ean|código|"nome"> ...
 */
import 'dotenv/config';

import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let quantity = 50;
  const terms: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--quantity') {
      quantity = Number(args[++i]);
    } else {
      terms.push(args[i]);
    }
  }
  if (!terms.length || !Number.isFinite(quantity)) {
    console.error(
      'Uso: node dist/scripts/check-catalog.js [--quantity 50] <ean|código|"nome"> ...',
    );
    process.exit(2);
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  let missing = 0;
  try {
    const catalog = new CatalogService(prisma);
    for (const term of terms) {
      const ref = { ean: term, code: term, name: term };
      const match = await catalog.findPackaging(ref);
      const volumes = await catalog.itemVolumes({
        ...ref,
        unit: 'UN',
        quantity,
      });
      if (match) {
        console.log(
          `OK     ${term} → ${match.code} ${match.name} | ${match.packaging}/${match.unitsPerPackage} via ${match.matchedBy} | ${quantity} UN = ${volumes.volumes} volume(s) (${volumes.status})`,
        );
      } else {
        missing++;
        console.log(
          `FALTA  ${term} → sem cadastro | ${quantity} UN = ${volumes.volumes} volume(s) brutos (${volumes.status})`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  process.exitCode = missing ? 1 : 0;
}

void main();
