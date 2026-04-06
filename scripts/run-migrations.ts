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
import { PrismaPg } from '@prisma/adapter-pg'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function runMigrations() {
  // Create tracking table if it doesn't exist
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_applied_migrations" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "applied_at" TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)

  // Get set of already-applied migration names
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM "_applied_migrations" ORDER BY name`
  )
  const applied = new Set(rows.map((r) => r.name))

  // Collect migration files sorted alphabetically.
  // Supports both flat .sql files and subdirectory/migration.sql layouts.
  const migrationsDir = join(__dirname, '..', 'prisma', 'migrations')
  const entries = readdirSync(migrationsDir).sort()
  const migrationFiles: Array<{ name: string; path: string }> = []
  for (const entry of entries) {
    const entryPath = join(migrationsDir, entry)
    if (entry.endsWith('.sql') && statSync(entryPath).isFile()) {
      migrationFiles.push({ name: entry, path: entryPath })
    } else if (statSync(entryPath).isDirectory()) {
      const sqlPath = join(entryPath, 'migration.sql')
      try {
        statSync(sqlPath)
        migrationFiles.push({ name: entry, path: sqlPath })
      } catch {
        // No migration.sql in this directory, skip
      }
    }
  }

  if (migrationFiles.length === 0) {
    console.log('No migration files found.')
    return
  }

  let applied_count = 0
  for (const { name: file, path: filePath } of migrationFiles) {
    if (applied.has(file)) {
      console.log(`  skip  ${file} (already applied)`)
      continue
    }

    console.log(`  apply ${file}`)
    const sql = readFileSync(filePath, 'utf-8')

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
