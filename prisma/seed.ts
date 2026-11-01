import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('Admin@123', 10);
  await prisma.user.upsert({ where: { email: 'admin@store.com' }, update: {}, create: { email: 'admin@store.com', username: 'admin', password, firstName: 'Store', lastName: 'Admin', role: Role.ADMIN } });
  await prisma.user.upsert({ where: { email: 'customer@test.com' }, update: {}, create: { email: 'customer@test.com', username: 'testcustomer', password, firstName: 'Test', lastName: 'Customer', role: Role.CUSTOMER } });
  await prisma.user.upsert({ where: { email: 'customer2@test.com' }, update: {}, create: { email: 'customer2@test.com', username: 'testcustomer2', password, firstName: 'Second', lastName: 'Customer', role: Role.CUSTOMER } });

  const categoryRows = [
    { name: 'Clothing', slug: 'clothing' },
    { name: 'Accessories', slug: 'accessories' },
    { name: 'Footwear', slug: 'footwear' },
    { name: 'Home', slug: 'home' },
  ];
  const categories = {} as Record<string, string>;
  for (const category of categoryRows) {
    const row = await prisma.category.upsert({ where: { slug: category.slug }, update: { name: category.name }, create: category });
    categories[category.slug] = row.id;
  }
  const products = [
    ['Classic T-Shirt', 'Everyday cotton T-shirt', 19.99, 'clothing'],
    ['Cotton Hoodie', 'Soft cotton hoodie', 39.50, 'clothing'],
    ['Canvas Tote', 'Reusable canvas tote bag', 12.50, 'accessories'],
    ['Leather Belt', 'Classic everyday belt', 24.00, 'accessories'],
    ['Runner Sneakers', 'Lightweight running shoes', 64.99, 'footwear'],
    ['Leather Boots', 'Durable leather boots', 89.00, 'footwear'],
    ['Ceramic Mug', 'Stoneware coffee mug', 9.99, 'home'],
    ['Woven Blanket', 'Soft woven throw blanket', 45.00, 'home'],
  ] as const;
  for (const [name, description, price, slug] of products) {
    const existing = await prisma.product.findFirst({ where: { name } });
    if (existing) await prisma.product.update({ where: { id: existing.id }, data: { description, price, categoryId: categories[slug], isActive: true } });
    else await prisma.product.create({ data: { name, description, price, categoryId: categories[slug] } });
  }
  console.log('Seed complete: admin@store.com, customer@test.com, customer2@test.com (password Admin@123), four categories, eight products.');
}

main().catch((error) => { console.error('Seed failed', error); process.exit(1); }).finally(() => prisma.$disconnect());
