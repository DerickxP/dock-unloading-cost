/**
 *   GET    /api/products        lista paginada (busca por nome, tokens, EAN, código)
 *   POST   /api/products        cria embalagem                        [admin]
 *   POST   /api/products/import-spreadsheet  planilha do ERP (multipart `file`) [admin]
 *   PATCH  /api/products/:id    edita (nome recalcula nameNorm)       [admin]
 *   DELETE /api/products/:id    remove a embalagem                    [admin]
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { AdminGuard } from '../auth/admin.guard';
import {
  CreateProductDto,
  ListProductsDto,
  UpdateProductDto,
} from './products.dto';
import { ProductsService } from './products.service';

export const SPREADSHEET_MAX_BYTES = 20 * 1024 * 1024;

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsDto) {
    return this.products.list(query);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  /** Planilha do ERP (.xlsx ou .csv com ';'). Cadastro de 100 mil linhas cabe em 20 MB. */
  @Post('import-spreadsheet')
  @UseGuards(AdminGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: SPREADSHEET_MAX_BYTES } }),
  )
  importSpreadsheet(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException({
        message: 'Envie a planilha no campo "file"',
      });
    }
    return this.products.importSpreadsheet(file.originalname, file.buffer);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.products.remove(id);
  }
}
