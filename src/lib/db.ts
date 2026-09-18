import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

function getPrismaClient(): PrismaClient {
  const dbUrl =
    process.env.DATABASE_URL ||
    'postgresql://neondb_owner:npg_0tHMzIkiAY5b@ep-summer-cell-b4jzgno1-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaNeon } = require('@prisma/adapter-neon');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { neonConfig } = require('@neondatabase/serverless');

  if (typeof WebSocket === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    neonConfig.webSocketConstructor = require('ws');
  }

  const adapter = new PrismaNeon({ connectionString: dbUrl });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalThis.prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}
