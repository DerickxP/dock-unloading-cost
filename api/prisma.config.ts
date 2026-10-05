import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` não conecta; a URL só é usada por migrate/db.
    url: process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/dock',
  },
});
