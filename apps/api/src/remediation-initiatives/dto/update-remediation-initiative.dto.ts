import { MaturityLevel } from '@cmmp/shared';
import { IsEnum, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

const STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD'];

export class UpdateRemediationInitiativeDto {
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
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  targetCompletionDate?: string;

  @IsOptional()
  @IsISO8601()
  actualCompletionDate?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  owner?: string;
}
