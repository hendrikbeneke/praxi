import type { PracticeSettings, PracticeSettingsInput } from '@praxi/shared'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import { practiceSettings } from '../db/schema.js'

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
  bankName: practiceSettings.bankName,
  iban: practiceSettings.iban,
  bic: practiceSettings.bic,
  defaultPaymentTermDays: practiceSettings.defaultPaymentTermDays,
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

  return row ?? null
}

export async function updatePracticeSettings(
  database: Database,
  tenantId: string,
  input: PracticeSettingsInput,
): Promise<PracticeSettings | null> {
  const [row] = await database
    .update(practiceSettings)
    .set(input)
    .where(eq(practiceSettings.tenantId, tenantId))
    .returning(columns)

  return row ?? null
}
