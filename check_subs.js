const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.pushSubscription.findMany().then(res => {
  console.log('Subscriptions:', res);
}).catch(e => {
  console.error(e);
}).finally(() => {
  prisma.$disconnect();
});
