import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreatePinnedInsightDto {
  @IsUUID()
  organisationId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  imageBase64!: string;

  // JSON-stringified { categories: string[], series: { name: string, values: number[] }[] } —
  // only present for a chart extracted from a workbook's own embedded dashboard-sheet charts
  // (apps/api/src/data-analysis), since those are the only ones with real, known plotted data.
  @IsOptional()
  @IsString()
  chartData?: string;

  @IsOptional()
  @IsString()
  sourceFileName?: string;
}
