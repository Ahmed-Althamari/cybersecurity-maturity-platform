import { MaturityLevel } from '@cmmp/shared';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const INITIATIVE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD'] as const;

export class UpdateInitiativeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

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
  @Type(() => Date)
  @IsDate()
  actualCompletionDate?: Date;

  @IsOptional()
  @IsIn(INITIATIVE_STATUSES)
  status?: (typeof INITIATIVE_STATUSES)[number];

  @IsOptional()
  @IsString()
  owner?: string;
}
