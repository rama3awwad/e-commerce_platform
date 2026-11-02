import { ApiProperty } from '@nestjs/swagger';
export class CategoryResponseDto { @ApiProperty({ format: 'uuid' }) id: string; @ApiProperty() name: string; @ApiProperty() slug: string; }
