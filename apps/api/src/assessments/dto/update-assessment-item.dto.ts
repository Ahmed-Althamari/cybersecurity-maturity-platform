import { ControlStatus, MaturityLevel, RiskLevel } from '@cmmp/shared';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateAssessmentItemDto {
  @IsOptional()
  @IsEnum(MaturityLevel)
  currentMaturity?: MaturityLevel;

  @IsOptional()
  @IsEnum(MaturityLevel)
  targetMaturity?: MaturityLevel;

  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  businessCriticality?: number;

  @IsOptional()
  @IsEnum(ControlStatus)
  controlStatus?: ControlStatus;

  @IsOptional()
  @IsString()
  rationale?: string;

  @IsOptional()
  @IsString()
  evidence?: string;

  @IsOptional()
  @IsString()
  assessorComments?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  remediationDueDate?: Date;
}
