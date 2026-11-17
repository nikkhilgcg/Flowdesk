#!/bin/sh
set -e
# Create or update tables to match prisma/schema.prisma.
# (Switch to `prisma migrate deploy` once you start committing migrations.)
# --accept-data-loss lets Prisma apply schema changes it flags as risky, such as adding a unique rule.
# Review schema changes before deploying; this is for development. Use `prisma migrate deploy` in production.
npx prisma db push --skip-generate --accept-data-loss
# Seed demo people only when SEED_DEMO=true and the database is still empty.
if [ "$SEED_DEMO" = "true" ]; then
  node prisma/seed.js
fi
exec node src/index.js
