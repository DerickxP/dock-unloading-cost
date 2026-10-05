import { Module } from '@nestjs/common';

import { InvoicesModule } from '../invoices/invoices.module';
import { StoresModule } from '../stores/stores.module';
import { UnloadingController } from './unloading.controller';
import { UnloadingService } from './unloading.service';

@Module({
  imports: [InvoicesModule, StoresModule],
  controllers: [UnloadingController],
  providers: [UnloadingService],
})
export class UnloadingModule {}
