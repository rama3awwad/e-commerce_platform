import { Body, Controller, Delete, Param, Post, ParseUUIDPipe } from '@nestjs/common';
import { IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InternalApi } from '../common/internal-http/internal-api.decorator';
import { NotificationsPrismaService } from './prisma/notifications-prisma.service';
class NotifyDto { @ApiProperty() @IsUUID() userId:string; @ApiProperty() @IsString() @MinLength(1) type:string; @ApiProperty() @IsString() @MinLength(1) title:string; @ApiProperty() @IsString() @MinLength(1) message:string }
@InternalApi() @Controller('internal/notifications') export class InternalNotificationsController {constructor(private readonly prisma:NotificationsPrismaService){} @Post() async notify(@Body() dto:NotifyDto){await this.prisma.notification.create({data:dto});return {ok:true};} @Delete('users/:userId') async deleteAll(@Param('userId',ParseUUIDPipe) userId:string){await this.prisma.notification.deleteMany({where:{userId}});return {ok:true};}}
