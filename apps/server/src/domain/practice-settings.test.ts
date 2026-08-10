import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { createPracticeSettings, createTenant } from '../test/fixtures.js'
import {
  getPracticeSettings,
  invoiceTemplatePath,
  setInvoiceTemplatePath,
  updatePracticeSettings,
} from './practice-settings.js'

let tenantId: string

beforeEach(async () => {
  tenantId = await createTenant(db())
  await createPracticeSettings(db(), tenantId)
})

const FORM = {
  practiceName: 'Testpraxis',
  street: null,
  postalCode: null,
  city: null,
  country: 'DE',
  phone: null,
  email: null,
  website: null,
  taxNumber: null,
  bankName: null,
  iban: null,
  bic: null,
  defaultPaymentTermDays: 14,
}

/**
 * The letterhead is a file, and whether one exists is a question the screen
 * has to be able to ask. Before this, it could not: the path was in no
 * response, so the settings offered "show the letterhead" unconditionally and
 * the answer was a 404. A control that leads nowhere claims a state exactly
 * the way a prefilled field does.
 */
describe('invoiceTemplateSet', () => {
  it('is false while no letterhead is stored', async () => {
    const settings = await getPracticeSettings(db(), tenantId)
    expect(settings?.invoiceTemplateSet).toBe(false)
  })

  it('is true once one is', async () => {
    await setInvoiceTemplatePath(db(), tenantId, invoiceTemplatePath(tenantId))

    const settings = await getPracticeSettings(db(), tenantId)
    expect(settings?.invoiceTemplateSet).toBe(true)
  })

  /**
   * The screen replaces its cached settings with the answer of the save, so a
   * saved form that said less than a loaded one would make the letterhead
   * disappear from the page until the next reload.
   */
  it('says the same thing after a save as after a load', async () => {
    await setInvoiceTemplatePath(db(), tenantId, invoiceTemplatePath(tenantId))

    const saved = await updatePracticeSettings(db(), tenantId, FORM)
    expect(saved?.invoiceTemplateSet).toBe(true)
  })

  /** Saving the form must not clear it — the path is not part of the form. */
  it('survives a save of the settings form', async () => {
    await setInvoiceTemplatePath(db(), tenantId, invoiceTemplatePath(tenantId))
    await updatePracticeSettings(db(), tenantId, FORM)

    const settings = await getPracticeSettings(db(), tenantId)
    expect(settings?.invoiceTemplateSet).toBe(true)
  })

  /** A location on disk is of no use to the client and does not travel. */
  it('replaces the stored path rather than exposing it', async () => {
    await setInvoiceTemplatePath(db(), tenantId, invoiceTemplatePath(tenantId))

    const settings = await getPracticeSettings(db(), tenantId)
    expect(settings).not.toHaveProperty('invoiceTemplatePath')
  })
})
