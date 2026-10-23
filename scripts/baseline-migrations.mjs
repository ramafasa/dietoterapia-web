/**
 * Jednorazowe uzupełnienie historii migracji Drizzle (drizzle.__drizzle_migrations).
 *
 * Dla baz utrzymywanych dotąd przez `db:push`: schemat jest, ale historii migracji brak, więc
 * `drizzle-kit migrate` próbuje wgrać wszystko od 0000 i pada (np. CREATE TABLE "transactions").
 * Skrypt oznacza migracje z journala aż do `--through` jako zastosowane – z tym samym hashem
 * (SHA-256 pliku .sql) i created_at (`when` z journala), które zapisałby migrator. Kolejne
 * migracje wgra potem zwykłe `npx drizzle-kit migrate`.
 *
 * Przed zapisem sprawdza, czy obiekty z oznaczanych migracji (tabele, indeksy, ograniczenia,
 * dodane kolumny) naprawdę istnieją w bazie – inaczej odmawia (`--allow-missing` pomija tę blokadę).
 * Ostrzega też, jeśli obiekty następnej migracji już istnieją (wtedy `--through` jest za niskie).
 *
 * Użycie (DATABASE_URL z .env.local albo ze zmiennej środowiskowej):
 *   node scripts/baseline-migrations.mjs --through 0006_warm_silver_centurion          # podgląd
 *   node scripts/baseline-migrations.mjs --through 0006_warm_silver_centurion --apply  # zapis
 *
 * Migrator Drizzle patrzy tylko na najnowszy created_at w tabeli, więc wpisy muszą być kompletne
 * i w kolejności journala. Na produkcji: najpierw gałąź Neon.
 */
import { config } from 'dotenv'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import postgres from 'postgres'

config({ path: resolve(process.cwd(), '.env.local') })

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

const through = option('--through')
const apply = flag('--apply')
const allowMissing = flag('--allow-missing')

if (!through) {
  console.error('Podaj --through <tag migracji>, np. --through 0006_warm_silver_centurion')
  process.exit(1)
}

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const MIGRATIONS_DIR = resolve(process.cwd(), 'drizzle')
const journal = JSON.parse(readFileSync(resolve(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'))
const migrations = journal.entries.map((entry) => {
  const query = readFileSync(resolve(MIGRATIONS_DIR, `${entry.tag}.sql`)).toString()
  return {
    tag: entry.tag,
    when: entry.when,
    // Tak samo jak drizzle-orm/migrator.js – hash całego pliku
    hash: createHash('sha256').update(query).digest('hex'),
    objects: objectsCreatedBy(query),
  }
})

const throughIndex = migrations.findIndex((m) => m.tag === through)
if (throughIndex < 0) {
  console.error(`Nie ma migracji ${through} w drizzle/meta/_journal.json. Dostępne:`)
  for (const m of migrations) console.error(`  ${m.tag}`)
  process.exit(1)
}
const toBaseline = migrations.slice(0, throughIndex + 1)
const nextMigration = migrations[throughIndex + 1]

/** Obiekty, które migracja tworzy – do sprawdzenia, czy schemat bazy naprawdę je ma. */
function objectsCreatedBy(query) {
  const objects = []
  for (const [, name] of query.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/g)) {
    objects.push({ kind: 'table', name })
  }
  for (const [, name] of query.matchAll(/CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"([^"]+)"/g)) {
    objects.push({ kind: 'index', name })
  }
  for (const [, name] of query.matchAll(/ADD CONSTRAINT "([^"]+)"/g)) {
    objects.push({ kind: 'constraint', name })
  }
  for (const [, table, column] of query.matchAll(/ALTER TABLE "([^"]+)" ADD COLUMN (?:IF NOT EXISTS )?"([^"]+)"/g)) {
    objects.push({ kind: 'column', name: `${table}.${column}`, table, column })
  }
  for (const [, table, column] of query.matchAll(/ALTER TABLE "([^"]+)" RENAME COLUMN "[^"]+" TO "([^"]+)"/g)) {
    objects.push({ kind: 'column', name: `${table}.${column}`, table, column })
  }
  return objects
}

async function exists(sql, object) {
  switch (object.kind) {
    case 'table':
    case 'index': {
      const [row] = await sql`select to_regclass(${`public."${object.name}"`}) is not null as ok`
      return row.ok
    }
    case 'constraint': {
      const [row] = await sql`
        select exists (
          select 1 from pg_constraint c join pg_namespace n on n.oid = c.connamespace
          where n.nspname = 'public' and c.conname = ${object.name}
        ) as ok`
      return row.ok
    }
    case 'column': {
      const [row] = await sql`
        select exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = ${object.table} and column_name = ${object.column}
        ) as ok`
      return row.ok
    }
  }
}

function describeTarget(url) {
  try {
    const { hostname, port, pathname } = new URL(url)
    return `${hostname}${port ? `:${port}` : ''}${pathname}`
  } catch {
    return '(nieczytelny DATABASE_URL)'
  }
}

const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} })

async function main() {
  console.log(`Baza: ${describeTarget(DATABASE_URL)}`)
  console.log(`Oznaczenie jako zastosowane: ${toBaseline[0].tag} … ${through} (${toBaseline.length} migracji)\n`)

  const [{ hasTable }] = await sql`select to_regclass('drizzle.__drizzle_migrations') is not null as "hasTable"`
  const existing = hasTable
    ? await sql`select hash, created_at from drizzle.__drizzle_migrations order by created_at`
    : []
  const existingMillis = new Set(existing.map((row) => Number(row.created_at)))
  const known = new Map(migrations.map((m) => [m.when, m.tag]))

  console.log(`Historia w bazie: ${existing.length ? '' : 'pusta'}`)
  for (const row of existing) {
    const tag = known.get(Number(row.created_at)) ?? '(nieznana migracja)'
    console.log(`  ${row.created_at}  ${tag}`)
  }

  const newestInDb = existing.length ? Number(existing[existing.length - 1].created_at) : null
  if (newestInDb !== null && newestInDb > toBaseline[toBaseline.length - 1].when) {
    console.log(`\nHistoria sięga już dalej niż ${through} – nic do zrobienia. Uruchom: npx drizzle-kit migrate`)
    return
  }

  // Schemat musi już mieć to, co tworzą oznaczane migracje
  const missing = []
  for (const migration of toBaseline) {
    for (const object of migration.objects) {
      if (!(await exists(sql, object))) missing.push(`${migration.tag}: ${object.kind} ${object.name}`)
    }
  }

  // Obiekty następnej migracji już są → prawdopodobnie --through za niskie
  const presentFromNext = []
  if (nextMigration) {
    for (const object of nextMigration.objects) {
      if (await exists(sql, object)) presentFromNext.push(`${object.kind} ${object.name}`)
    }
  }

  const planned = toBaseline.filter((m) => !existingMillis.has(m.when))
  console.log(`\nDo wpisania: ${planned.length ? '' : 'nic'}`)
  for (const m of planned) console.log(`  ${m.when}  ${m.tag}  ${m.hash.slice(0, 12)}…`)

  if (missing.length) {
    console.warn(`\nBRAKUJE w bazie obiektów z oznaczanych migracji (${missing.length}):`)
    for (const line of missing) console.warn(`  ${line}`)
    console.warn('Po oznaczeniu migrate ich NIE utworzy – trzeba je dodać ręcznie (SQL z plików w drizzle/).')
  }
  if (presentFromNext.length) {
    console.warn(`\nUWAGA: w bazie są już obiekty z ${nextMigration.tag}:`)
    for (const line of presentFromNext) console.warn(`  ${line}`)
    console.warn(`migrate spróbuje wgrać ${nextMigration.tag} i może paść – czy --through nie powinno być dalej?`)
  }

  if (!apply) {
    console.log('\nPodgląd – nic nie zapisano. Dodaj --apply, żeby wpisać historię.')
    return
  }
  if (missing.length && !allowMissing) {
    console.error('\nPrzerwano: brakuje obiektów (wyżej). Uzupełnij schemat albo świadomie dodaj --allow-missing.')
    process.exitCode = 1
    return
  }
  if (!planned.length) return

  await sql.begin(async (tx) => {
    await tx`create schema if not exists drizzle`
    await tx`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )`
    for (const m of planned) {
      await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.when})`
    }
  })
  console.log(`\nZapisano ${planned.length} wpisów. Teraz: npx drizzle-kit migrate`)
}

main()
  .catch((error) => {
    console.error('Błąd:', error.message)
    process.exitCode = 1
  })
  .finally(() => sql.end())
