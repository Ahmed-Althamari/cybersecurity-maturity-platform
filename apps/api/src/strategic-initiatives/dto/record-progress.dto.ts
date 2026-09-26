import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class RecordProgressDto {
  /** 'YYYY-MM' or a full 'YYYY-MM-DD' date -- either way it's normalised to that month's first day (see toMonthKey). */
  @IsString()
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, { message: 'month must be in YYYY-MM or YYYY-MM-DD format' })
  month!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  percentComplete!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
