/**
 *   GET    /api/stores                 lista (busca por apelido ou CNPJ)
 *   GET    /api/stores/unregistered    destinatários de notas sem apelido
 *   POST   /api/stores                 upsert por CNPJ            [admin]
 *   DELETE /api/stores/:cnpj           remove o apelido           [admin]
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AdminGuard } from '../auth/admin.guard';
import { ListStoresDto, SaveStoreDto } from './stores.dto';
import { StoresService } from './stores.service';

@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get()
  list(@Query() query: ListStoresDto) {
    return this.stores.list(query.search);
  }

  @Get('unregistered')
  unregistered() {
    return this.stores.unregistered();
  }

  @Post()
  @UseGuards(AdminGuard)
  save(@Body() dto: SaveStoreDto) {
    return this.stores.save(dto.cnpj, dto.nickname);
  }

  @Delete(':cnpj')
  @UseGuards(AdminGuard)
  @HttpCode(204)
  async remove(@Param('cnpj') cnpj: string): Promise<void> {
    await this.stores.remove(cnpj);
  }
}
