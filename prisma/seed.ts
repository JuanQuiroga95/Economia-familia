import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  // ==========================================
  // Cuenta 1: Juan & Tania (contraseña actual)
  // ==========================================
  // Use existing password hash from env if available (preserves current credentials)
  const juantaniaPassword = process.env.MASTER_PASSWORD_HASH || await bcrypt.hash('juantania123', 10);

  const accountJT = await prisma.account.upsert({
    where: { username: 'juantania' },
    update: {},
    create: {
      username: 'juantania',
      password: juantaniaPassword,
      label: 'Juan & Tania',
    },
  });

  const juan = await prisma.profile.upsert({
    where: { name_accountId: { name: 'Juan', accountId: accountJT.id } },
    update: {},
    create: {
      name: 'Juan',
      avatar: '👨',
      accountId: accountJT.id,
    },
  });

  const tania = await prisma.profile.upsert({
    where: { name_accountId: { name: 'Tania', accountId: accountJT.id } },
    update: {},
    create: {
      name: 'Tania',
      avatar: '👩',
      accountId: accountJT.id,
    },
  });

  console.log('Cuenta Juan & Tania creada:', { juan, tania });

  // ==========================================
  // Cuenta 2: Edu & Mai
  // ==========================================
  const edumaiPassword = await bcrypt.hash('123456', 10);

  const accountEM = await prisma.account.upsert({
    where: { username: 'edumai' },
    update: {},
    create: {
      username: 'edumai',
      password: edumaiPassword,
      label: 'Edu & Mai',
    },
  });

  const edu = await prisma.profile.upsert({
    where: { name_accountId: { name: 'Edu', accountId: accountEM.id } },
    update: {},
    create: {
      name: 'Edu',
      avatar: '👨',
      accountId: accountEM.id,
    },
  });

  const mai = await prisma.profile.upsert({
    where: { name_accountId: { name: 'Mai', accountId: accountEM.id } },
    update: {},
    create: {
      name: 'Mai',
      avatar: '👩',
      accountId: accountEM.id,
    },
  });

  console.log('Cuenta Edu & Mai creada:', { edu, mai });

  // ==========================================
  // Categorías por defecto (para ambas cuentas)
  // ==========================================
  const defaultCategories = [
    { name: 'Supermercado', icon: '🛒', color: '#22c55e' },
    { name: 'Servicios', icon: '💡', color: '#3b82f6' },
    { name: 'Salidas', icon: '🍽️', color: '#f59e0b' },
    { name: 'Transporte', icon: '🚗', color: '#8b5cf6' },
    { name: 'Salud', icon: '🏥', color: '#ef4444' },
    { name: 'Educación', icon: '📚', color: '#06b6d4' },
    { name: 'Entretenimiento', icon: '🎮', color: '#ec4899' },
    { name: 'Hogar', icon: '🏠', color: '#14b8a6' },
    { name: 'Ropa', icon: '👕', color: '#f97316' },
    { name: 'Otros', icon: '📦', color: '#6b7280' },
  ];

  for (const account of [accountJT, accountEM]) {
    for (const cat of defaultCategories) {
      await prisma.category.upsert({
        where: { name_accountId: { name: cat.name, accountId: account.id } },
        update: {},
        create: { ...cat, accountId: account.id },
      });
    }
  }

  console.log('Categorías creadas para ambas cuentas');

  // ==========================================
  // Presupuesto quincenal de Juan
  // ==========================================
  await prisma.budgetConfig.upsert({
    where: { profileId: juan.id },
    update: {},
    create: {
      profileId: juan.id,
      firstHalfBudget: 50000,
      secondHalfBudget: 50000,
      currency: 'ARS',
      isActive: true,
    },
  });

  console.log('Presupuesto quincenal de Juan configurado');

  // ==========================================
  // Tipo de cambio inicial
  // ==========================================
  const now = new Date();
  await prisma.exchangeRate.upsert({
    where: {
      month_year: {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      },
    },
    update: {},
    create: {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      usdToArs: 1200,
      eurToArs: 1350,
      eurToUsd: 1.08,
    },
  });

  console.log('Tipo de cambio inicial configurado');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
