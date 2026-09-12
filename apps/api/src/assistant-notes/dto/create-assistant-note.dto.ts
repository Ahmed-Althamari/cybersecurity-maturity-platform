import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateAssistantNoteDto {
  @IsUUID()
  organisationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}
