/**
 *   POST /api/unloading/compute   resultado agrupado por loja (JSON)
 *   POST /api/unloading/export    a mesma conta, em .xlsx
 *
 * POST nos dois porque o insumo é a lista de chaves selecionadas e o resultado
 * não deve ser cacheado.
 */
import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import { OPERATOR_HEADER, operatorFrom } from '../auth/operator';
import { buildUnloadingWorkbook, reportFileName } from './excel-report';
import { ComputeUnloadingDto } from './unloading.dto';
import { UnloadingService } from './unloading.service';

const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('unloading')
export class UnloadingController {
  constructor(private readonly unloading: UnloadingService) {}

  @Post('compute')
  compute(
    @Body() dto: ComputeUnloadingDto,
    @Headers(OPERATOR_HEADER) operator?: string,
  ) {
    return this.unloading.compute(dto, operatorFrom(operator) ?? '');
  }

  @Post('export')
  async export(
    @Body() dto: ComputeUnloadingDto,
    @Res() res: Response,
    @Headers(OPERATOR_HEADER) operator?: string,
  ): Promise<void> {
    const now = new Date();
    const { result, invoices, labels } = await this.unloading.build(
      dto,
      operatorFrom(operator) ?? '',
      now,
    );
    const workbook = await buildUnloadingWorkbook(
      result,
      invoices,
      labels,
      now,
    );
    res.setHeader('Content-Type', XLSX_TYPE);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${reportFileName(now)}"`,
    );
    res.send(workbook);
  }
}
