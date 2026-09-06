// Required by Prisma 7 for CLI commands (generate/migrate/studio/db seed) -- the
// datasource `url` field it used to read from schema.prisma no longer exists there
// (see prisma/schema.prisma's own comment). The app itself never reads this file;
// it gets its connection string through a driver adapter instead (see
// apps/api/src/prisma/prisma.service.ts and prisma/seed.ts).
//
// Every script that invokes the Prisma CLI (root package.json's db:* scripts, CI,
// infrastructure/Dockerfile.api) does so from this directory (packages/database),
// since Prisma 7 discovers this config file relative to the CLI's cwd.
import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// This repo keeps one .env at the repo root (see .env.example), not per-package --
// dotenv's own default (cwd-relative) would miss it given the cwd above. Silently
// does nothing where the file doesn't exist (CI/Docker set DATABASE_URL directly
// as a real environment variable instead) or where a var it would set is already
// present, since dotenv never overrides existing process.env values.
loadEnv({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
