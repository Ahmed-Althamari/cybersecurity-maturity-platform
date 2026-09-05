import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  // Same minimum as account creation (CreateUserDto) -- a password change
  // shouldn't be able to set a weaker password than account creation
  // requires in the first place.
  @IsString()
  @MinLength(12)
  newPassword!: string;
}
