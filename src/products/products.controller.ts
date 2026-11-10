import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { FileFilterCallback } from 'multer';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, openSync, readSync, closeSync, unlinkSync } from 'fs';
import { Role } from '../common/enums/role.enum';
import { Auth } from '../common/decorators/auth.decorator';
import { CodedException } from '../common/exceptions/coded.exception';
import { ProductsService } from './products.service';
import { CreateProductDto, ProductQueryDto, SetStockDto, UpdateProductDto } from './dto/product.dto';
import { CreateCategoryDto } from './dto/category.dto';
import { ApiArraySuccessResponse, ApiErrorResponse, ApiPaginatedResponse, ApiSuccessResponse } from '../common/swagger/swagger.decorators';
import { ProductResponseDto } from './dto/product-response.dto';
import { UpdateCategoryDto } from './dto/category.dto';
import { CategoryResponseDto } from './dto/category-response.dto';

const uploadDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp']);
function validateImageSignature(file: Express.Multer.File) {
  const bytes = Buffer.alloc(12);
  const fd = openSync(file.path, 'r');
  let length: number;
  try { length = readSync(fd, bytes, 0, bytes.length, 0); } finally { closeSync(fd); }
  const header = bytes.subarray(0, length);
  const isJpeg = header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isPng = header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = header.length >= 12 && header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP';
  if (isJpeg || isPng || isWebp) return;
  unlinkSync(file.path);
  throw new CodedException(400, 'INVALID_IMAGE_TYPE', 'Image must be jpeg, png, or webp');
}
function uploadOptions() {
  if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
  return { storage: diskStorage({ destination: uploadDir, filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`) }), limits: { fileSize: Number(process.env.UPLOAD_MAX_SIZE || 2097152) }, fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => { const extension = extname(file.originalname).toLowerCase(); const mimeAllowed = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype); if (!allowed.has(extension) || !mimeAllowed) return cb(new CodedException(400, 'INVALID_IMAGE_TYPE', 'Image must be jpeg, png, or webp')); cb(null, true); } };
}

@ApiTags('categories')
@ApiBearerAuth('JWT-auth')
@Auth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly products: ProductsService) {}
  @Get() @ApiOperation({ summary: 'List categories (any authenticated role)' }) @ApiArraySuccessResponse(CategoryResponseDto) list() { return this.products.listCategories(); }
  @Post() @Auth(Role.ADMIN) @ApiSuccessResponse(CategoryResponseDto, 201) create(@Body() dto: CreateCategoryDto) { return this.products.createCategory(dto); }
  @Patch(':id') @Auth(Role.ADMIN) @ApiSuccessResponse(CategoryResponseDto) @ApiErrorResponse(404, 'Category not found', 'Category not found', 'Not Found') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) { return this.products.updateCategory(id, dto); }
  @Delete(':id') @Auth(Role.ADMIN) @ApiSuccessResponse(CategoryResponseDto) @ApiErrorResponse(409, 'Category contains products', 'Category still contains products', 'Conflict') remove(@Param('id', ParseUUIDPipe) id: string) { return this.products.removeCategory(id); }
}

@ApiTags('products')
@ApiBearerAuth('JWT-auth')
@Auth()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}
  @Get() @ApiOperation({ summary: 'Filter products by category and name with pagination' }) @ApiPaginatedResponse(ProductResponseDto, 'Product page') list(@Query() query: ProductQueryDto) { return this.products.list(query); }
  @Get(':id') @ApiSuccessResponse(ProductResponseDto, 200, 'Product including inventory stub stock') @ApiErrorResponse(404, 'Product not found', 'Product not found', 'Not Found') @ApiErrorResponse(503, 'Inventory adapter unavailable', 'Inventory service is temporarily unavailable', 'Service Unavailable') find(@Param('id', ParseUUIDPipe) id: string) { return this.products.findOne(id); }
  @Post() @Auth(Role.ADMIN) @UseInterceptors(FileInterceptor('image', uploadOptions())) @ApiConsumes('multipart/form-data') @ApiBody({ schema: { type: 'object', required: ['name', 'price', 'categoryId', 'image'], properties: { name: { type: 'string' }, description: { type: 'string' }, price: { type: 'number' }, categoryId: { type: 'string', format: 'uuid' }, image: { type: 'string', format: 'binary' } } } }) @ApiErrorResponse(400, 'Invalid image or request fields', 'Image must be jpeg, png, or webp', 'Bad Request') @ApiErrorResponse(404, 'Category not found', 'Category not found', 'Not Found') @ApiSuccessResponse(ProductResponseDto, 201) async create(@Body() dto: CreateProductDto, @UploadedFile() file?: Express.Multer.File) { if (!file) throw new CodedException(400, 'IMAGE_REQUIRED', 'Product image is required'); try { validateImageSignature(file); return await this.products.create(dto, `/uploads/${file.filename}`); } catch (error) { this.deleteUpload(`/uploads/${file.filename}`); throw error; } }
  @Patch(':id') @Auth(Role.ADMIN) @UseInterceptors(FileInterceptor('image', uploadOptions())) @ApiConsumes('multipart/form-data') @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' }, price: { type: 'number' }, categoryId: { type: 'string', format: 'uuid' }, image: { type: 'string', format: 'binary' } } } }) @ApiSuccessResponse(ProductResponseDto) @ApiErrorResponse(404, 'Product or category not found', 'Product not found', 'Not Found') async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @UploadedFile() file?: Express.Multer.File) { if (file) validateImageSignature(file); const before = file ? await this.products.findOne(id) : undefined; try { const result = await this.products.update(id, dto, file ? `/uploads/${file.filename}` : undefined); if (file && before?.imageUrl) this.deleteUpload(before.imageUrl); return result; } catch (error) { if (file) this.deleteUpload(`/uploads/${file.filename}`); throw error; } }
  @Delete(':id') @Auth(Role.ADMIN) @ApiOperation({ summary: 'Deactivate a product' }) @ApiSuccessResponse(ProductResponseDto) remove(@Param('id', ParseUUIDPipe) id: string) { return this.products.remove(id); }
  @Patch(':id/stock') @Auth(Role.ADMIN) @ApiTags('inventory') @ApiSuccessResponse(ProductResponseDto) @ApiErrorResponse(503, 'Inventory adapter unavailable', 'Inventory service is temporarily unavailable', 'Service Unavailable') setStock(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetStockDto) { return this.products.setStock(id, dto.quantity); }
  private deleteUpload(url: string) { const filename = url.split('/').pop(); if (!filename || filename.includes('..')) return; const { unlinkSync, existsSync } = require('fs'); const path = join(uploadDir, filename); if (existsSync(path)) unlinkSync(path); }
}
