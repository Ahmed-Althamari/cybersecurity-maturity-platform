import { IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];

// percentComplete is deliberately absent here -- it can only move via POST
// .../progress (see StrategicInitiativesService.recordProgress), which both
// stamps a monthly history row and updates this cached field together, so the
// two can never drift apart the way an independent PATCH field would allow.
export class UpdateStrategicInitiativeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  strategicObjective?: string;

  @IsOptional()
  @IsString()
  owner?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  targetDate?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
