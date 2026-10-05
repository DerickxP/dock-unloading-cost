import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveStoreDto {
  /** Com ou sem máscara; o DV é validado no serviço. */
  @IsString()
  @MaxLength(20)
  cnpj!: string;

  @IsString()
  @MaxLength(60)
  nickname!: string;
}

export class ListStoresDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;
}
