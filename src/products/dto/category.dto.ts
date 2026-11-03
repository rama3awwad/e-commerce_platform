import { IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
export class CreateCategoryDto {
  @ApiProperty() @IsString() @Length(2, 80) name: string;
  @ApiProperty() @IsString() @Length(2, 100) slug: string;
}
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
