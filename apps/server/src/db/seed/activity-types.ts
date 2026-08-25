/**
 * The activity types every tenant starts with (CLAUDE.md rule 6).
 *
 * None of them is a system entry — nothing in the software depends on a
 * particular type existing, so all four are as editable and deletable as
 * anything the practitioner adds. That is also why the catalogue lost its
 * `code` in migration 0041: an anchor with nothing anchored to it. The label
 * is what an entry is recognised by now, and what this seed dedupes on.
 *
 * No default duration and no default service or group: those are the
 * practice's numbers, and inventing them here would put made-up defaults on
 * real activities. The colours are a starting point and are chosen so that
 * none of them relies on red-green discrimination; the label on top is black
 * or white per `readableTextOn`, so every one of them stays readable.
 *
 * Idempotent: an entry that already exists keeps the label and colour it has.
 * Migration 0021 carries a frozen copy of this list for the tenant that
 * existed when it ran — this file is the living definition.
 */
import { newId } from '../../id.js'
import type { Database } from '../client.js'
import { activityType } from '../schema.js'

const ACTIVITY_TYPES = [
  { label: 'Erstgespräch', color: '#2563eb', isDefault: false, sortOrder: 10 },
  // The everyday case, so this is the one a new activity starts on.
  { label: 'Folgesitzung', color: '#0d9488', isDefault: true, sortOrder: 20 },
  { label: 'Vortrag', color: '#d97706', isDefault: false, sortOrder: 30 },
  { label: 'Beratung', color: '#7c3aed', isDefault: false, sortOrder: 40 },
] as const

export async function seedActivityTypes(database: Database, tenantId: string): Promise<void> {
  for (const type of ACTIVITY_TYPES) {
    await database
      .insert(activityType)
      .values({ id: newId(), tenantId, ...type })
      .onConflictDoNothing({ target: [activityType.tenantId, activityType.label] })
  }
}
