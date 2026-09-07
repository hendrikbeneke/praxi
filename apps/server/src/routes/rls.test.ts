import { activityInputSchema, contactInputSchema, noteInputSchema } from '@praxi/shared'
import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { createActivity } from '../domain/activity.js'
import { createContact } from '../domain/contact.js'
import { collectBillableItems } from '../domain/invoice.js'
import { createNote } from '../domain/note.js'
import {
  activityTypeId,
  createTenant,
  createUser,
  noteTypeId,
  roleTypeId,
} from '../test/fixtures.js'

/**
 * Does the DATABASE keep the tenants apart, or only the application?
 *
 * Every other test in this suite runs as the owner, which bypasses every
 * policy — so none of them says anything about this. Here the connection drops
 * to `praxi_app` with `SET LOCAL ROLE`, which is the role the server actually
 * uses and which no policy exempts. No second password and no second pool: the
 * role change is undone at the end of the transaction, exactly as
 * `app.tenant_id` is.
 *
 * **Built so that it fails without row-level security.** With the policies off,
 * the queries below see both tenants' rows and every assertion breaks at once —
 * which is the only way to know the test is testing something. The number is in
 * the slice's report, not in a comment, because a comment would be a claim.
 */

const TENANT_TABLE = 'tenant'

/**
 * Two tenants that each have real work in them.
 *
 * The catalogues alone would not do. A leak is only detectable in a table that
 * actually holds a row of the other tenant, and `createTenant` fills the
 * catalogues and nothing else — so a version of this test built on it looks
 * thorough while saying nothing whatsoever about `contact`, `note`, `activity`
 * or `invoice`, which are the tables the whole exercise is for. It went through
 * a round exactly like that before the counter-check caught it.
 */
async function twoTenants(): Promise<{ mine: string; theirs: string }> {
  const mine = await fillTenant()
  const theirs = await fillTenant()
  return { mine, theirs }
}

async function fillTenant(): Promise<string> {
  const tenantId = await createTenant(db())
  const user = await createUser(db(), { tenantId })

  const contact = await createContact(
    db(),
    tenantId,
    contactInputSchema.parse({
      kind: 'person',
      lastName: 'Testperson',
      roles: [{ roleTypeId: await roleTypeId(db(), tenantId, 'Patient') }],
    }),
  )

  const activity = await createActivity(
    db(),
    tenantId,
    activityInputSchema.parse({
      contactId: contact.id,
      activityTypeId: await activityTypeId(db(), tenantId, 'Erstgespräch'),
      status: 'rendered',
      occurredAt: '2026-08-03T09:00:00.000Z',
      items: [{ kind: 'custom', description: 'Erstgespräch', unitPriceCents: 13_500, quantity: 1 }],
      appointment: { startsAt: '2026-08-03T09:00:00.000Z', endsAt: '2026-08-03T10:30:00.000Z' },
    }),
  )

  await createNote(
    db(),
    tenantId,
    user.id,
    noteInputSchema.parse({
      contactId: contact.id,
      activityId: activity.id,
      noteDate: '2026-08-03',
      noteTypeId: await noteTypeId(db(), tenantId, 'Sitzung'),
      text: 'Behandlungsdokumentation, die kein anderer Mandant sehen darf.',
    }),
  )

  await collectBillableItems(db(), tenantId, {
    activityItemIds: activity.items.map((item) => item.id),
    invoiceDate: '2026-08-04',
  })

  return tenantId
}

/** Which tables carry a tenant policy — read from the catalogue rather than
 *  listed here, so a table added later is covered without touching this file. */
async function tablesWithPolicy(): Promise<string[]> {
  const rows = await db().execute<{ tablename: string }>(
    sql`select tablename from pg_policies where schemaname = 'public' order by tablename`,
  )
  return [...rows].map((row) => row.tablename)
}

/** Runs `work` as the unprivileged role, for one tenant. */
async function asRole<T>(tenantId: string | null, work: (tx: Sql) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`set local role praxi_app`)
    if (tenantId) await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`)
    return work(tx)
  })
}

type Sql = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0]

async function countIn(tx: Sql, table: string): Promise<number> {
  const rows = await tx.execute<{ n: string }>(
    sql`select count(*)::text as n from ${sql.identifier(table)}`,
  )
  return Number([...rows][0]?.n ?? '0')
}

beforeEach(async () => {
  // The role is created by migration 0044 and is cluster-wide, so it is there
  // by the time any worker has migrated. Asserted rather than assumed: without
  // it every `set local role` below would throw and the failure would read as
  // something else entirely.
  const rows = await db().execute<{ n: string }>(
    sql`select count(*)::text as n from pg_roles where rolname = 'praxi_app'`,
  )
  expect(Number([...rows][0]?.n)).toBe(1)
})

describe('the database keeps the tenants apart', () => {
  it('has row-level security enabled on every table that has a policy', async () => {
    // The list in migration 0045 is not maintained by hand; this is what keeps
    // it honest. A table added later with a policy and without the ALTER fails
    // here rather than being quietly readable across tenants.
    const rows = await db().execute<{ tablename: string; enabled: boolean }>(
      sql`select p.tablename, c.relrowsecurity as enabled
          from pg_policies p
          join pg_class c on c.relname = p.tablename
          where p.schemaname = 'public'
          order by p.tablename`,
    )

    const unarmed = [...rows].filter((row) => !row.enabled).map((row) => row.tablename)
    expect(unarmed).toEqual([])
  })

  it('shows a tenant only its own rows, in every table', async () => {
    const { mine, theirs } = await twoTenants()
    const tables = await tablesWithPolicy()
    expect(tables.length).toBeGreaterThan(30)

    // As the owner: everything. This is the control — it is what the assertion
    // below would also see if the policies were off.
    const asOwner = await countIn(db() as unknown as Sql, TENANT_TABLE)
    expect(asOwner).toBeGreaterThanOrEqual(2)

    const leaking: string[] = []
    for (const table of tables) {
      const seen = await asRole(mine, async (tx) => {
        const column = table === TENANT_TABLE ? sql`id` : sql`tenant_id`
        const rows = await tx.execute<{ n: string }>(
          sql`select count(*)::text as n from ${sql.identifier(table)} where ${column} = ${theirs}`,
        )
        return Number([...rows][0]?.n ?? '0')
      })
      if (seen > 0) leaking.push(`${table}: ${seen}`)
    }

    expect(leaking).toEqual([])
  })

  it('shows nothing at all when no tenant is set', async () => {
    await twoTenants()

    // A connection that never set `app.tenant_id` is the shape a forgotten
    // `SET LOCAL` takes. It has to answer with nothing rather than with
    // everything — that is the difference between a visible failure and a leak.
    const seen = await asRole(null, (tx) => countIn(tx, TENANT_TABLE))

    expect(seen).toBe(0)
  })

  it('refuses to write a row for another tenant', async () => {
    const { mine, theirs } = await twoTenants()

    // The `WITH CHECK` half. A forgotten filter on a read hides rows; a
    // forgotten tenant on a write would put one in somebody else's record,
    // which no later query could undo.
    await expect(
      asRole(mine, (tx) =>
        tx.execute(sql`
          insert into contact (id, tenant_id, contact_number, kind, last_name)
          values (gen_random_uuid(), ${theirs}, 9999, 'person', 'Fremdmandant')
        `),
      ),
    ).rejects.toThrow()
  })

  it('lets a tenant read and write its own rows', async () => {
    const { mine } = await twoTenants()

    // The other half of the guarantee, and the one a too-strict policy would
    // break: isolation that also blocks the owner's own work is not isolation,
    // it is an outage.
    const readBack = await asRole(mine, async (tx) => {
      await tx.execute(sql`
        insert into contact (id, tenant_id, contact_number, kind, last_name)
        values (gen_random_uuid(), ${mine}, 4242, 'person', 'Eigenmandant')
      `)
      const rows = await tx.execute<{ n: string }>(
        sql`select count(*)::text as n from contact where last_name = 'Eigenmandant'`,
      )
      return Number([...rows][0]?.n ?? '0')
    })

    // The row it just wrote, read back through the same policy. Asserting the
    // total instead would say more about the fixture than about the guarantee.
    expect(readBack).toBe(1)
  })

  it('does not exempt the role the server actually runs as', async () => {
    // The whole slice rests on this. `praxi` is a superuser, owns every table
    // and has BYPASSRLS, so enabling the policies under it changes nothing at
    // all — no error, no hint. If `praxi_app` ever gains any of the three, this
    // file keeps passing while protecting nothing, so the three are asserted.
    const rows = await db().execute<{
      rolsuper: boolean
      rolbypassrls: boolean
    }>(sql`select rolsuper, rolbypassrls from pg_roles where rolname = 'praxi_app'`)

    const role = [...rows][0]
    expect(role?.rolsuper).toBe(false)
    expect(role?.rolbypassrls).toBe(false)

    const owned = await db().execute<{ n: string }>(
      sql`select count(*)::text as n from pg_tables
          where schemaname = 'public' and tableowner = 'praxi_app'`,
    )
    expect(Number([...owned][0]?.n)).toBe(0)
  })
})
