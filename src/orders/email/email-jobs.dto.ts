import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { EmailJobStatus } from '.prisma/orders-client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class EmailJobsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: EmailJobStatus }) @IsOptional() @IsEnum(EmailJobStatus) status?: EmailJobStatus;
}
export class UpdateMailSettingsDto {
  @ApiProperty({ description: 'When true, every email attempt fails on purpose (to demo retry and the DLQ)' }) @IsBoolean() forceFail: boolean;
}