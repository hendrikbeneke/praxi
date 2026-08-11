import type { EmailTemplate, EmailTemplateInput } from '@praxi/shared'
import { and, asc, eq, ne } from 'drizzle-orm'
import type { Database, DbReader, Transaction } from '../db/client.js'
import { emailTemplate } from '../db/schema.js'
import { newId } from '../id.js'

/**
 * The catalogue of covering notes. One row is one complete message — subject
 * and body together, never separable.
 */

const columns = {
  id: emailTemplate.id,
  name: emailTemplate.name,
  subject: emailTemplate.subject,
  body: emailTemplate.body,
  isDefault: emailTemplate.isDefault,
  active: emailTemplate.active,
}

export function listEmailTemplates(database: Database, tenantId: string): Promise<EmailTemplate[]> {
  return database
    .select(columns)
    .from(emailTemplate)
    .where(eq(emailTemplate.tenantId, tenantId))
    .orderBy(asc(emailTemplate.name))
}

/** One by id, for the template the send dialog was switched to. */
export async function getEmailTemplate(
  reader: DbReader,
  tenantId: string,
  id: string,
): Promise<EmailTemplate | null> {
  const [row] = await reader
    .select(columns)
    .from(emailTemplate)
    .where(and(eq(emailTemplate.tenantId, tenantId), eq(emailTemplate.id, id)))
    .limit(1)

  return row ?? null
}

/** The one a send dialog opens with, or the first active one where none is
 *  marked — an empty dialog would be worse than a starting point. */
export async function defaultEmailTemplate(
  reader: DbReader,
  tenantId: string,
): Promise<EmailTemplate | null> {
  const rows = await reader
    .select(columns)
    .from(emailTemplate)
    .where(and(eq(emailTemplate.tenantId, tenantId), eq(emailTemplate.active, true)))
    .orderBy(asc(emailTemplate.name))

  return rows.find((row) => row.isDefault) ?? rows[0] ?? null
}

/** Only one default at a time. The partial unique index enforces it; this
 *  clears the previous one so saving does not fail on a race with intent. */
async function clearOtherDefaults(
  database: Database | Transaction,
  tenantId: string,
  keepId: string,
): Promise<void> {
  await database
    .update(emailTemplate)
    .set({ isDefault: false })
    .where(
      and(
        eq(emailTemplate.tenantId, tenantId),
        eq(emailTemplate.isDefault, true),
        ne(emailTemplate.id, keepId),
      ),
    )
}

export async function createEmailTemplate(
  database: Database,
  tenantId: string,
  input: EmailTemplateInput,
): Promise<EmailTemplate> {
  return database.transaction(async (tx) => {
    const id = newId()
    if (input.isDefault) await clearOtherDefaults(tx, tenantId, id)

    const [row] = await tx
      .insert(emailTemplate)
      .values({ id, tenantId, ...input })
      .returning(columns)

    if (!row) throw new Error('email template vanished within its own transaction')
    return row
  })
}

export async function updateEmailTemplate(
  database: Database,
  tenantId: string,
  id: string,
  input: EmailTemplateInput,
): Promise<EmailTemplate | null> {
  return database.transaction(async (tx) => {
    if (input.isDefault) await clearOtherDefaults(tx, tenantId, id)

    const [row] = await tx
      .update(emailTemplate)
      .set(input)
      .where(and(eq(emailTemplate.tenantId, tenantId), eq(emailTemplate.id, id)))
      .returning(columns)

    return row ?? null
  })
}

export async function deleteEmailTemplate(
  database: Database,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const [row] = await database
    .delete(emailTemplate)
    .where(and(eq(emailTemplate.tenantId, tenantId), eq(emailTemplate.id, id)))
    .returning({ id: emailTemplate.id })

  return row !== undefined
}
