#!/usr/bin/env npx tsx
/**
 * Migration runner for word-coach-annie.
 *
 * Applies any SQL files in prisma/migrations/ that haven't been applied yet.
 * Tracks applied migrations in the _applied_migrations table.
 *
 * Run via: npx tsx scripts/run-migrations.ts
 */

import { PrismaClient } from '@prisma/client'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const prisma = new PrismaClient()

async function runMigrations() {
  // Create tracking table if it doesn't exist
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_applied_migrations" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "applied_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Get set of already-applied migration names
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM "_applied_migrations" ORDER BY name`
  )
  const applied = new Set(rows.map((r) => r.name))

  // Collect migration files sorted alphabetically
  const migrationsDir = join(__dirname, '..', 'prisma', 'migrations')
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.log('No migration files found.')
    return
  }

  let applied_count = 0
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file} (already applied)`)
      continue
    }

    console.log(`  apply ${file}`)
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')

    // Split into individual statements, stripping line comments
    const statements = sql
      .replace(/--[^\n]*/g, '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt)
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "_applied_migrations" ("name") VALUES ('${file}')`
    )
    applied_count++
  }

  if (applied_count === 0) {
    console.log('All migrations already applied.')
  } else {
    console.log(`Applied ${applied_count} migration(s).`)
  }
}

runMigrations()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
