import { IsIn, IsISO8601, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'];

export class CreateMilestoneDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
