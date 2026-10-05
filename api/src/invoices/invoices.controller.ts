/**
 *   GET    /api/invoices                lista paginada com filtros
 *   GET    /api/invoices/decode-key     decompõe a chave lida do DANFE
 *   POST   /api/invoices/manual         registra nota pendente do DANFE
 *   POST   /api/invoices/import-xml     upload de XML (multipart `files`, lote)
 *   POST   /api/invoices/import-pdf     upload de PDF do DANFE (multipart `files`, lote)
 *   GET    /api/invoices/:accessKey     uma nota com itens
 *   PATCH  /api/invoices/:accessKey     corrige nota manual pendente
 *   DELETE /api/invoices/:accessKey     descarte lógico               [admin]
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';

import { AdminGuard } from '../auth/admin.guard';
import { OPERATOR_HEADER, operatorFrom } from '../auth/operator';
import {
  accessKeyDigits,
  formatAccessKey,
  parseAccessKey,
} from '../domain/access-key';
import { formatCnpj } from '../domain/cnpj';
import { ImportPdfService } from './import-pdf.service';
import { ImportService } from './import.service';
import {
  CreateManualInvoiceDto,
  ListInvoicesDto,
  UpdateManualInvoiceDto,
} from './invoices.dto';
import { InvoicesService } from './invoices.service';

/** Um lote da doca: um dia de XMLs cabe com folga. */
export const IMPORT_MAX_FILES = 200;
/** XML de NF-e real tem dezenas de KB; 2 MB já é anomalia. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
/** Uma carga em PDF: até 20 arquivos de 10 MB. */
export const PDF_MAX_FILES = 20;
export const PDF_MAX_BYTES = 10 * 1024 * 1024;

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly importer: ImportService,
    private readonly pdfImporter: ImportPdfService,
  ) {}

  @Get()
  list(@Query() filters: ListInvoicesDto) {
    return this.invoices.list(filters);
  }

  /** Chave inválida não é erro HTTP: o formulário mostra o aviso enquanto digita. */
  @Get('decode-key')
  decodeKey(@Query('key') key?: string) {
    const parsed = parseAccessKey(key);
    if (!parsed) {
      return { valid: false, key: accessKeyDigits(key) };
    }
    return {
      valid: true,
      ...parsed,
      formatted: formatAccessKey(parsed.key),
      issuerCnpjFormatted: formatCnpj(parsed.issuerCnpj),
    };
  }

  @Post('manual')
  createManual(
    @Body() dto: CreateManualInvoiceDto,
    @Headers(OPERATOR_HEADER) operator?: string,
  ) {
    return this.invoices.createManual(dto, operatorFrom(operator));
  }

  /** Sem filtro por content-type: arquivo que não é NF-e entra no relato como erro. */
  @Post('import-xml')
  @UseInterceptors(
    FilesInterceptor('files', IMPORT_MAX_FILES, {
      limits: { fileSize: IMPORT_MAX_BYTES },
    }),
  )
  importXml(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Headers(OPERATOR_HEADER) operator?: string,
  ) {
    if (!files?.length) {
      throw new BadRequestException({
        message: 'Envie ao menos um arquivo XML no campo "files"',
      });
    }
    return this.importer.importXml(
      files.map((f) => ({ name: f.originalname, bytes: f.buffer })),
      operatorFrom(operator),
    );
  }

  /**
   * Upload de PDF do DANFE (multipart `files`, lote; cada PDF pode ser uma
   * carga com vários DANFEs). A nota entra pendente e o XML reconcilia depois.
   * Página ambígua vira erro no relato.
   */
  @Post('import-pdf')
  @UseInterceptors(
    FilesInterceptor('files', PDF_MAX_FILES, {
      limits: { fileSize: PDF_MAX_BYTES },
    }),
  )
  importPdf(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Headers(OPERATOR_HEADER) operator?: string,
  ) {
    if (!files?.length) {
      throw new BadRequestException({
        message: 'Envie ao menos um arquivo PDF no campo "files"',
      });
    }
    return this.pdfImporter.importPdf(
      files.map((f) => ({ name: f.originalname, bytes: f.buffer })),
      operatorFrom(operator),
    );
  }

  @Get(':accessKey')
  findByKey(@Param('accessKey') accessKey: string) {
    return this.invoices.findByKey(accessKey);
  }

  @Patch(':accessKey')
  updateManual(
    @Param('accessKey') accessKey: string,
    @Body() dto: UpdateManualInvoiceDto,
    @Headers(OPERATOR_HEADER) operator?: string,
  ) {
    return this.invoices.updateManual(accessKey, dto, operatorFrom(operator));
  }

  @Delete(':accessKey')
  @UseGuards(AdminGuard)
  @HttpCode(204)
  async discard(
    @Param('accessKey') accessKey: string,
    @Headers(OPERATOR_HEADER) operator?: string,
  ): Promise<void> {
    await this.invoices.discard(accessKey, operatorFrom(operator));
  }
}
