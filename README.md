# 💰 EconoApp - Gestión Financiera Personal y de Pareja

Aplicación web de gestión financiera para Juan y Tania. Controla ingresos, gastos, ahorros e inversiones en múltiples monedas (ARS, USD, EUR) con presupuesto quincenal y estadísticas visuales.

## 🚀 Stack Tecnológico

- **Framework**: Next.js 15+ (App Router)
- **Frontend**: React 19, Tailwind CSS 4
- **Base de Datos**: Neon (PostgreSQL) + Prisma ORM
- **Autenticación**: NextAuth.js v4
- **Gráficos**: Recharts
- **Imágenes**: Cloudinary
- **Deploy**: Vercel

## 📋 Requisitos Previos

1. [Node.js](https://nodejs.org/) v18+
2. Cuenta en [Neon](https://neon.tech/) (base de datos PostgreSQL gratuita)
3. Cuenta en [Cloudinary](https://cloudinary.com/) (almacenamiento de imágenes gratuito)
4. Cuenta en [Vercel](https://vercel.com/) (deploy gratuito)

## 🛠️ Instalación Local

### 1. Clonar e instalar dependencias

```bash
git clone <tu-repo-url>
cd economia
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales:

```env
# Neon DB - Copiar Connection String desde el dashboard de Neon
DATABASE_URL="postgresql://user:pass@host.neon.tech/dbname?sslmode=require"

# NextAuth - Generar un secreto aleatorio
NEXTAUTH_SECRET="genera-con-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"

# Login maestro
MASTER_EMAIL="tu@email.com"
MASTER_PASSWORD_HASH="hash-bcrypt-de-tu-contraseña"

# Cloudinary - Copiar desde el dashboard de Cloudinary
CLOUDINARY_CLOUD_NAME="tu-cloud-name"
CLOUDINARY_API_KEY="tu-api-key"
CLOUDINARY_API_SECRET="tu-api-secret"
```

### 3. Generar hash de contraseña

```bash
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('TU_CONTRASEÑA_AQUI', 12));"
```

Copia el resultado y pégalo en `MASTER_PASSWORD_HASH`.

### 4. Inicializar la base de datos

```bash
# Crear las tablas en Neon
npx prisma db push

# Cargar datos iniciales (perfiles, categorías, presupuesto)
npm run db:seed
```

### 5. Ejecutar en desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## 🌐 Deploy en Vercel

### 1. Subir a GitHub

```bash
git add .
git commit -m "Initial commit - EconoApp"
git push origin main
```

### 2. Importar en Vercel

1. Ir a [vercel.com/new](https://vercel.com/new)
2. Importar el repositorio de GitHub
3. Agregar las variables de entorno (las mismas del `.env`)
4. Deploy

### 3. Variables de entorno en Vercel

En el dashboard de Vercel → Settings → Environment Variables, agregar:

| Variable | Valor |
|----------|-------|
| `DATABASE_URL` | URL de conexión de Neon |
| `NEXTAUTH_SECRET` | Tu secreto generado |
| `NEXTAUTH_URL` | `https://tu-app.vercel.app` |
| `MASTER_EMAIL` | Tu email de login |
| `MASTER_PASSWORD_HASH` | Hash bcrypt de tu contraseña |
| `CLOUDINARY_CLOUD_NAME` | Tu cloud name de Cloudinary |
| `CLOUDINARY_API_KEY` | Tu API key de Cloudinary |
| `CLOUDINARY_API_SECRET` | Tu API secret de Cloudinary |

### 4. Inicializar la base de datos (post-deploy)

Desde tu máquina local (con el `.env` configurado):

```bash
npx prisma db push
npm run db:seed
```

## 📱 Funcionalidades

### Dashboard
- Resumen mensual de ingresos, gastos y balance
- Gráfico de barras: Ingresos vs Gastos (últimos 6 meses)
- Gráfico de dona: Desglose por categoría
- Tracker de presupuesto quincenal de Juan

### Ingresos
- Registro por perfil (Juan/Tania)
- Multi-moneda (ARS, USD, EUR)

### Gastos
- Gastos Propios o Compartidos (con split configurable)
- Categorías con colores e íconos
- Subida de comprobantes/facturas (Cloudinary)
- Descuento automático del presupuesto quincenal

### Ahorros
- Metas de ahorro con barra de progreso
- Depósitos y retiros
- Multi-moneda

### Inversiones
- Tipos: Plazo Fijo, FCI, Acciones, Crypto, Bonos
- Tasa de retorno y vencimiento
- Resumen por moneda

### Configuración
- Tipo de cambio mensual
- Gestión de categorías
- Presupuesto quincenal configurable

## 🗃️ Estructura de la Base de Datos

```
Profile        → Perfiles (Juan, Tania)
Category       → Categorías de gasto
Income         → Ingresos mensuales
Expense        → Gastos (propios/compartidos)
SavingsGoal    → Metas de ahorro
SavingsTransaction → Movimientos de ahorro
Investment     → Inversiones
ExchangeRate   → Tipo de cambio mensual
BudgetConfig   → Presupuesto quincenal
```

## 📝 Licencia

Proyecto privado - Juan & Tania © 2026
