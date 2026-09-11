import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

const RELATIONSHIPS = ['EQUIVALENT', 'PARTIAL', 'RELATED'];

export class CreateControlMappingDto {
  @IsUUID()
  sourceSubcategoryId!: string;

  @IsUUID()
  targetSubcategoryId!: string;

  @IsIn(RELATIONSHIPS)
  relationship!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
