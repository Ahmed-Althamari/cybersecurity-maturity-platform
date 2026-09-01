import { RiskLevel } from '@cmmp/shared';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRiskDto {
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
  threat?: string;

  @IsOptional()
  @IsString()
  vulnerability?: string;

  /** Links this risk to the specific control (AssessmentItem) it was identified against. */
  @IsOptional()
  @IsUUID()
  assessmentItemId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  likelihood?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  impact?: number;

  /** Omit to auto-derive from likelihood x impact (see RisksService.suggestRiskLevel). */
  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsString()
  owner?: string;

  @IsOptional()
  @IsString()
  treatment?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  targetDate?: Date;
}
