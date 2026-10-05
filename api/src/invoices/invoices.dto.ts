/**
 * DTOs da borda HTTP de notas: só formato (tipo, presença, faixa). As regras
 * (DV da chave, competência, "sem volume e sem peso não é cobrável") ficam no
 * serviço, testadas sem HTTP.
 */
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { SOURCES, STATUSES } from './invoice.types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateManualInvoiceDto {
  /** 44 dígitos, com ou sem os espaços do DANFE. */
  @IsString()
  @MaxLength(60)
  accessKey!: string;

  @IsString()
  @Matches(ISO_DATE, { message: 'issueDate deve estar em AAAA-MM-DD' })
  issueDate!: string;

  @IsString()
  @MaxLength(20)
  recipientCnpj!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @IsString()
  @MaxLength(200)
  issuerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  issuerCnpj?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  volumes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  grossWeight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  species?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateManualInvoiceDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  volumes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  grossWeight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  species?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  recipientCnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuerName?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATE, { message: 'issueDate deve estar em AAAA-MM-DD' })
  issueDate?: string;
}

export class ListInvoicesDto {
  @IsOptional()
  @Matches(ISO_DATE, { message: 'from deve estar em AAAA-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'to deve estar em AAAA-MM-DD' })
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  recipientCnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  issuerCnpj?: string;

  /** Um ou vários números separados por vírgula, ponto e vírgula ou espaço. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  number?: string;

  @IsOptional()
  @IsIn([...SOURCES])
  source?: string;

  @IsOptional()
  @IsIn([...STATUSES])
  status?: string;

  /** 'true' na query string (Boolean('false') seria true, daí o Transform). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mismatchOnly?: boolean;

  @IsOptional()
  @IsIn([
    'number',
    'issuer',
    'store',
    'issueDate',
    'volumes',
    'weight',
    'totalValue',
  ])
  orderBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  direction?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;
}
