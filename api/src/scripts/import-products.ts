/**
 * Carga do cadastro de produtos a partir da planilha do ERP, sem passar pela
 * API (útil na primeira carga ou em manutenção).
 *
 *   node dist/scripts/import-products.js <planilha.xlsx|csv>
 */
import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error(
      'Uso: node dist/scripts/import-products.js <planilha.xlsx|csv>',
    );
    process.exit(2);
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const report = await new ProductsService(prisma).importSpreadsheet(
      basename(file),
      readFileSync(file),
    );
    console.log(`Arquivo: ${report.file}`);
    console.log(`Colunas reconhecidas: ${JSON.stringify(report.columns)}`);
    console.log(
      `Linhas: ${report.rows} · processadas: ${report.processed} (criadas ${report.created}, atualizadas ${report.updated}) · puladas sem nome: ${report.skipped}`,
    );
    for (const w of report.warnings) {
      console.log(`  ⚠ ${w}`);
    }
    process.exitCode = report.processed > 0 ? 0 : 1;
  } catch (e) {
    const response = (e as { getResponse?: () => unknown }).getResponse?.();
    const message =
      response && typeof response === 'object' && 'message' in response
        ? String((response as { message: unknown }).message)
        : (e as Error).message;
    console.error(`Erro: ${message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
