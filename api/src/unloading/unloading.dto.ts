import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

import { MAX_KEYS } from './unloading.types';

export class ComputeUnloadingDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Selecione ao menos uma nota' })
  @ArrayMaxSize(MAX_KEYS, {
    message: `Máximo de ${MAX_KEYS} notas por cálculo`,
  })
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  accessKeys!: string[];

  /** O domínio é permissivo; a borda não: só estes dois valores. */
  @IsIn(['volume', 'weight'], {
    message: 'method deve ser "volume" ou "weight"',
  })
  method!: 'volume' | 'weight';

  /** Número com ponto decimal; "2,50" é recusado (a conversão é do cliente). */
  @Type(() => Number)
  @IsNumber({}, { message: 'unitPrice deve ser número (use ponto decimal)' })
  @IsPositive({ message: 'unitPrice deve ser maior que zero' })
  unitPrice!: number;
}
