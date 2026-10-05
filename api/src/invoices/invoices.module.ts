import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { StoresModule } from '../stores/stores.module';
import { ImportPdfService } from './import-pdf.service';
import { ImportService } from './import.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  // StoresModule: o apelido da loja acompanha toda leitura de nota.
  // CatalogModule: a importação dá volumes aos itens pela cascata.
  imports: [StoresModule, CatalogModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, ImportService, ImportPdfService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
