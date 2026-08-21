# 💰 EconoApp - Gestión Financiera Personal y de Pareja

Aplicación web de gestión financiera para Juan y Tania. Controla ingresos, gastos, ahorros e inversiones en múltiples monedas (ARS, USD, EUR) con presupuesto quincenal y estadísticas visuales.

## 🚀 Stack Tecnológico

- **Framework**: Next.js 16 (App Router)
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

### Tarjetas de crédito
- Consumos en cuotas asignados al resumen que corresponde según el día de cierre
- El consumo no es gasto: el gasto nace al pagar el resumen
- Deuda arrastrada, cuotas a futuro y crédito disponible

### Préstamos
- Carga por valor de cuota, total a devolver o cálculo por TNA (sistema francés)
- Plan de cuotas completo, con atrasos y adelantos
- Préstamos tomados (generan gasto) y otorgados (generan ingreso)

### Agenda
- Checklist de gastos previstos del mes: no afecta el balance
- Fijos que se repiten solos todos los meses y eventuales
- Agrupado por quincena, con el total de plata que hace falta
- Un ítem se puede convertir en gasto real con un toque

### Configuración
- Tipo de cambio mensual
- Gestión de categorías
- Presupuesto quincenal configurable

### Administración (`/admin`)
Solo para cuentas marcadas como admin. Lista todas las familias con sus
integrantes, la actividad de cada una y el balance del mes, y permite cambiar
el usuario y la contraseña de cualquier familia.

Las contraseñas **no se pueden ver**: la base guarda un hash bcrypt, que es de
una sola vía. Lo único posible es asignar una nueva.

Para designar al primer admin, definir `ADMIN_USERNAME` con el usuario de esa
cuenta; la primera vez que entre al panel se le marca `isAdmin` en la base y ya
no depende más de la variable.

### Monedas
Los movimientos se pueden cargar en ARS, USD y EUR, pero **los totales
consolidados del dashboard son solo en ARS** (ver `src/lib/reportFilters.ts`).
Los saldos en otras monedas se ven por separado en Ahorros e Inversiones.

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
CreditCard     → Tarjetas de crédito
CardPurchase   → Consumos con tarjeta
CardInstallment→ Cuotas de cada consumo
CardPayment    → Pagos de resumen (generan un Expense)
Loan           → Préstamos tomados u otorgados
LoanInstallment→ Plan de cuotas del préstamo
LoanPayment    → Pagos/cobros de cuota (generan Expense o Income)
PlannedExpense → Ítems de la agenda de gastos previstos
InvestmentTransaction → Aportes y rescates de una inversión
TelegramPending → Lo que el bot interpretó y espera confirmación
```

## 🔔 Recordatorios automáticos

`vercel.json` define un cron diario (9:00 hora Argentina) que pega a
`/api/cron/recordatorios` y avisa por push y por Telegram lo que vence hoy y
mañana: ítems de la agenda, cuotas de préstamos y vencimientos de tarjetas.
Lo atrasado se recuerda solo los lunes.

Opcional: definir `CRON_SECRET` en Vercel para que el endpoint solo acepte
llamadas del cron (Vercel manda el header `Authorization: Bearer $CRON_SECRET`).

Para probarlo a mano:

```bash
curl "https://TU-APP.vercel.app/api/cron/recordatorios?secret=$CRON_SECRET"
```

## 🤖 Bot de Telegram

**Seguridad:** definir `TELEGRAM_WEBHOOK_SECRET` y pasarlo como `secret_token`
al registrar el webhook. Sin eso, cualquiera que conozca la URL puede mandarle
comandos al bot:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook"   -d "url=https://TU-APP.vercel.app/api/webhook/telegram"   -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

**Confirmación:** lo que llega por **audio o foto** no se guarda directo. El bot
muestra lo que entendió y espera que toques *Confirmar*, porque una
transcripción o la lectura de una imagen pueden salir mal. El texto escrito a
mano sí se carga en el momento, con su botón de deshacer.

Además de gastos e ingresos por texto, foto o audio, el bot entiende:

- `"Gasto con tarjeta Naranja de 120000 en 6 cuotas en el super"`
- `"Pagué 80000 de la tarjeta Naranja"`
- `"Pagué la cuota del préstamo Nación"`
- `"Anotá en la agenda el alquiler de 450 mil el día 5"`
- Comandos: `/estado`, `/agenda`, `/prestamos`

## 📝 Licencia

Proyecto privado - Juan & Tania © 2026
