import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ProductsPrismaService } from './prisma/products-prisma.service';
import { INVENTORY_PORT, InventoryPort } from '../inventory/api/inventory.port';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto/product.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CodedException } from '../common/exceptions/coded.exception';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  constructor(private readonly prisma: ProductsPrismaService, @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort) {}

  async listCategories() { return this.prisma.category.findMany({ orderBy: { name: 'asc' } }); }
  createCategory(dto: CreateCategoryDto) { return this.prisma.category.create({ data: dto }); }
  async updateCategory(id: string, dto: UpdateCategoryDto) { if (!await this.prisma.category.findUnique({ where: { id } })) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Category not found' }); return this.prisma.category.update({ where: { id }, data: dto }); }
  async removeCategory(id: string) { if (!await this.prisma.category.findUnique({ where: { id } })) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Category not found' }); if (await this.prisma.product.count({ where: { categoryId: id } })) throw new ConflictException({ code: 'CONFLICT', message: 'Category still contains products' }); return this.prisma.category.delete({ where: { id } }); }
  async list(query: ProductQueryDto) {
    const { page = 1, limit = 10, search, category } = query;
    const where = { isActive: true, ...(category ? { categoryId: category } : {}), ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}) };
    const [rows, total] = await Promise.all([this.prisma.product.findMany({ where, include: { category: true }, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }), this.prisma.product.count({ where })]);
    let stocks: Record<string, number>;
    try { stocks = await this.inventory.getStocks(rows.map((p) => p.id)); }
    catch { throw new CodedException(503, 'INVENTORY_UNAVAILABLE', 'Inventory service is temporarily unavailable'); }
    return { items: rows.map((p) => ({ ...p, stock: stocks[p.id] })), meta: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page < Math.ceil(total / limit), hasPrev: page > 1 } };
  }
  async findOne(id: string) { const p = await this.prisma.product.findFirst({ where: { id, isActive: true }, include: { category: true } }); if (!p) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found' }); return { ...p, stock: await this.stock(id) }; }
 
  async create(dto: CreateProductDto, imageUrl?: string)
  {
    if (!await this.prisma.category.findUnique({ where: { id: dto.categoryId } }))
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Category not found' });
    const product = await this.prisma.product.create({ data: { ...dto, imageUrl, price: dto.price } });
    try {
      //await this.inventory.setStock(product.id, Number(process.env.STUB_DEFAULT_STOCK || 50));
      const initialStock = dto.stock !== undefined ? dto.stock : Number(process.env.STUB_DEFAULT_STOCK || 50);
      await this.inventory.setStock(product.id, initialStock);
    }
    catch {
      try { await this.prisma.product.delete({ where: { id: product.id } }); }
      catch (deleteError) {
        this.logger.error(`Failed to remove product ${product.id}
         after inventory initialization failed`, deleteError instanceof Error ? deleteError.stack : undefined);
      } throw new CodedException(503, 'INVENTORY_UNAVAILABLE', 'Inventory service is temporarily unavailable');
    } return this.findOne(product.id);
  }

  async update(id: string, dto: UpdateProductDto, imageUrl?: string) { await this.findOne(id); if (dto.categoryId && !await this.prisma.category.findUnique({ where: { id: dto.categoryId } })) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Category not found' }); const data = { ...dto, ...(imageUrl ? { imageUrl } : {}) }; await this.prisma.product.update({ where: { id }, data }); return this.findOne(id); }
  async setStock(id: string, quantity: number) { await this.findOne(id); try { await this.inventory.setStock(id, quantity); } catch { throw new CodedException(503, 'INVENTORY_UNAVAILABLE', 'Inventory service is temporarily unavailable'); } return this.findOne(id); }
  async remove(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } }); if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found' });
    return this.prisma.product.update({ where: { id }, data: { isActive: false } });
  }
  private async stock(id: string) { try { return await this.inventory.getStock(id); } catch { throw new CodedException(503, 'INVENTORY_UNAVAILABLE', 'Inventory service is temporarily unavailable'); } }
}
