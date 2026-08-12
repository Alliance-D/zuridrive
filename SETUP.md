# ZuriDrive Setup Guide

## Prerequisites
- Node.js 18.x or 20.x
- npm, yarn, or pnpm
- PostgreSQL database
- Git

---

## Installation Steps

### 1. Clone & Install Dependencies
```bash
cd d:\zuridrive
npm install
# or: yarn install / pnpm install
```

### 2. Create Environment Variables
```bash
# Copy the example file
cp .env.local.example .env.local

# Edit .env.local with your credentials:
```

**Required Variables:**
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/zuridrive"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# OAuth Providers
GOOGLE_CLIENT_ID="xxxx"
GOOGLE_CLIENT_SECRET="xxxx"
GITHUB_CLIENT_ID="xxxx"
GITHUB_CLIENT_SECRET="xxxx"

# Africa's Talking (SMS)
AFRICAS_TALKING_API_KEY="xxxx"
AFRICAS_TALKING_USERNAME="xxxx"

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="xxxx"
CLOUDINARY_API_KEY="xxxx"
CLOUDINARY_API_SECRET="xxxx"

# MTN MoMo
MTN_MOMO_PRIMARY_KEY="xxxx"
MTN_MOMO_SECONDARY_KEY="xxxx"
MTN_MOMO_BUSINESS_ID="xxxx"
```

### 3. Set Up Database

```bash
# Create PostgreSQL database
createdb zuridrive

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# (Optional) View database with Prisma Studio
npx prisma studio
```

### 4. Start Development Server

```bash
npm run dev
```

Visit http://localhost:3000

---

## Project Structure Quick Reference

```
zuridrive/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── dashboard/         # Client dashboard
│   ├── owner/             # Owner dashboard
│   └── admin/             # Admin panel
├── components/            # React components
│   ├── ui/               # Design system
│   ├── booking/          # Booking flow
│   └── owner/            # Owner-specific
├── lib/                   # Utilities & business logic
│   ├── db/               # Database queries
│   ├── booking/          # Booking logic
│   └── payments/         # Payment handlers
├── prisma/
│   └── schema.prisma     # Database schema (31 models)
├── types/                # TypeScript types
└── public/               # Static assets
```

---

## Available Scripts

```bash
# Development
npm run dev              # Start dev server on :3000

# Production
npm run build            # Build for production
npm run start            # Start production server

# Database
npm run prisma:migrate   # Create & run migrations
npm run prisma:studio    # Open Prisma data studio
npx prisma generate      # Generate Prisma client

# Linting
npm run lint             # Run ESLint
```

---

## Key File Locations

**Authentication**
- Setup: `lib/auth-config.ts`
- Middleware: `middleware.ts`
- Login: `app/login/page.tsx`

**Database**
- Schema: `prisma/schema.prisma`
- Prisma: `lib/prisma.ts`
- Queries: `lib/db/queries.ts`

**API Routes**
- Auth: `app/api/auth/`
- Bookings: `app/api/bookings/`
- Cars: `app/api/cars/`
- Finance: `app/api/admin/`

**Components**
- Layout: `app/layout.tsx`
- Navigation: `components/navbar.tsx`
- Home: `app/page.tsx`
- Cars: `app/cars/page.tsx`

---

## Common Tasks

### Add a New Page
1. Create folder: `app/my-page/`
2. Add file: `app/my-page/page.tsx`
3. (Optional) Add layout: `app/my-page/layout.tsx`

### Add a New API Route
1. Create folder: `app/api/my-route/`
2. Add file: `app/api/my-route/route.ts`
3. Export: `export async function GET(req) { }`

### Add a New Component
1. Create file: `components/my-component.tsx`
2. Import & use: `import { MyComponent } from '@/components'`

### Update Database Schema
1. Edit `prisma/schema.prisma`
2. Run: `npx prisma migrate dev --name description`
3. Schema updated automatically

---

## Environment-Specific Configs

### Development (.env.local)
```env
NEXT_PUBLIC_ENVIRONMENT="development"
NEXTAUTH_DEBUG=true
LOG_LEVEL="debug"
```

### Production (.env.production)
```env
NEXT_PUBLIC_ENVIRONMENT="production"
NEXTAUTH_DEBUG=false
LOG_LEVEL="info"
```

---

## Troubleshooting

**Port 3000 already in use**
```bash
npm run dev -- -p 3001
# or kill the process using the port
```

**Prisma client out of sync**
```bash
npx prisma generate
npm run dev
```

**Database connection error**
- Check DATABASE_URL in .env.local
- Ensure PostgreSQL is running
- Verify credentials are correct

**NextAuth errors**
- Check NEXTAUTH_SECRET is set
- NEXTAUTH_URL must match request URL (localhost vs domain)

---

## Development Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes**
   - Add components in `components/`
   - Add API routes in `app/api/`
   - Update schema in `prisma/schema.prisma`

3. **Test locally**
   ```bash
   npm run dev
   # Visit http://localhost:3000
   ```

4. **Commit & push**
   ```bash
   git add .
   git commit -m "feat: add my feature"
   git push origin feature/my-feature
   ```

5. **Create Pull Request**

---

## Deployment (Vercel)

1. **Push to GitHub**
2. **Connect repo to Vercel**
3. **Set environment variables** in Vercel dashboard
4. **Deploy**: Automatic on push to main

```bash
# Vercel CLI
npm i -g vercel
vercel --prod
```

---

## Support Resources

- **Prisma**: https://www.prisma.io/docs
- **Next.js**: https://nextjs.org/docs
- **NextAuth**: https://next-auth.js.org
- **Tailwind**: https://tailwindcss.com/docs
- **TypeScript**: https://www.typescriptlang.org/docs

---

**Status**: ✅ Ready for Development!

Need help? Check PROJECT_STRUCTURE.md for complete overview.
