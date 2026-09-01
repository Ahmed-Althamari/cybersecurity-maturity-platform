import { MaturityLevel } from '@cmmp/shared';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateInitiativeDto {
  @IsUUID()
  organisationId!: string;

  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  securityCapability?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  complexity?: number;

  @IsOptional()
  @IsEnum(MaturityLevel)
  currentMaturity?: MaturityLevel;

  @IsOptional()
  @IsEnum(MaturityLevel)
  targetMaturity?: MaturityLevel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  targetCompletionDate?: Date;

  @IsOptional()
  @IsString()
  owner?: string;
}
