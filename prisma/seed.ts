import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export async function runSeed(prisma: PrismaClient) {
  if (process.env.FORCE_SEED !== 'true') {
    const [userCount, productCount] = await Promise.all([prisma.user.count(), prisma.product.count()]);
    if (userCount > 0 || productCount > 0) {
      console.log('Seed skipped: database already contains data');
      return;
    }
  }
  const password = await bcrypt.hash('Admin@123', 10);
  await prisma.user.upsert({ where: { email: 'admin@store.com' }, update: {}, create: { email: 'admin@store.com', username: 'admin', password, firstName: 'Store', lastName: 'Admin', role: Role.ADMIN } });
  await prisma.user.upsert({ where: { email: 'customer@test.com' }, update: {}, create: { email: 'customer@test.com', username: 'testcustomer', password, firstName: 'Test', lastName: 'Customer', role: Role.CUSTOMER } });
  await prisma.user.upsert({ where: { email: 'customer2@test.com' }, update: {}, create: { email: 'customer2@test.com', username: 'testcustomer2', password, firstName: 'Second', lastName: 'Customer', role: Role.CUSTOMER } });

  const categoryRows = [
    { name: 'Clothing', slug: 'clothing' },
    { name: 'Footwear', slug: 'footwear' },
    { name: 'Bags', slug: 'bags' },
    { name: 'Accessories', slug: 'accessories' },
    { name: 'Home', slug: 'home' },
    { name: 'Electronics', slug: 'electronics' },
    { name: 'Beauty & Personal Care', slug: 'beauty' },
    { name: 'Sports & Outdoors', slug: 'sports' },
  ];
  const categories = {} as Record<string, string>;
  for (const category of categoryRows) {
    const row = await prisma.category.upsert({ where: { slug: category.slug }, update: {}, create: category });
    categories[category.slug] = row.id;
  }
  const products = [
    { name: 'Classic T-Shirt', description: 'Midweight 100% cotton crew-neck T-shirt for everyday wear.', price: 19.99, slug: 'clothing', imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=85' },
    { name: 'Cotton Hoodie', description: 'Soft fleece-lined cotton blend hoodie with a front pouch pocket.', price: 49.50, slug: 'clothing', imageUrl: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=800&q=85' },
    { name: 'Relaxed Linen Shirt', description: 'Breathable long-sleeve linen blend shirt with a relaxed fit.', price: 42.00, slug: 'clothing', imageUrl: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?auto=format&fit=crop&w=800&q=85' },
    { name: 'Straight Fit Denim Jeans', description: 'Classic five-pocket denim jeans with a comfortable straight-leg fit.', price: 59.00, slug: 'clothing', imageUrl: 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=800&q=85' },
    { name: 'Runner Sneakers', description: 'Cushioned everyday running shoes with a breathable mesh upper.', price: 74.99, slug: 'footwear', imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=85' },
    { name: 'Leather Boots', description: 'Durable leather boots with a supportive sole for everyday wear.', price: 119.00, slug: 'footwear', imageUrl: 'https://images.unsplash.com/photo-1608256246200-53e635b5b65f?auto=format&fit=crop&w=800&q=85' },
    { name: 'Minimal Leather Sneakers', description: 'Low-profile casual sneakers with a clean leather finish.', price: 89.00, slug: 'footwear', imageUrl: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=800&q=85' },
    { name: 'Canvas Tote', description: 'Reusable heavy-canvas tote with reinforced handles and an inner pocket.', price: 18.50, slug: 'bags', imageUrl: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=800&q=85' },
    { name: 'Commuter Backpack', description: 'Water-resistant backpack with a padded laptop compartment and organizer pockets.', price: 54.00, slug: 'bags', imageUrl: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=85' },
    { name: 'Compact Crossbody Bag', description: 'Lightweight crossbody bag with adjustable strap and zip compartments.', price: 36.00, slug: 'bags', imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=85' },
    { name: 'Stainless Steel Watch', description: 'Water-resistant analog watch with a stainless-steel bracelet.', price: 119.00, slug: 'accessories', imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=85' },
    { name: 'Leather Belt', description: 'Classic genuine-leather belt with an adjustable fit and brushed metal buckle.', price: 39.00, slug: 'accessories', imageUrl: 'https://images.unsplash.com/photo-1624222247344-550fb8b3c1b4?auto=format&fit=crop&w=800&q=85' },
    { name: 'Polarized Sunglasses', description: 'UV400 polarized sunglasses with a lightweight everyday frame.', price: 34.99, slug: 'accessories', imageUrl: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=800&q=85' },
    { name: 'Leather Card Holder', description: 'Slim genuine-leather card holder with six card slots.', price: 22.00, slug: 'accessories', imageUrl: 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=800&q=85' },
    { name: 'Ceramic Mug', description: 'Hand-finished stoneware ceramic mug, 350 ml capacity, suitable for daily use.', price: 14.00, slug: 'home', imageUrl: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=800&q=85' },
    { name: 'Woven Blanket', description: 'Soft textured cotton throw blanket for a sofa or bedroom.', price: 48.00, slug: 'home', imageUrl: 'https://images.unsplash.com/photo-1600369671236-e74521d4b6ad?auto=format&fit=crop&w=800&q=85' },
    { name: 'Table Lamp with Linen Shade', description: 'Compact bedside table lamp with a warm, diffused light.', price: 39.00, slug: 'home', imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=85' },
    { name: 'Wireless Over-Ear Headphones', description: 'Bluetooth headphones with cushioned ear cups and up to 30 hours of playback.', price: 89.99, slug: 'electronics', imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=85' },
    { name: 'Portable Bluetooth Speaker', description: 'Compact wireless speaker with a rechargeable battery for indoor and outdoor use.', price: 45.00, slug: 'electronics', imageUrl: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=800&q=85' },
    { name: 'Mirrorless Digital Camera', description: 'Compact mirrorless camera body for travel and everyday photography.', price: 649.00, slug: 'electronics', imageUrl: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=85' },
    { name: 'Daily Hydration Serum', description: 'Lightweight facial serum formulated for a simple morning skincare routine.', price: 24.00, slug: 'beauty', imageUrl: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=800&q=85' },
    { name: 'Eau de Parfum', description: 'A balanced everyday fragrance in a 50 ml glass bottle.', price: 58.00, slug: 'beauty', imageUrl: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=800&q=85' },
    { name: 'Non-Slip Yoga Mat', description: 'Textured exercise mat with a carrying strap for home or studio workouts.', price: 32.00, slug: 'sports', imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=800&q=85' },
    { name: 'Insulated Water Bottle', description: 'Double-wall stainless-steel bottle that keeps drinks cold or hot for hours.', price: 27.50, slug: 'sports', imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=85' },
    { name: 'Adjustable Dumbbell Set', description: 'Space-saving adjustable dumbbell set for strength training at home.', price: 129.00, slug: 'sports', imageUrl: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=800&q=85' },
  ] as const;
  for (const { name, description, price, slug, imageUrl } of products) {
    const existing = await prisma.product.findFirst({ where: { name } });
    if (!existing) await prisma.product.create({ data: { name, description, price, categoryId: categories[slug], imageUrl } });
  }
  console.log(`Seed complete: demo users, ${categoryRows.length} categories, ${products.length} products with image URLs.`);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  runSeed(prisma).catch((error) => { console.error('Seed failed', error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
