import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class GenerateFromGapsDto {
  @IsUUID()
  organisationId!: string;

  @IsOptional()
  @IsUUID()
  assessmentId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}
