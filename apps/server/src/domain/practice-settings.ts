import type { PracticeSettings, PracticeSettingsPatch } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { practiceSettings } from '../db/schema.js'
import type { FileStore } from './file-store.js'

const columns = {
  id: practiceSettings.id,
  practiceName: practiceSettings.practiceName,
  street: practiceSettings.street,
  postalCode: practiceSettings.postalCode,
  city: practiceSettings.city,
  country: practiceSettings.country,
  phone: practiceSettings.phone,
  email: practiceSettings.email,
  website: practiceSettings.website,
  taxNumber: practiceSettings.taxNumber,
  vatId: practiceSettings.vatId,
  bankName: practiceSettings.bankName,
  iban: practiceSettings.iban,
  bic: practiceSettings.bic,
  defaultPaymentTermDays: practiceSettings.defaultPaymentTermDays,
  invoiceTemplatePath: practiceSettings.invoiceTemplatePath,
}

type SettingsRow = Omit<PracticeSettings, 'invoiceTemplateSet'> & {
  invoiceTemplatePath: string | null
}

/**
 * The stored path becomes a yes-or-no on the way out; the path itself never
 * leaves the server. Both the read and the write go through here, so a saved
 * form cannot answer with less than a loaded one — the screen replaces its
 * cached copy with the response of the PUT.
 */
function toSettings({ invoiceTemplatePath: path, ...rest }: SettingsRow): PracticeSettings {
  return { ...rest, invoiceTemplateSet: path !== null }
}

/**
 * There is exactly one row per tenant, created by the seed. A missing row is a
 * broken installation, not a normal state, so this returns `null` and lets the
 * route decide rather than inventing an empty record.
 */
export async function getPracticeSettings(
  database: Database,
  tenantId: string,
): Promise<PracticeSettings | null> {
  const [row] = await database
    .select(columns)
    .from(practiceSettings)
    .where(eq(practiceSettings.tenantId, tenantId))
    .limit(1)

  return row ? toSettings(row) : null
}

/**
 * A genuine column-level patch: `input` carries only the keys the caller
 * actually wants to change (D4's Praxis and Rechnungsstellung panels each
 * send their own, disjoint subset of fields), and `.set(input)` writes
 * exactly those columns — Drizzle leaves every column whose key is absent
 * from `input` untouched. This is what makes two independently-editable
 * panels on the one settings row safe: saving one can never carry a stale
 * in-memory value for a field the other panel owns, because that field's key
 * was never in the payload to begin with. See `practiceSettingsPatchSchema`
 * in packages/shared for why this could not simply be `.partial()` on the
 * full input schema.
 */
export async function updatePracticeSettings(
  database: Database,
  tenantId: string,
  input: PracticeSettingsPatch,
): Promise<PracticeSettings | null> {
  const [row] = await database
    .update(practiceSettings)
    .set(input)
    .where(eq(practiceSettings.tenantId, tenantId))
    .returning(columns)

  return row ? toSettings(row) : null
}

/**
 * The uploaded letterhead, or `null` when none is configured — which is a
 * normal state: the application is usable before a template exists, the
 * invoice then simply prints on blank paper.
 *
 * A configured template whose file has gone missing is *not* a normal state
 * and throws, because silently falling back to blank paper would produce an
 * invoice without the practice's identity on it.
 */
export async function loadInvoiceTemplate(
  database: Database,
  tenantId: string,
  store: FileStore,
): Promise<Uint8Array | null> {
  const [row] = await database
    .select({ path: practiceSettings.invoiceTemplatePath })
    .from(practiceSettings)
    .where(eq(practiceSettings.tenantId, tenantId))
    .limit(1)

  if (!row?.path) return null
  return store.read(row.path)
}

/** Where the letterhead lives, relative to the data root. One per tenant, so a
 *  new upload replaces the old file rather than piling up. */
export function invoiceTemplatePath(tenantId: string): string {
  return `templates/${tenantId}/invoice-template.pdf`
}

export async function setInvoiceTemplatePath(
  database: Database,
  tenantId: string,
  path: string,
): Promise<void> {
  await database
    .update(practiceSettings)
    .set({ invoiceTemplatePath: path })
    .where(eq(practiceSettings.tenantId, tenantId))
}
