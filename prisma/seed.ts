import { prisma } from '../src/lib/prisma';

async function main() {
  // Crear perfiles
  const juan = await prisma.profile.upsert({
    where: { name: 'Juan' },
    update: {},
    create: {
      name: 'Juan',
      avatar: '👨',
    },
  });

  const tania = await prisma.profile.upsert({
    where: { name: 'Tania' },
    update: {},
    create: {
      name: 'Tania',
      avatar: '👩',
    },
  });

  console.log('Perfiles creados:', { juan, tania });

  // Crear categorías por defecto
  const categories = [
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

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
  }

  console.log('Categorías creadas:', categories.length);

  // Configurar presupuesto quincenal de Juan
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

  // Crear tipo de cambio inicial (mes actual)
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
