import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

export class UpdateUsageLimitDto {
  // `null` means unlimited — @IsOptional() alone would also accept `undefined`, but this field
  // must be explicitly set (including to null) on every call, not silently skipped.
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsInt()
  @Min(1)
  dailyCallLimit!: number | null;
}
