/**
 * Cálculo da descarga: a operação que gera a cobrança.
 *
 * Uma única fonte de números para o JSON da tela e para a planilha: os dois
 * consomem `build()`. O que este serviço garante além do domínio:
 * - recusa o cálculo se alguma chave pedida não existe ou foi descartada
 *   (cobrar sobre seleção incompleta é pior que não cobrar);
 * - emite avisos do que compromete o valor;
 * - registra quem gerou e quando, para o rodapé da planilha.
 *
 * Não persiste nada: o snapshot da nota é atualizado na escrita, não na leitura.
 */
import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';

import { groupByStore } from '../domain/grouping';
import type { Invoice } from '../domain/invoice';
import { InvoicesService } from '../invoices/invoices.service';
import { StoresService } from '../stores/stores.service';
import { ComputeRequest, MAX_KEYS, UnloadingResult } from './unloading.types';
import { unloadingWarnings } from './unloading.warnings';

export interface BuiltResult {
  result: UnloadingResult;
  /** Notas do cálculo, ordenadas: insumo da aba "Notas Selecionadas". */
  invoices: Invoice[];
  /** CNPJ → apelido, para rotular a loja na planilha. */
  labels: Map<string, string>;
}

@Injectable()
export class UnloadingService {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly stores: StoresService,
  ) {}

  async compute(
    request: ComputeRequest,
    operator: string,
    now: Date = new Date(),
  ): Promise<UnloadingResult> {
    return (await this.build(request, operator, now)).result;
  }

  async build(
    request: ComputeRequest,
    operator: string,
    now: Date = new Date(),
  ): Promise<BuiltResult> {
    const keys = [...new Set(request.accessKeys ?? [])];
    if (!keys.length) {
      throw new BadRequestException({
        message: 'Selecione ao menos uma nota',
        field: 'accessKeys',
      });
    }
    if (keys.length > MAX_KEYS) {
      throw new BadRequestException({
        message: `Máximo de ${MAX_KEYS} notas por cálculo`,
        field: 'accessKeys',
      });
    }

    const warnings = [];
    if (keys.length !== (request.accessKeys ?? []).length) {
      warnings.push({
        code: 'DUPLICATE_KEYS',
        message: 'Chaves repetidas na seleção foram consideradas uma vez.',
      });
    }

    const { invoices, missing } = await this.invoices.findByKeys(keys);
    if (missing.length) {
      throw new UnprocessableEntityException({
        message:
          'Algumas notas da seleção não existem mais (ou foram descartadas); recarregue a lista.',
        missing,
      });
    }

    // Ordem do relatório é garantia deste serviço: emissão mais recente
    // primeiro, chave como desempate.
    invoices.sort(
      (a, b) =>
        b.issueDate.localeCompare(a.issueDate) ||
        a.accessKey.localeCompare(b.accessKey),
    );

    const labels = await this.stores.nicknameMap(
      invoices.map((i) => i.recipientCnpj),
    );
    const grouped = groupByStore(
      invoices,
      request.method,
      request.unitPrice,
      labels,
    );
    warnings.push(...unloadingWarnings(grouped, invoices));

    return {
      result: {
        ...grouped,
        parameters: {
          method: request.method,
          unitPrice: request.unitPrice,
          generatedAt: now.toISOString(),
          generatedBy: operator,
        },
        warnings,
      },
      invoices,
      labels,
    };
  }
}
