import { Body, Controller, Post } from '@nestjs/common';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InternalApi } from '../common/internal-http/internal-api.decorator';
import { ProductsPrismaService } from './prisma/products-prisma.service';
class ByIdsDto { @ApiProperty({type:[String]}) @IsArray() @ArrayMaxSize(500) @IsUUID('4',{each:true}) ids:string[] }
@InternalApi() @Controller('internal/products') export class InternalProductsController {constructor(private readonly prisma:ProductsPrismaService){} @Post('by-ids') async byIds(@Body() dto:ByIdsDto){const rows=await this.prisma.product.findMany({where:{id:{in:dto.ids},isActive:true},select:{id:true,name:true,price:true}});return rows.map(p=>({...p,price:p.price.toString()}));}}
