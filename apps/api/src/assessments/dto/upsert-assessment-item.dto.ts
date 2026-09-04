import { ControlStatus, MaturityLevel, RiskLevel } from '@cmmp/shared';
import { IsEmail, IsEnum, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class UpsertAssessmentItemDto {
  @IsUUID()
  questionId!: string;

  @IsOptional()
  @IsEnum(MaturityLevel)
  currentMaturity?: MaturityLevel;

  @IsOptional()
  @IsEnum(MaturityLevel)
  targetMaturity?: MaturityLevel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

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
  @IsISO8601()
  remediationDueDate?: string;
}
