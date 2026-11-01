import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('Admin@123', salt);

  // Create admin (top role in the system)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@store.com' },
    update: {},
    create: {
      email: 'admin@store.com',
      username: 'admin',
      password: hashedPassword,
      firstName: 'Store',
      lastName: 'Admin',
      role: Role.ADMIN,
      isActive: true,
    },
  });

  // Create test customer
  const customer = await prisma.user.upsert({
    where: { email: 'customer@test.com' },
    update: {},
    create: {
      email: 'customer@test.com',
      username: 'testcustomer',
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'Customer',
      role: Role.CUSTOMER,
      isActive: true,
    },
  });

  console.log('✅ Seed completed:');
  console.log('   - Admin:', admin.email);
  console.log('   - Customer:', customer.email);
  console.log('   - Default password for all: Admin@123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
