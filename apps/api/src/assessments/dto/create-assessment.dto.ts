import { IsISO8601, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAssessmentDto {
  @IsUUID()
  organisationId!: string;

  @IsUUID()
  frameworkId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  assessmentDate?: string;
}
