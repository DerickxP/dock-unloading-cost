import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(14)
  ean?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  /** Embalagem de compra: CX, FD, PCT… */
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  packaging!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  unitsPerPackage!: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(14)
  ean?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  packaging?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  unitsPerPackage?: number;
}

export class ListProductsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['code', 'ean', 'name'])
  orderBy?: 'code' | 'ean' | 'name';

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
