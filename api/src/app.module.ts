import { Module } from '@nestjs/common';

import { CatalogModule } from './catalog/catalog.module';
import { HealthController } from './health/health.controller';
import { InvoicesModule } from './invoices/invoices.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { StoresModule } from './stores/stores.module';
import { UnloadingModule } from './unloading/unloading.module';

@Module({
  imports: [
    PrismaModule,
    CatalogModule,
    StoresModule,
    ProductsModule,
    InvoicesModule,
    UnloadingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
