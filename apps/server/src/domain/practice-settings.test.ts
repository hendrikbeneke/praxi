import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/client.js'
import { createPracticeSettings, createTenant } from '../test/fixtures.js'
import { FileStore } from './file-store.js'
import {
  clearInvoiceTemplate,
  getPracticeSettings,
  invoiceTemplatePath,
  loadInvoiceTemplate,
  setInvoiceTemplatePath,
  updatePracticeSettings,
} from './practice-settings.js'

let tenantId: string
let storeRoot: string
let store: FileStore

beforeEach(async () => {
  tenantId = await createTenant(db())
  await createPracticeSettings(db(), tenantId)
  storeRoot = await mkdtemp(join(tmpdir(), 'praxi-settings-'))
  store = new FileStore(storeRoot)
})

afterEach(async () => {
  await rm(storeRoot, { recursive: true, force: true })
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
} as const

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

/**
 * D4 splits the settings screen into independently-editable panels (Praxis,
 * Rechnungsstellung) that each save only the fields they render. This is what
 * makes that safe: a patch must touch nothing it did not mention, in either
 * direction — an omitted field survives untouched, and that has to hold even
 * for fields whose Zod schema carries a `.default()`, which is the specific
 * way a naive `.partial()` would have gotten this wrong (see the comment on
 * `practiceSettingsPatchSchema`).
 */
describe('updatePracticeSettings — patch semantics', () => {
  it('leaves every field alone except the one that was sent', async () => {
    await updatePracticeSettings(db(), tenantId, FORM)
    await updatePracticeSettings(db(), tenantId, {
      street: 'Ostertorsteinweg 1',
      bankName: 'Sparkasse',
    })

    const patched = await updatePracticeSettings(db(), tenantId, { defaultPaymentTermDays: 30 })

    expect(patched?.defaultPaymentTermDays).toBe(30)
    expect(patched?.street).toBe('Ostertorsteinweg 1')
    expect(patched?.bankName).toBe('Sparkasse')
    expect(patched?.practiceName).toBe(FORM.practiceName)
  })

  /**
   * The regression this whole schema exists to prevent: `country` and
   * `defaultPaymentTermDays` both carry a `.default()`. A patch schema built
   * as `practiceSettingsInputSchema.partial()` would reintroduce both the
   * moment either was left out of the payload, silently resetting a value
   * the caller never touched.
   */
  it('does not resurrect a defaulted field that was left out of the patch', async () => {
    // Shown on `defaultPaymentTermDays` alone: `country` carries the same
    // `.default()`, but `practiceCountries` has one entry since D-R3, so no
    // second value exists to tell a reset apart from the original.
    await updatePracticeSettings(db(), tenantId, { ...FORM, defaultPaymentTermDays: 30 })

    const patched = await updatePracticeSettings(db(), tenantId, { street: 'Neue Straße 2' })

    expect(patched?.defaultPaymentTermDays).toBe(30)
    expect(patched?.country).toBe('DE')
  })

  /**
   * `street: ''` on the wire becomes `street: null` by the time it reaches
   * here — `optionalTextPatch` folds that at the Zod boundary, this domain
   * function never sees a raw empty string. What it must do with an
   * explicit `null` is clear the field, same as the full-input path.
   */
  it('still clears a field when the patch explicitly sends null', async () => {
    await updatePracticeSettings(db(), tenantId, { ...FORM, street: 'Alte Straße 1' })

    const patched = await updatePracticeSettings(db(), tenantId, { street: null })

    expect(patched?.street).toBeNull()
  })
})

/**
 * Taking the letterhead away again (B1, J3). It was only ever replaceable, so
 * one uploaded by mistake stood behind every invoice with no way back to white
 * paper.
 */
describe('clearInvoiceTemplate', () => {
  it('forgets the path and removes the file', async () => {
    const path = invoiceTemplatePath(tenantId)
    await store.write(path, new Uint8Array([1, 2, 3]))
    await setInvoiceTemplatePath(db(), tenantId, path)

    await clearInvoiceTemplate(db(), tenantId, store)

    const settings = await getPracticeSettings(db(), tenantId)
    expect(settings?.invoiceTemplateSet).toBe(false)
    // Nothing left for the PDF renderer to find, which is what "prints on
    // white paper" means one layer down.
    expect(await loadInvoiceTemplate(db(), tenantId, store)).toBeNull()
  })

  /** Removing what is not there is the state being asked for, not a failure —
   *  the route answers 204 either way. */
  it('is content when there is nothing to remove', async () => {
    await expect(clearInvoiceTemplate(db(), tenantId, store)).resolves.toBeUndefined()

    const settings = await getPracticeSettings(db(), tenantId)
    expect(settings?.invoiceTemplateSet).toBe(false)
  })

  /**
   * The row is cleared before the file goes, so the failure this cannot have
   * is a stored path pointing at nothing. The opposite — a file nobody
   * references — is harmless: there is one path per tenant and the next upload
   * writes over it.
   */
  it('leaves nothing behind that a later upload could not overwrite', async () => {
    const path = invoiceTemplatePath(tenantId)
    await store.write(path, new Uint8Array([1]))
    await setInvoiceTemplatePath(db(), tenantId, path)
    await clearInvoiceTemplate(db(), tenantId, store)

    await store.write(path, new Uint8Array([2, 2]))
    await setInvoiceTemplatePath(db(), tenantId, path)

    expect(await loadInvoiceTemplate(db(), tenantId, store)).toEqual(Buffer.from([2, 2]))
  })
})
