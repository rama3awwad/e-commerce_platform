import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '.prisma/products-client';
import { ProductsPrismaService } from './prisma/products-prisma.service';
import { INVENTORY_PORT, InventoryPort } from '../inventory/api/inventory.port';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto/product.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CodedException } from '../common/exceptions/coded.exception';
import { CacheService } from '../common/cache/cache.service';
import { RecentWritesService } from '../common/cache/recent-writes.service';
import { setResponseHeader } from '../common/perf/response-headers';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);
  constructor(
    private readonly prisma: ProductsPrismaService,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
    private readonly cache: CacheService,
    private readonly recentWrites: RecentWritesService,
  ) {}

  // ===== المتطلب الثالث: مسار القراءة =====
  // 1) Redis إن وجد المفتاح  2) نسخة القراءة  3) القاعدة الأساسية إذا حصل تعديل خلال آخر ثوانٍ.
  // المخزون لا يُخزّن أبداً: يُقرأ حيّاً من خدمة المخزون بنداء gRPC واحد (GetStocks).
  private async reader(): Promise<PrismaClient> {
    const usePrimary = !this.prisma.hasReplica || await this.recentWrites.isRecent('products');
    setResponseHeader('X-Read-Source', usePrimary ? 'primary' : 'replica');
    return usePrimary ? this.prisma : this.prisma.readClient;
  }

  private async cacheKey(...parts: (string | number | undefined)[]) {
    return `products:v${await this.cache.version('products')}:${parts.map((p) => p ?? '').join(':')}`;
  }

  /**
   * بعد أي كتابة: نبطل كل كاش المنتجات ونقرأ من القاعدة الأساسية لبضع ثوانٍ.
   * إبطال ثانٍ بعد انتهاء النافذة (delayed double delete): لو طلب قراءة بدأ قبل التعديل
   * وكتب نسخة قديمة في الكاش بعد الإبطال الأول، يُمسح هنا بدل أن يبقى حتى انتهاء TTL.
   */
  private async afterWrite() {
    await this.recentWrites.mark('products');
    await this.cache.invalidate('products');
    setTimeout(() => void this.cache.invalidate('products'), this.recentWrites.windowMs).unref();
  }

  async listCategories() {
    return this.cache.getOrLoad(await this.cacheKey('categories'), async () => (await this.reader()).category.findMany({ orderBy: { name: 'asc' } }));
  }
  async createCategory(dto: CreateCategoryDto) { const category = await this.prisma.category.create({ data: dto }); await this.afterWrite(); return category; }
  async updateCategory(id: string, dto: UpdateCategoryDto) { if (!await this.prisma.category.findUnique({ where: { id } })) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Category not found' }); const category = await this.prisma.category.update({ where: { id }, data: dto }); await this.afterWrite(); return category; }
  async removeCategory(id: string) { if (!await this.prisma.category.findUnique({ where: { id } })) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Category not found' }); if (await this.prisma.product.count({ where: { categoryId: id } })) throw new ConflictException({ code: 'CONFLICT', message: 'Category still contains products' }); const category = await this.prisma.category.delete({ where: { id } }); await this.afterWrite(); return category; }
  async list(query: ProductQueryDto) {
    const { page = 1, limit = 10, search, category } = query;
    const where = { isActive: true, ...(category ? { categoryId: category } : {}), ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}) };
    const key = await this.cacheKey('list', page, limit, category, search?.toLowerCase());
    const { rows, total } = await this.cache.getOrLoad(key, async () => {
      const reader = await this.reader();
      const [rows, total] = await Promise.all([reader.product.findMany({ where, include: { category: true }, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }), reader.product.count({ where })]);
      return { rows, total };
    });
    let stocks: Record<string, number>;
    try { stocks = await this.inventory.getStocks(rows.map((p) => p.id)); }
    catch { throw new CodedException(503, 'INVENTORY_UNAVAILABLE', 'Inventory service is temporarily unavailable'); }
    return { items: rows.map((p) => ({ ...p, stock: stocks[p.id] })), meta: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page < Math.ceil(total / limit), hasPrev: page > 1 } };
  }
  async findOne(id: string) {
    const product = await this.cache.getOrLoad(await this.cacheKey('detail', id), async () => (await this.reader()).product.findFirst({ where: { id, isActive: true }, include: { category: true } }));
    if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found' });
    return { ...product, stock: await this.stock(id) };
  }

  /** قراءة مباشرة من القاعدة الأساسية بدون كاش — تُستخدم داخل عمليات الكتابة. */
  async findOnePrimary(id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, isActive: true }, include: { category: true } });
    if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found' });
    return { ...product, stock: await this.stock(id) };
  }
 
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
    }
    await this.afterWrite();
    return this.findOnePrimary(product.id);
  }

  async update(id: string, dto: UpdateProductDto, imageUrl?: string) { await this.findOnePrimary(id); if (dto.categoryId && !await this.prisma.category.findUnique({ where: { id: dto.categoryId } })) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Category not found' }); const data = { ...dto, ...(imageUrl ? { imageUrl } : {}) }; await this.prisma.product.update({ where: { id }, data }); await this.afterWrite(); return this.findOnePrimary(id); }
  async setStock(id: string, quantity: number) { await this.findOnePrimary(id); try { await this.inventory.setStock(id, quantity); } catch { throw new CodedException(503, 'INVENTORY_UNAVAILABLE', 'Inventory service is temporarily unavailable'); } return this.findOnePrimary(id); }
  async remove(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } }); if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found' });
    const removed = await this.prisma.product.update({ where: { id }, data: { isActive: false } });
    await this.afterWrite();
    return removed;
  }
  private async stock(id: string) { try { return await this.inventory.getStock(id); } catch { throw new CodedException(503, 'INVENTORY_UNAVAILABLE', 'Inventory service is temporarily unavailable'); } }
}
