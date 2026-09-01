import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAssessmentDto {
  @IsUUID()
  organisationId!: string;

  /** Slug of an existing Framework to assess against, e.g. "nist-csf". */
  @IsString()
  @MinLength(1)
  frameworkSlug!: string;

  /** Pins to an exact Framework version; omitted = the most recent active version. */
  @IsOptional()
  @IsString()
  frameworkVersion?: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Date)
  @IsDate()
  assessmentDate!: Date;
}
