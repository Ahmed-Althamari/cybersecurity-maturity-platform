import { IsIn, IsISO8601, IsInt, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';

const TREATMENTS = ['MITIGATE', 'ACCEPT', 'AVOID', 'TRANSFER', 'MONITOR'];

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

  @IsOptional()
  @IsUUID()
  assessmentItemId?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  likelihood!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  impact!: number;

  @IsOptional()
  @IsString()
  owner?: string;

  @IsOptional()
  @IsIn(TREATMENTS)
  treatment?: string;

  @IsOptional()
  @IsISO8601()
  targetDate?: string;
}
