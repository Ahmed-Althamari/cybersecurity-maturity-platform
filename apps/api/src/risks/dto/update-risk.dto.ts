import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

const TREATMENTS = ['MITIGATE', 'ACCEPT', 'AVOID', 'TRANSFER', 'MONITOR'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED'];

export class UpdateRiskDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  threat?: string;

  @IsOptional()
  @IsString()
  vulnerability?: string;

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

  @IsOptional()
  @IsInt()
  @Min(0)
  residualRiskScore?: number;

  @IsOptional()
  @IsString()
  owner?: string;

  @IsOptional()
  @IsIn(TREATMENTS)
  treatment?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsISO8601()
  targetDate?: string;
}
