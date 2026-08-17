/**
 * German user-facing strings for the frontend. Labels, buttons, validation
 * messages — everything the practitioner reads lives here, never inlined in a
 * component. This is not i18n; it keeps the English-code / German-UI split
 * enforceable.
 */
export const strings = {
  app: {
    title: 'Praxisverwaltung',
    /** The sidebar header's brand line — short on purpose, the practice name
     *  underneath it already carries the rest. */
    shortTitle: 'Praxi',
  },
  nav: {
    dashboard: 'Übersicht',
    contacts: 'Kontakte',
    appointments: 'Kalender',
    activities: 'Vorgänge',
    payments: 'Zahlungen',
    services: 'Leistungen',
    settings: 'Einstellungen',
    signOut: 'Abmelden',
    collapse: 'Navigation einklappen',
    expand: 'Navigation ausklappen',
  },
  account: {
    settings: 'Einstellungen',
    settingsDescription: 'Gilt nur für dieses Konto, nicht für die ganze Praxis.',
  },
  preferences: {
    theme: {
      label: 'Farbschema',
      options: {
        schiefer: 'Schiefer',
        blau: 'Blau',
        salbei: 'Salbei',
        rose: 'Rosé',
        nacht: 'Nacht',
      },
    },
    startPage: {
      label: 'Startseite nach dem Anmelden',
      options: {
        overview: 'Übersicht',
        contacts: 'Kontakte',
        calendar: 'Kalender',
        activities: 'Vorgänge',
      },
      // The effect is invisible until the next sign-in, unlike the theme —
      // without this the value just quietly changed.
      saved: 'Startseite gespeichert. Wirkt beim nächsten Anmelden.',
    },
  },
  login: {
    description: 'Bitte melden Sie sich mit Ihren Zugangsdaten an.',
    email: 'E-Mail-Adresse',
    password: 'Passwort',
    submit: 'Anmelden',
    submitting: 'Anmeldung läuft …',
    failed: 'E-Mail-Adresse oder Passwort ist falsch.',
  },
  /** The left-hand section list of `/settings` (D4) — one hint per entry,
   *  reused as both the nav's secondary line and the panel's own title-bar
   *  hint where that panel has one. Rollen, Beziehungen and Vorgangsarten
   *  reuse `contactType`/`activityType`'s own hint instead of repeating it
   *  here; Textbausteine reuses `invoice.templatesHint`. */
  settingsNav: {
    practiceHint: 'Stammdaten, Anschrift, Bank',
    invoicingHint: 'Nummernkreis, Vorlage, Zahlungsziel',
    mailHint: 'Konto und Vorlagen',
    googleHint: 'Projektion der Termine',
  },
  settings: {
    pageTitle: 'Einstellungen',
    pageDescription: 'Was für die ganze Praxis gilt.',
    sectionPractice: 'Praxis',
    sectionAddress: 'Anschrift',
    sectionContact: 'Kontakt',
    sectionBanking: 'Bankverbindung',
    sectionInvoicing: 'Rechnungsstellung',
    sectionOpeningHours: 'Öffnungszeiten',
    practiceName: 'Praxisname',
    street: 'Straße und Hausnummer',
    postalCode: 'PLZ',
    city: 'Ort',
    country: 'Land (ISO-Code, z. B. DE)',
    phone: 'Telefon',
    email: 'E-Mail-Adresse',
    website: 'Website',
    taxNumber: 'Steuernummer',
    bankName: 'Bank',
    iban: 'IBAN',
    bic: 'BIC',
    defaultPaymentTermDays: 'Zahlungsziel in Tagen',
    save: 'Speichern',
    saving: 'Wird gespeichert …',
    saved: 'Praxisstammdaten gespeichert.',
    saveFailed: 'Die Praxisstammdaten konnten nicht gespeichert werden.',
  },
  contactType: {
    tabRoles: 'Rollen',
    tabRelations: 'Beziehungen',
    rolesHint: 'bestimmen, in welchen Listen ein Kontakt auftaucht',
    relationsHint: 'verbinden zwei Kontakte und erscheinen in beiden Akten',
    rolesFooter:
      'Ein System-Eintrag lässt sich umbenennen, aber nicht löschen — sein Kürzel bleibt, ' +
      'wie es ist.',
    relationsFooter:
      'Der erste Kontakt ist der, in dessen Akte der Sachverhalt eine Eigenschaft dieses ' +
      'Kontakts ist — das Kind hat einen Sorgeberechtigten. Der zweite Kontakt ist das Gegenüber.',

    code: 'Kürzel',
    codeHint:
      'Technisches Kürzel, klein geschrieben, ohne Leerzeichen. Es steht mit dem Anlegen fest ' +
      'und lässt sich später nicht mehr ändern.',
    label: 'Bezeichnung',
    labelForward: 'Bezeichnung in der Akte des ersten Kontakts',
    labelInverse: 'Bezeichnung in der Akte des zweiten Kontakts',
    /** The direction convention, in one sentence, where it is decided. */
    directionHint:
      'Der erste Kontakt ist der, in dessen Akte der Sachverhalt eine Eigenschaft dieses ' +
      'Kontakts ist — das Kind hat einen Sorgeberechtigten, der Patient hat einen ' +
      'Rechnungsempfänger. Der zweite Kontakt ist das Gegenüber.',
    /** The radio pair replacing a single "einseitig" checkbox — nothing here
     *  is inverted relative to `isSymmetric`, and nothing has to be
     *  remembered (D4, correcting the prototype's own inverted checkbox). */
    directionMutualLabel: 'Gegenseitig — beide Seiten heißen gleich',
    directionMutualExample: 'Beispiel: Ehepartner von / Ehepartner von',
    directionDirectedLabel: 'Gerichtet — jede Seite hat eine eigene Bezeichnung',
    directionDirectedExample: 'Beispiel: Elternteil von / Kind von',
    exclusive: 'Höchstens einmal pro Kontakt',
    exclusiveHint:
      'Zum Beispiel der Rechnungsempfänger: ein Kontakt hat höchstens einen — umgekehrt darf ' +
      'ein Rechnungsempfänger für mehrere Kontakte zuständig sein.',
    showAsTab: 'Als Reiter in der Kontaktliste',
    active: 'Aktiv',
    systemBadge: 'System',
    exclusiveBadge: 'Nur einmal',
    symmetricBadge: 'Beidseitig',
    systemHint:
      'Auf diesem Eintrag baut die Software auf. Er lässt sich umbenennen, aber nicht löschen, ' +
      'und sein Kürzel bleibt, wie es ist.',

    createRole: 'Neue Rolle',
    createRelation: 'Neue Beziehungsart',

    emptyRoles: 'Keine Rollen vorhanden.',
    emptyRelations: 'Keine Beziehungsarten vorhanden.',
    saved: 'Eintrag gespeichert.',
    deleted: 'Eintrag gelöscht.',
    saveFailed: 'Der Eintrag konnte nicht gespeichert werden.',
    deleteTitle: 'Eintrag löschen?',
    deleteBody:
      'Der Eintrag verschwindet aus der Auswahl. Solange er noch verwendet wird, lässt er sich ' +
      'nicht löschen — setzen Sie ihn dann auf inaktiv.',
  },
  activityType: {
    title: 'Vorgangsarten',
    hint: 'Farbe im Kalender und Vorbelegung beim Anlegen',
    footer:
      'Inaktive Arten erscheinen in keiner Auswahlliste, bleiben aber an bestehenden Vorgängen.',

    create: 'Neue Vorgangsart',
    empty: 'Noch keine Vorgangsarten.',

    code: 'Kürzel',
    codeHint:
      'Technisches Kürzel, klein geschrieben, ohne Leerzeichen. Es steht mit dem Anlegen fest ' +
      'und lässt sich später nicht mehr ändern.',
    label: 'Bezeichnung',
    color: 'Farbe',
    colorHint: 'Damit wird der Termin im Kalender hinterlegt.',
    defaultDuration: 'Dauer in Minuten',
    defaultDurationHint: 'Leer lassen, wenn es keine übliche Dauer gibt.',
    preset: 'Leistungen',
    presetLongHint:
      'Wird beim Anlegen eines Vorgangs als Position eingesetzt. Eine Gruppe wird dabei sofort ' +
      'in einzelne Positionen aufgelöst und erscheint selbst nie in dieser Liste. Spätere ' +
      'Änderungen hier wirken sich auf nichts Bestehendes aus.',
    presetEmpty: 'Keine Leistung vorbelegt.',
    presetAdd: 'Leistung hinzufügen',
    presetService: 'Leistung',
    presetGroup: 'Leistungsgruppe',
    presetQuantity: 'Menge',
    isDefault: 'Standard für neue Vorgänge',
    isDefaultHint: 'Genau eine Art kann das sein. Die bisherige verliert die Markierung.',
    defaultBadge: 'Standard',
    active: 'Aktiv',
    activeHint: 'Inaktive Arten erscheinen in keiner Auswahlliste, bleiben aber an Vorgängen.',

    saved: 'Vorgangsart gespeichert.',
    deleted: 'Vorgangsart gelöscht.',
    saveFailed: 'Die Vorgangsart konnte nicht gespeichert werden.',
    deleteTitle: 'Vorgangsart löschen?',
    deleteBody:
      'Die Art verschwindet aus der Auswahl. Solange sie noch von Vorgängen verwendet wird, ' +
      'lässt sie sich nicht löschen — setzen Sie sie dann auf inaktiv.',
  },
  validation: {
    required: 'Dieses Feld ist erforderlich.',
    email: 'Bitte eine gültige E-Mail-Adresse eingeben.',
    iban: 'Diese IBAN ist ungültig.',
    country: 'Bitte einen zweistelligen Länder-Code eingeben, zum Beispiel DE.',
    paymentTerm: 'Bitte eine Zahl zwischen 0 und 365 eingeben.',
    tooLong: 'Diese Eingabe ist zu lang.',
    amount: 'Bitte einen Betrag eingeben, zum Beispiel 90,00.',
    duration: 'Bitte eine Dauer in Minuten eingeben oder das Feld leer lassen.',
  },
  contact: {
    title: 'Kontakte',
    description: 'Personen und Organisationen der Praxis.',
    create: 'Neuer Kontakt',
    createTitle: 'Kontakt anlegen',
    search: 'Suchen',
    searchPlaceholder: 'Name, Firma oder Kontaktnummer',
    showArchived: 'Archivierte anzeigen',
    empty: 'Keine Kontakte vorhanden.',
    emptyFiltered: 'Kein Kontakt passt zu dieser Suche.',
    /** The page size travels with it: the line only appears when the list is
     *  truncated, and then "why 50 of 214" is the next question. */
    countOf: (shown: number, total: number, pageSize?: number) =>
      pageSize === undefined
        ? `${shown} von ${total} angezeigt`
        : `${shown} von ${total} angezeigt · Seitengröße ${pageSize}`,
    archivedBadge: 'Archiviert',

    kindLabel: 'Art',
    kind: {
      person: 'Person',
      organization: 'Organisation',
    },
    kindImmutable: 'Die Art kann nachträglich nicht geändert werden.',

    roleLabel: 'Rollen',
    /** The labels themselves come from `contact_role_type` — the practitioner
     *  maintains them in the settings, so there is nothing to translate here. */
    roleHint: 'Die Rollen selbst pflegen Sie in den Einstellungen.',
    moreRoles: 'Weitere Rollen',
    orderCurrent: 'Aktuell',
    orderAlpha: 'A–Z',
    searchAll: 'Die Suche geht über alle Kontakte — unabhängig von Rolle und Zeitfenster.',
    emptyCurrent: 'In den letzten und nächsten zwei Wochen hat niemand einen Termin.',
    emptyCurrentAction: 'Alle Kontakte anzeigen',
    allRolesTab: 'Alle',
    noRoles: 'Keine Rolle zugewiesen',

    relations: 'Beziehungen',
    relationsEmpty: 'Keine Beziehungen hinterlegt.',
    relationAdd: 'Beziehung hinzufügen',
    relationKind: 'Art der Beziehung',
    relationOther: 'Kontakt',
    relationSave: 'Hinzufügen',
    relationAdded: 'Beziehung hinzugefügt.',
    relationRemoved: 'Beziehung entfernt.',
    relationRemove: 'Entfernen',
    relationReplace: 'Ersetzen',
    relationTaken: 'bereits gesetzt',
    relationRemoveTitle: 'Beziehung entfernen?',
    relationRemoveBody:
      'Die Beziehung verschwindet aus beiden Akten. Die Kontakte selbst bleiben unverändert.',
    relationFailed: 'Die Beziehung konnte nicht gespeichert werden.',
    relationNoTypes:
      'Es sind keine Beziehungsarten hinterlegt. Sie legen sie in den Einstellungen an.',

    columns: {
      number: 'Nr.',
      name: 'Name',
      roles: 'Rollen',
      city: 'Ort',
      dateOfBirth: 'Geburtsdatum',
      appointment: 'Termin',
    },

    sectionName: 'Name',
    sectionRoles: 'Rollen',
    sectionRolesHint: 'Nur beim Anlegen hier wählbar, später über den Kopfbereich.',
    sectionAddress: 'Anschrift',
    sectionAddressHint:
      'Hausnummer ihr eigenes Feld, für Anzeige und Rechnung wieder zusammengesetzt.',
    sectionContact: 'Kontakt',
    sectionContactHint:
      'Mobil und Festnetz getrennt — die Art entscheidet, ob man anruft oder schreibt.',
    sectionInternal: 'Intern',
    salutation: 'Anrede',
    salutationOptions: ['Herr', 'Frau'],
    academicTitle: 'Titel',
    firstName: 'Vorname',
    lastName: 'Nachname',
    dateOfBirth: 'Geburtsdatum',
    birthPlace: 'Geburtsort',
    gender: 'Geschlecht',
    genderNone: 'Keine Angabe',
    /** The three values, written out. Never derived from the stored value —
     *  the column holds English identifiers, the screen shows German. */
    genders: {
      female: 'weiblich',
      male: 'männlich',
      diverse: 'divers',
    },
    companyName: 'Firmenname',
    contactPerson: 'Ansprechpartner',
    vatId: 'USt-IdNr.',
    street: 'Straße',
    houseNumber: 'Hausnummer',
    postalCode: 'PLZ',
    city: 'Ort',
    country: 'Land (ISO-Code, z. B. DE)',
    email: 'E-Mail-Adresse',
    phoneMobile: 'Mobil',
    phoneLandline: 'Festnetz',
    internalNote: 'Interne Notiz',
    internalNoteHint: 'Nur intern sichtbar, erscheint auf keinem Dokument.',
    diagnosis: 'Diagnose',
    diagnosisHint: 'Vertraulich — erscheint nur hier, im Rechnungsentwurf und auf der Rechnung.',
    contactNumber: 'Kontaktnummer',

    save: 'Speichern',
    saving: 'Wird gespeichert …',
    created: 'Kontakt angelegt.',
    saved: 'Kontakt gespeichert.',
    saveFailed: 'Der Kontakt konnte nicht gespeichert werden.',

    archive: 'Archivieren',
    unarchive: 'Wiederherstellen',
    archived: 'Kontakt archiviert.',
    unarchived: 'Kontakt wiederhergestellt.',
    archiveTitle: 'Kontakt archivieren?',
    archiveBody:
      'Der Kontakt verschwindet aus der Liste, bleibt aber erhalten und kann jederzeit ' +
      'wiederhergestellt werden. Gelöscht wird nichts.',
    cancel: 'Abbrechen',

    ageYears: (years: number) => `${years} Jahre`,
    editRoles: 'Rollen bearbeiten',

    overviewThread: 'Termine und Vorgänge',
    nextAppointment: 'Nächster Termin',
    noNextAppointment: 'Kein Termin geplant.',
    lastActivity: 'Letzter Vorgang',
    document: 'Dokumentieren',
    recentActivities: 'Letzte Vorgänge',
    documented: 'Dokumentiert',
    notDocumented: 'Nicht dokumentiert',
    noContactData: 'Keine Kontaktdaten hinterlegt.',
    billable: 'Abrechenbar',
    noBillable: 'Nichts offen.',
    billableCount: (count: number) =>
      count === 1 ? '1 offene Position' : `${count} offene Positionen`,
    openDraft: 'Zum Rechnungsentwurf',
    invoicesFinalized: (count: number) =>
      count === 1 ? '1 festgeschriebene Rechnung' : `${count} festgeschriebene Rechnungen`,
    invoicesOpen: (count: number) => (count === 1 ? '1 offene Rechnung' : `${count} offen`),
    invoicesSettled: 'Nichts offen.',
    invoicesOverdue: (count: number) => (count === 1 ? '1 überfällig' : `${count} überfällig`),
    guardianMissing:
      'Dieser Kontakt ist noch nicht volljährig, und es ist niemand als sorgeberechtigt ' +
      'hinterlegt. Sie können das unter „Verknüpfte Kontakte" ergänzen.',

    tabs: {
      overview: 'Übersicht',
      master: 'Stammdaten',
      notes: 'Notizen',
      activities: 'Vorgänge',
      appointments: 'Termine',
      invoices: 'Rechnungen',
    },
  },
  service: {
    title: 'Leistungen',
    description: 'Der Leistungskatalog. Vorlagen für Vorgänge und Rechnungen.',
    /** CLAUDE.md rule 5 — worth saying on screen, because it is the opposite
     *  of what most catalogues do. */
    templateHint:
      'Der Katalog ist eine Vorlage. Beim Anlegen eines Vorgangs werden Bezeichnung, Ziffer, ' +
      'Preis und Dauer kopiert — spätere Änderungen hier wirken sich auf nichts Bestehendes aus.',

    tabServices: 'Leistungen',
    tabGroups: 'Leistungsgruppen',

    create: 'Neue Leistung',
    createTitle: 'Leistung anlegen',
    createHint: 'wird in den Katalog aufgenommen',
    empty: 'Noch keine Leistungen im Katalog.',

    shortCode: 'Kürzel',
    shortCodeHint: 'Optional, für die Schnellauswahl. Muss eindeutig sein.',
    serviceDescription: 'Bezeichnung',
    feeCode: 'Ziffer (GebüH)',
    price: 'Preis',
    priceHint: 'In Euro, zum Beispiel 90,00',
    duration: 'Dauer',
    durationMinutes: 'Minuten',
    durationEmpty: 'ohne Dauer',
    active: 'Aktiv',
    activeHint: 'Inaktive Leistungen erscheinen in keiner Auswahlliste.',
    /** The inline detail's own hint — a fuller sentence than `activeHint`,
     *  which is the checkbox's caption in the form. */
    detailHintActive: 'Erscheint in allen Auswahllisten.',
    detailHintInactive: 'Erscheint in keiner Auswahlliste, bleibt aber an bestehenden Vorgängen.',
    deleteTitle: 'Leistung löschen?',
    deleteBody:
      'Die Leistung verschwindet aus dem Katalog. Vorgänge und Rechnungen, die sie bereits ' +
      'übernommen haben, bleiben unverändert — dort ist die Leistung kopiert.',
    deleted: 'Leistung gelöscht.',
    deleteFailed: 'Die Leistung konnte nicht gelöscht werden.',

    groupCreate: 'Neue Gruppe',
    groupCreateTitle: 'Leistungsgruppe anlegen',
    groupCreateHint: 'wird zur Auswahl beim Anlegen eines Vorgangs',
    groupEmpty: 'Noch keine Leistungsgruppen.',
    groupColumnLabel: 'Gruppe',
    groupColumnContains: 'Enthalten',
    groupColumnCount: 'Anzahl',
    groupName: 'Name',
    groupItems: 'Enthaltene Leistungen',
    groupItemsEmpty: 'Noch keine Leistung hinzugefügt.',
    groupChooseService: 'Leistung wählen',
    groupQuantity: 'Menge',
    groupSum: 'Summe',
    groupRemove: 'Entfernen',
    groupCount: (count: number) => (count === 1 ? '1 Leistung' : `${count} Leistungen`),
    /** A group may hold a service that was deactivated afterwards. */
    groupInactiveService: 'Diese Leistung ist inaktiv.',
    groupHint:
      'Eine Gruppe ist nur eine Auswahlhilfe. Beim Anlegen eines Vorgangs wird sie sofort in ' +
      'einzelne Positionen aufgelöst; gespeichert wird kein Verweis auf die Gruppe.',
    groupDeleteTitle: 'Leistungsgruppe löschen?',
    groupDeleteBody:
      'Die Gruppe verschwindet aus der Auswahl. Die enthaltenen Leistungen bleiben im Katalog.',
    groupDeleted: 'Leistungsgruppe gelöscht.',
    groupDeleteFailed: 'Die Leistungsgruppe konnte nicht gelöscht werden.',

    save: 'Speichern',
    saving: 'Wird gespeichert …',
    cancel: 'Abbrechen',
    created: 'Leistung angelegt.',
    saved: 'Leistung gespeichert.',
    groupCreated: 'Leistungsgruppe angelegt.',
    groupSaved: 'Leistungsgruppe gespeichert.',
    saveFailed: 'Der Eintrag konnte nicht gespeichert werden.',
  },
  activity: {
    title: 'Vorgänge',
    description: 'Was wann für wen erbracht wurde.',
    create: 'Neuer Vorgang',
    createTitle: 'Vorgang anlegen',
    createHint: 'Was erbracht wurde, und ob ein Termin dazugehört.',
    editTitle: 'Vorgang bearbeiten',
    /** The calendar's dialog in read mode — it is not an editor until
     *  "Bearbeiten" is pressed, and the heading must not say otherwise. */
    detailTitle: 'Vorgang',
    detailHint: 'Zum Ändern auf „Bearbeiten“.',
    empty: 'Noch keine Vorgänge.',

    type: 'Art',
    statusLabel: 'Status',
    statuses: {
      planned: 'Geplant',
      rendered: 'Stattgefunden',
      no_show: 'Nicht erschienen',
    },
    /** Rule 6, said where it could be misread: the status is documentation,
     *  not a switch. */
    statusHint: 'Der Status ist nur Dokumentation und steuert die Abrechnung nicht.',
    allStatuses: 'Alle',
    allTypes: 'Alle Arten',
    rangeFrom: 'Von',
    rangeTo: 'Bis',
    /** The line above the list. Reads as one sentence rather than three
     *  figures: it is the reason the page gets opened. */
    summary: (total: number, upcoming: number, unbilled: string) =>
      `${total} ${total === 1 ? 'Vorgang' : 'Vorgänge'} · ${upcoming} kommend · ` +
      `${unbilled} noch nicht abgerechnet`,
    sectionUpcoming: 'Kommend',
    sectionPast: 'Bisher',
    /** What the dialog says instead of quietly overwriting. */
    presetsUnchanged: 'Dauer und Positionen bleiben unverändert.',
    presetsApply: 'Aus der Vorgangsart übernehmen',
    presetsApplied: 'Vorbelegung übernommen.',
    contact: 'Kontakt',
    contactSearch: 'Name oder Kontaktnummer tippen',
    contactNoResults: 'Kein Kontakt gefunden. Archivierte Kontakte werden nicht vorgeschlagen.',
    contactLocked: 'fest',
    contactChange: 'Anderer Kontakt',
    contactRequired: 'Bitte zuerst einen Kontakt wählen.',
    occurredAt: 'Datum',
    occurredTime: 'Uhrzeit',
    durationMin: 'Dauer in Minuten',
    activityTitle: 'Bezeichnung',
    internalNote: 'Interne Notiz',
    internalNoteHint: 'Nur intern sichtbar, erscheint auf keinem Dokument.',

    items: 'Positionen',
    itemsEmpty: 'Noch keine Position.',
    addService: 'Leistung hinzufügen',
    addGroup: 'Leistungsgruppe einfügen',
    addFree: 'Freie Position',
    /** Rule 5, said plainly where it matters most. */
    copyHint:
      'Beim Hinzufügen werden Bezeichnung, Ziffer, Preis und Dauer aus dem Katalog kopiert. ' +
      'Ab dann gehören sie zu diesem Vorgang und ändern sich nicht mehr mit.',
    groupHint: 'Eine Gruppe wird sofort in einzelne Positionen aufgelöst.',
    itemDescription: 'Bezeichnung',
    itemFeeCode: 'Ziffer',
    itemQuantity: 'Menge',
    itemPrice: 'Einzelpreis',
    itemBillable: 'Abrechenbar',
    itemRemove: 'Position entfernen',
    itemMoveUp: 'Nach oben',
    itemMoveDown: 'Nach unten',
    sumBillable: 'Abrechenbar',
    sumTotal: 'Gesamt',
    sumTotalLong: 'Gesamt inkl. nicht abrechenbarer Positionen',
    notBillableBadge: 'nicht abrechenbar',
    section: 'Vorgang',
    appointmentSection: 'Termin',
    noAppointment: 'Kein Kalendertermin',
    openInCalendar: 'Im Kalender öffnen',

    withAppointment: 'Termin im Kalender anlegen',
    withAppointmentHint:
      'Ohne Termin wird der Vorgang nur dokumentiert und erscheint nicht im Kalender.',
    appointmentTo: 'Ende',
    appointmentRange: 'Zeitraum',
    appointmentRangeHint: 'Ergibt sich aus Beginn und Dauer.',
    durationRequired: 'Für einen Termin wird eine Dauer gebraucht.',
    appointmentStatus: 'Status',
    appointmentNote: 'Notiz zum Termin',

    save: 'Speichern',
    saving: 'Wird gespeichert …',
    cancel: 'Abbrechen',
    created: 'Vorgang angelegt.',
    saved: 'Vorgang gespeichert.',
    saveFailed: 'Der Vorgang konnte nicht gespeichert werden.',
  },
  /** "Freien Termin finden" (D9.5) — the calendar rail's third state. */
  slotFinder: {
    title: 'Freien Termin finden',
    open: 'Freien Termin finden',
    clear: 'Auswahl aufheben',
    minutes: (value: number) => `${value} Min`,
    orDuration: 'Oder nach freier Dauer (Minuten)',
    empty: 'In diesem Zeitraum ist nichts frei. Blättern Sie weiter.',
    /** Why the list of activity types is short — a missing entry, not a bug. */
    typesWithoutDuration: 'Arten ohne hinterlegte Dauer stehen hier nicht.',
    toActivityTypes: 'Vorgangsarten pflegen',
    noOpeningHours:
      'Ohne Öffnungszeiten kann nicht gesucht werden — sonst würde ein Arbeitstag geraten.',
    toOpeningHours: 'Öffnungszeiten hinterlegen',
    /** No connection, no selected calendar, or the query failed — all three
     *  mean the same thing here, so they read the same. */
    privateNotChecked:
      'Private Termine wurden nicht geprüft. Die Vorschläge kennen nur die Termine der Praxis.',
    slotLabel: (from: string, to: string) => `${from}–${to} frei`,
  },
  /** The weekly opening pattern (D9.5). A day with no window is closed, and
   *  the screen says that word rather than showing empty time fields. */
  openingHours: {
    title: 'Öffnungszeiten',
    hint:
      'Grundlage für die Terminsuche. Ein Tag ohne Zeitfenster gilt als geschlossen; ' +
      'eine Mittagspause ist einfach eine Lücke zwischen zwei Fenstern.',
    weekdays: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
    closed: 'Geschlossen',
    from: 'Von',
    to: 'Bis',
    addWindow: 'Zeitfenster',
    removeWindow: 'Zeitfenster entfernen',
    saved: 'Öffnungszeiten gespeichert.',
  },
  appointment: {
    title: 'Termine',
    description: 'Kalender der Praxis.',
    today: 'Heute',
    previous: 'Zurück',
    next: 'Weiter',
    /** Three views (D9). The month was dropped because at six sessions a day
     *  its cells would read "+5 weitere", and the list view is the Vorgänge
     *  page — an appointment cannot exist without its activity. */
    views: {
      day: 'Tag',
      workweek: 'Arbeitswoche',
      week: 'Woche',
    },
    empty: 'Keine Termine in diesem Zeitraum.',
    newHere: 'Termin anlegen',
    newAppointment: 'Neuer Termin',
    calendarWeek: (week: number) => `KW ${week}`,
    /** The right-hand rail. */
    dayOverview: 'Tagesüberblick',
    daySchedule: 'Ablauf',
    dayEmpty: 'Keine Termine an diesem Tag.',
    countAppointments: 'Termine',
    countHours: 'Stunden',
    countCancelled: 'Abgesagt',
    previousMonth: 'Vorheriger Monat',
    nextMonth: 'Nächster Monat',
    /** Dragging. The block springs back on refusal, so the message explains a
     *  movement the practitioner has already seen undone. */
    dragOverlap: 'Überschneidet sich',
    moved: 'Termin verschoben.',
    moveFailed: 'Der Termin konnte nicht verschoben werden.',
    close: 'Auswahl schließen',
    /** The slot, and only the slot. Whether the session took place is the
     *  activity's status. */
    status: {
      requested: 'Angefragt',
      planned: 'Geplant',
      confirmed: 'Bestätigt',
      cancelled: 'Abgesagt',
      cancelled_late: 'Kurzfristig abgesagt',
    },
    allStatuses: 'Alle',
    /** The distinction the exclusion constraint makes. */
    releasesSlot: 'Der Zeitraum wird dadurch wieder frei.',
    holdsSlot: 'Der Zeitraum bleibt belegt.',
  },
  mail: {
    title: 'Mailversand',
    accountTitle: 'Mailkonto',
    description:
      'Über dieses Konto werden Rechnungen versendet. Das Passwort wird verschlüsselt ' +
      'gespeichert und niemals zurückgegeben.',
    host: 'Server',
    port: 'Port',
    security: 'Verschlüsselung',
    securities: {
      starttls: 'STARTTLS (üblich, Port 587)',
      tls: 'TLS (Port 465)',
      none: 'Keine',
    },
    username: 'Benutzername',
    password: 'Passwort',
    /** The field's placeholder once a password is stored — read mode shows
     *  dots instead, this is what the empty, editable field says. */
    passwordPlaceholder: 'unverändert lassen',
    passwordClear: 'Passwort entfernen',
    fromAddress: 'Absenderadresse',
    fromName: 'Absendername',
    saved: 'Mailkonto gespeichert.',
    notConfigured: 'Es ist noch kein Mailkonto hinterlegt.',
    remove: 'Mailkonto entfernen',
    removed: 'Mailkonto entfernt.',

    test: 'Testmail senden',
    /** The safeguard, said out loud where the button is. */
    testHint:
      'Die Testmail geht ausschließlich an die Absenderadresse. Eine andere Adresse lässt ' +
      'sich hier nicht eintragen.',
    testOk: (recipient: string) => `Testmail an ${recipient} versendet.`,
    testFailed: 'Die Testmail wurde nicht angenommen.',

    templates: 'Mailvorlagen',
    templatesHint:
      'Betreff und Text für den Rechnungsversand. Beides lässt sich vor dem Absenden ' +
      'noch ändern.',
    templateName: 'Name',
    templateSubject: 'Betreff',
    templateBody: 'Text',
    templateDefault: 'Standard',
    templateActive: 'Aktiv',
    templateNew: 'Neue Vorlage',
    templateEmpty: 'Noch keine Mailvorlagen.',
    templateSaved: 'Vorlage gespeichert.',
    templateRemoved: 'Vorlage gelöscht.',
    templateRemoveTitle: 'Vorlage löschen?',
    templateRemoveBody: 'Die Mailvorlage wird endgültig gelöscht.',
    /** Betreff and Text share this closed set — never the number-range
     *  prefix placeholders (YYYY/MM/Q), a different list for a different
     *  field (README's own warning, D4). */
    placeholderPrompt: 'Im Betreff und im Text lassen sich Platzhalter verwenden.',
    viewPlaceholders: 'Platzhalter ansehen',
    placeholderDialogTitle: 'Platzhalter',
    placeholderDialogDescription: 'Werden beim Versand durch die Werte der Rechnung ersetzt.',
    placeholderList: [
      { token: '{{number}}', meaning: 'Rechnungsnummer' },
      { token: '{{date}}', meaning: 'Rechnungsdatum' },
      { token: '{{total}}', meaning: 'Gesamtbetrag' },
      { token: '{{name}}', meaning: 'Empfängername' },
    ],

    send: 'Per Mail senden',
    /** Why the recipient field opened empty. Shown only while it still is —
     *  it explains a gap and is pointless once one is typed in. */
    noRecipientAddress:
      'Für diesen Empfänger ist keine E-Mail-Adresse hinterlegt. Tragen Sie sie hier von Hand ' +
      'ein oder ergänzen Sie sie am Kontakt.',
    noTemplate:
      'Es ist keine Mailvorlage hinterlegt. Betreff und Text lassen sich hier von Hand ' +
      'schreiben; eine Vorlage legen Sie in den Einstellungen an.',
    template: 'Vorlage',
    templateChanged: 'Betreff und Text wurden nicht ersetzt, weil Sie sie bereits geändert haben.',
    templateApply: 'Vorlage übernehmen',
    sendTitle: 'Rechnung versenden',
    sendDescription: 'Die Rechnung geht als PDF-Anhang an diese Adresse.',
    recipient: 'Empfänger',
    recipientHint: 'Vorbelegt mit dem Rechnungsempfänger, falls hinterlegt. Änderbar.',
    subject: 'Betreff',
    body: 'Text',
    sending: 'Wird gesendet …',
    sendNow: 'Senden',
    sent: (recipient: string) => `Rechnung an ${recipient} versendet.`,
    sendFailed: 'Die Mail wurde nicht angenommen.',
    /** Left standing rather than emptied — and pointed at here, so it is
     *  noticed before the recipient notices it. */
    unknownPlaceholders: (names: string[]) =>
      names.length === 1
        ? `Im Text steht ein unbekannter Platzhalter: {{${names[0]}}}. Er wird unverändert mitgesendet.`
        : `Im Text stehen unbekannte Platzhalter: ${names.map((name) => `{{${name}}}`).join(', ')}. ` +
          'Sie werden unverändert mitgesendet.',

    history: 'Versendet',
    historyEmpty: 'Noch nicht versendet.',
    historyOk: 'zugestellt an den Server',
    historyFailed: 'fehlgeschlagen',
  },
  google: {
    title: 'Google-Kalender',
    description:
      'Termine erscheinen im Google-Kalender ausschließlich mit der Kontaktnummer — ' +
      'ohne Namen, ohne Leistung, ohne Vorgangsart. Die Praxisdatenbank bleibt das ' +
      'führende System; der Google-Kalender ist eine Projektion.',
    notConfigured:
      'Nicht eingerichtet. In der Umgebung fehlen GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ' +
      'oder ENCRYPTION_KEY.',
    notConnected: 'Nicht verbunden.',
    connectedAs: 'Verbunden als',
    connect: 'Mit Google verbinden',
    connectHint:
      'Die Anmeldung öffnet sich in einem neuen Fenster. Danach kehren Sie hierher zurück.',
    disconnect: 'Verbindung trennen',
    disconnectTitle: 'Verbindung zu Google trennen',
    disconnectQuestion: 'Was soll mit den Terminen geschehen, die bereits in Google stehen?',
    disconnectKeep: 'Stehen lassen',
    disconnectKeepHint: 'Nichts geht verloren. Die Einträge bleiben, wo sie sind.',
    disconnectDelete: 'In Google löschen',
    disconnectDeleteHint:
      'Es werden nur Termine gelöscht, die diese Software dort angelegt hat. ' +
      'Was sich nicht löschen lässt, wird Ihnen danach mit Datum und Uhrzeit genannt.',
    disconnected: 'Verbindung getrennt.',
    disconnectedWithDeletions: (deleted: number, attempted: number) =>
      `Verbindung getrennt. ${deleted} von ${attempted} Terminen in Google gelöscht.`,
    disconnectRemaining: 'Diese Termine stehen weiterhin in Google und müssen von Hand weg:',
    keyMismatch:
      'Der hinterlegte Schlüssel passt nicht zum gespeicherten Token. Setzen Sie den ' +
      'ursprünglichen ENCRYPTION_KEY zurück oder verbinden Sie neu.',
    practiceCalendar: 'Praxiskalender',
    practiceCalendarHint:
      'Hierhin werden Termine geschrieben. Am besten ein eigener Kalender, kein privater.',
    practiceCalendarNone: 'Keiner — es wird nichts geschrieben',
    practiceCalendarReadOnly: 'nur lesbar',
    freebusyCalendars: 'Kalender für die Belegtzeiten',
    freebusyCalendarsHint:
      'Beim Planen werden aus diesen Kalendern nur die belegten Zeiträume abgefragt — ' +
      'keine Titel, keine Teilnehmer. Das Zugriffsrecht lässt nichts anderes zu.',
    lastSync: 'Letzte Synchronisation',
    never: 'noch nie',
    queue: 'Warteschlange',
    queueEmpty: 'nichts offen',
    queuePending: (count: number) => `${count} offen`,
    queueStuck: (count: number) => `${count} hängen fest`,
    lastError: 'Letzter Fehler',
    syncNow: 'Jetzt synchronisieren',
    syncResult: (result: { pushed: number; failed: number; pulled: number }) =>
      `${result.pushed} gesendet, ${result.failed} fehlgeschlagen, ${result.pulled} übernommen.`,
    saved: 'Einstellung gespeichert.',
    /** The busy blocks from the private calendars, painted behind the entries. */
    busyLegend: 'Privat belegt',
    conflictsBanner: (count: number) =>
      count === 1
        ? 'Ein Termin wurde auf beiden Seiten geändert.'
        : `${count} Termine wurden auf beiden Seiten geändert.`,
    conflictsOpen: 'Ansehen',
    conflictsTitle: 'Auf beiden Seiten geändert',
    conflictsDescription:
      'Diese Termine wurden hier und in Google geändert. Es wird nichts zusammengeführt — ' +
      'wählen Sie je Termin, welche Fassung gilt.',
    conflictLocal: 'Hier',
    conflictRemote: 'In Google',
    conflictKeepLocal: 'Diese Fassung behalten',
    conflictKeepRemote: 'Google übernehmen',
    conflictCancelled: 'abgesagt',
    conflictReasons: {
      overlap: 'Die Zeiten aus Google überschneiden sich mit einem anderen Termin.',
    },
    conflictResolved: 'Konflikt aufgelöst.',
    contactNumberShort: 'Kontakt',
  },
  note: {
    title: 'Notizen',
    create: 'Neue Notiz',
    createTitle: 'Notiz anlegen',
    editTitle: 'Notiz bearbeiten',
    addendumTitle: 'Nachtrag schreiben',
    empty: 'Noch keine Notizen.',

    noteDate: 'Datum',
    type: 'Art',
    types: {
      general: 'Allgemein',
      session: 'Sitzung',
      document: 'Dokument',
      correspondence: 'Korrespondenz',
      addendum: 'Nachtrag',
      other: 'Sonstiges',
    },
    text: 'Text',
    activity: 'Zum Vorgang',
    activityNone: 'Kein Vorgang',

    save: 'Speichern',
    saving: 'Wird gespeichert …',
    cancel: 'Abbrechen',
    created: 'Notiz angelegt.',
    saved: 'Notiz gespeichert.',
    saveFailed: 'Die Notiz konnte nicht gespeichert werden.',
    edit: 'Bearbeiten',
    remove: 'Löschen',
    removeTitle: 'Notiz löschen?',
    removeBody:
      'Die Notiz und ihre Anhänge werden gelöscht. Das lässt sich nicht rückgängig machen.',
    removed: 'Notiz gelöscht.',

    /** The one action in this application that cannot be taken back. Say so
     *  plainly — CLAUDE.md rule 7. */
    lock: 'Sperren',
    lockTitle: 'Notiz sperren?',
    lockBody:
      'Nach dem Sperren lässt sich diese Notiz nie wieder ändern oder löschen — auch nicht ' +
      'von Ihnen, auch nicht über die Datenbank. Angehängte Dateien ebenso wenig, und es ' +
      'kann keine weitere Datei mehr hinzukommen. Korrekturen sind danach nur noch als ' +
      'Nachtrag möglich, der sichtbar unter der Notiz steht.',
    lockConfirm: 'Endgültig sperren',
    locked: 'Notiz gesperrt.',
    lockFailed: 'Die Notiz konnte nicht gesperrt werden.',
    lockedBadge: 'Gesperrt',
    lockedAt: 'Gesperrt am',
    openBadge: 'Offen',
    addendumTo: 'Nachtrag zu',
    writeAddendum: 'Nachtrag',

    files: 'Anhänge',
    filesEmpty: 'Keine Anhänge.',
    fileAdd: 'Datei anhängen',
    fileUploading: 'Wird hochgeladen …',
    fileAdded: 'Datei angehängt.',
    fileFailed: 'Die Datei konnte nicht angehängt werden.',
    fileRemove: 'Datei entfernen',
    fileRemoved: 'Datei entfernt.',
    fileDownload: 'Herunterladen',
    fileHint:
      'PDF sowie JPEG, PNG, WebP, HEIC und TIFF, höchstens 25 MB. ' +
      'Anhänge sind Teil der Notiz und werden beim Sperren mit festgeschrieben.',
    /** The small Markdown a note may carry (D10). Five constructs, and the
     *  hint names all of them — the syntax is typed faster than it is clicked
     *  once one knows it. */
    formatBold: 'Fett',
    formatHeading: 'Zwischenüberschrift',
    formatBullets: 'Aufzählung',
    formatNumbered: 'Nummerierte Liste',
    formatHint: '**fett** · ## Überschrift · - Aufzählung · 1. Nummerierung',
    previewOn: 'Vorschau',
    previewOff: 'Bearbeiten',
    previewEmpty: 'Noch kein Text.',
    filesAfterSave: 'Dateien lassen sich anhängen, sobald die Notiz gespeichert ist.',

    chainCheck: 'Dokumentation prüfen',
    chainTitle: 'Prüfung der Dokumentation',
    chainRunning: 'Wird geprüft …',
    chainEmpty: 'Für diesen Kontakt ist noch keine Notiz gesperrt.',
    chainOk: 'Alles in Ordnung.',
    chainOkBody: (count: number) =>
      `${count} gesperrte ${count === 1 ? 'Notiz' : 'Notizen'} geprüft, einschließlich der ` +
      'angehängten Dateien. Keine Abweichung.',
    chainBroken: 'Es gibt Abweichungen.',
    chainBrokenBody:
      'Bitte sichern Sie den aktuellen Stand und klären Sie die Ursache, bevor Sie ' +
      'weiterarbeiten.',
    chainContentBroken:
      'Der Inhalt weicht von der gespeicherten Prüfsumme ab — die Zeile wurde nach dem ' +
      'Sperren verändert.',
    chainLinkBroken:
      'Die Kette ist an dieser Stelle unterbrochen — davor wurde eine Notiz entfernt oder ' +
      'eingefügt.',
    chainFileMismatch: 'Der Inhalt dieser Datei weicht ab.',
    chainFileMissing: 'Diese Datei liegt nicht mehr auf der Festplatte.',
    chainEntryOk: 'unverändert',
  },
  invoice: {
    title: 'Rechnungen',
    create: 'Neue Rechnung',
    createHint: 'Für welchen Kontakt? Die Positionen kommen danach im Entwurf dazu.',
    createConfirm: 'Entwurf anlegen',
    empty: 'Noch keine Rechnungen.',
    emptyDraft: 'Diese Rechnung hat noch keine Position.',

    statusLabel: 'Status',
    statuses: {
      draft: 'Entwurf',
      finalized: 'Festgeschrieben',
      cancelled: 'Storniert',
    },
    types: {
      invoice: 'Rechnung',
      cancellation_invoice: 'Stornorechnung',
    },
    all: 'Alle',
    /** The one chip band of the merged list (D7) — `invoiceListFilters` in
     *  `packages/shared` decides what each of them matches. */
    filters: {
      draft: 'Entwürfe',
      open: 'Offen',
      partially_paid: 'Teilweise bezahlt',
      overdue: 'Überfällig',
      paid: 'Bezahlt',
      cancelled: 'Storniert',
    },
    emptyFiltered: 'Keine Rechnung passt zu diesem Filter.',
    openTotal: (amount: string) => `Offen insgesamt: ${amount}`,

    number: 'Nummer',
    contact: 'Empfänger',
    invoiceDate: 'Rechnungsdatum',
    dueDate: 'Zahlbar bis',
    paidAmount: 'Bezahlt',
    openAmount: 'Offen',
    paymentTermDays: 'Zahlungsziel in Tagen',
    total: 'Betrag',
    introText: 'Einleitungstext',
    outroText: 'Schlusstext',
    diagnosis: 'Diagnose',
    diagnosisHint:
      'Aus den Stammdaten vorbelegt, für diese Rechnung überschreibbar. Erscheint auf der ' +
      'Rechnung.',
    insertTemplate: 'Baustein einfügen',
    textHint:
      'Der eingefügte Text gehört ab dann zu dieser Rechnung und ändert sich nicht mehr mit ' +
      'dem Baustein.',

    lines: 'Positionen',
    lineDescription: 'Bezeichnung',
    lineFeeCode: 'Ziffer',
    lineDate: 'Datum',
    lineQuantity: 'Menge',
    lineUnitPrice: 'Einzelpreis',
    lineRemove: 'Position entfernen',
    lineMoveUp: 'Nach oben',
    lineMoveDown: 'Nach unten',
    addFreeLine: 'Freie Position',

    billable: 'Offene Positionen',
    billableEmpty: 'Für diesen Kontakt ist nichts offen.',
    billableHint:
      'Positionen aus Vorgängen, die auf keiner aktiven Rechnung stehen. ' +
      'Eine stornierte Rechnung gibt ihre Positionen wieder frei.',
    addSelected: 'Ausgewählte übernehmen',

    save: 'Speichern',
    saving: 'Wird gespeichert …',
    saved: 'Rechnung gespeichert.',
    saveFailed: 'Die Rechnung konnte nicht gespeichert werden.',
    created: 'Entwurf angelegt.',
    preview: 'Vorschau',
    download: 'Dokument öffnen',
    discard: 'Entwurf verwerfen',
    discardTitle: 'Entwurf verwerfen?',
    discardBody:
      'Der Entwurf wird gelöscht. Er hat noch keine Nummer, es entsteht also keine Lücke. ' +
      'Die Positionen werden wieder frei.',
    discarded: 'Entwurf verworfen.',

    finalize: 'Festschreiben',
    finalizeTitle: 'Rechnung festschreiben?',
    finalizeBody:
      'Die Rechnung erhält ihre Nummer, das PDF wird erzeugt und abgelegt. Danach lässt sich ' +
      'nichts mehr ändern — weder Betrag noch Text noch Empfänger. Eine Korrektur ist nur ' +
      'noch über eine Stornorechnung möglich.',
    finalizeConfirm: 'Endgültig festschreiben',
    finalized: 'Rechnung festgeschrieben.',
    finalizeFailed: 'Die Rechnung konnte nicht festgeschrieben werden.',

    paymentState: 'Zahlungsstand',
    cancel: 'Stornieren',
    cancelTitle: 'Rechnung stornieren?',
    cancelBody:
      'Es entsteht eine Stornorechnung mit eigener Nummer und negativen Beträgen. Die ' +
      'ursprüngliche Rechnung bleibt unverändert erhalten, und ihre Positionen werden wieder ' +
      'abrechenbar. Rückgängig machen lässt sich das nicht.',
    cancelConfirm: 'Stornorechnung ausstellen',
    cancelled: 'Stornorechnung ausgestellt.',
    cancelFailed: 'Die Rechnung konnte nicht storniert werden.',
    /** Both directions of the link, wherever a document is shown. */
    cancelledBy: 'Storniert durch',
    cancels: 'Storno zu',

    paymentTermTitle: 'Zahlungsziel',
    paymentTermSaved: 'Zahlungsziel gespeichert.',
    paymentTermSaveFailed: 'Das Zahlungsziel konnte nicht gespeichert werden.',
    numberRanges: 'Nummernkreise',
    numberRangeHint:
      'Die Rechnungsnummer wird beim Festschreiben vergeben und danach nie wieder geändert. ' +
      'Zum Jahreswechsel setzen Sie das Präfix auf das neue Jahr und den nächsten Wert ' +
      'zurück auf 1.',
    numberRangeCodes: {
      invoice: 'Rechnungen',
      contact: 'Kontaktnummern',
    },
    numberRangeNotCreated: 'Noch nicht angelegt',
    numberRangeCreate: 'Nummernkreis anlegen',
    numberRangeCreated: 'Nummernkreis angelegt.',
    numberRangeSelfCreating:
      'Wird beim ersten Kontakt automatisch angelegt und beginnt bei 1. Sie müssen hier ' +
      'nichts tun — nur wenn Sie eine bestehende Nummerierung fortsetzen wollen.',
    prefix: 'Präfix',
    padding: 'Stellen',
    nextValue: 'Nächste Nummer',
    nextNumberPreview: 'Nächste Nummer wäre',
    numberRangeSaved: 'Nummernkreis gespeichert.',
    numberRangeMissing:
      'Für Rechnungen ist noch kein Nummernkreis eingerichtet. Ohne ihn lässt sich keine ' +
      'Rechnung festschreiben.',

    templates: 'Textbausteine',
    templatesHint: 'Einleitung und Schluss für neue Rechnungen',
    templateKind: 'Art',
    templateKinds: { intro: 'Einleitung', outro: 'Schluss' },
    templateName: 'Name',
    templateBody: 'Text',
    templateDefault: 'Standard',
    templateDefaultHint: 'Wird bei einer neuen Rechnung vorbelegt.',
    templatePaidVariant: 'Variante „bereits bezahlt"',
    templatePaidVariantHint:
      'Nur für Schlusstexte. Wird verwendet, sobald die Aktion „Betrag erhalten" dazukommt.',
    templateActive: 'Aktiv',
    templateNew: 'Neuer Baustein',
    templateSaved: 'Baustein gespeichert.',
    templateRemoved: 'Baustein gelöscht.',
    templateRemoveTitle: 'Baustein löschen?',
    templateRemoveBody: 'Der Textbaustein wird endgültig gelöscht.',
    templateEmpty: 'Noch keine Textbausteine.',

    letterhead: 'Rechnungsvorlage',
    letterheadHint:
      'Ein PDF mit Ihrem Briefkopf. Eine Seite trägt jede Seite der Rechnung; bei zwei Seiten ' +
      'trägt Seite 1 die erste und Seite 2 alle weiteren. Der Inhalt wird darübergelegt.',
    letterheadUpload: 'Vorlage hochladen',
    letterheadReplace: 'Vorlage ersetzen',
    letterheadShow: 'Hinterlegte Vorlage ansehen',
    letterheadUploaded: 'Vorlage gespeichert.',
    letterheadNone: 'Keine Vorlage hinterlegt — Rechnungen drucken auf weißem Grund.',
    letterheadOnePage: 'Einseitig',
    letterheadTwoPages: 'Zweiseitig',
    letterheadOnePageHint: 'Diese Seite trägt jede Seite der Rechnung.',
    letterheadTwoPagesHint: 'Seite 1 trägt die erste Rechnungsseite, Seite 2 alle weiteren.',
  },
  payment: {
    title: 'Zahlungen',
    empty: 'Noch keine Zahlung erfasst.',
    add: 'Zahlung erfassen',
    addTitle: 'Zahlung erfassen',
    paidOn: 'Datum',
    amount: 'Betrag',
    amountHint: 'In Euro. Ein negativer Betrag erfasst eine Rückzahlung.',
    method: 'Zahlweg',
    methods: {
      bank_transfer: 'Überweisung',
      card: 'Karte',
      other: 'Sonstiges',
    },
    note: 'Notiz',
    save: 'Erfassen',
    saved: 'Zahlung erfasst.',
    saveFailed: 'Die Zahlung konnte nicht erfasst werden.',
    remove: 'Zahlung löschen',
    removed: 'Zahlung gelöscht.',
    removeTitle: 'Zahlung löschen?',
    /** Names the amount and the date: with several payments on one invoice it
     *  is otherwise unclear which one is about to go. */
    removeBody: (amount: string, date: string) =>
      `Die Zahlung über ${amount} vom ${date} wird gelöscht. Der Zahlungsstand der Rechnung ` +
      'ändert sich entsprechend.',

    sumPaid: 'Bezahlt',
    sumOpen: 'Offen',
    statuses: {
      open: 'Offen',
      partially_paid: 'Teilweise bezahlt',
      paid: 'Bezahlt',
      overpaid: 'Überzahlt',
      cancelled: 'Storniert',
      cancellation: 'Stornorechnung',
    },
    overdueBy: (days: number) => (days === 1 ? 'seit 1 Tag fällig' : `seit ${days} Tagen fällig`),

    settle: 'Betrag erhalten',
    settleTitle: 'Rechnung festschreiben und als bezahlt erfassen?',
    settleBody:
      'Die Rechnung wird festgeschrieben, erhält ihre Nummer und ihr PDF — und es wird sofort ' +
      'eine Zahlung über den vollen Betrag mit Zahlweg „Karte" und dem Rechnungsdatum erfasst. ' +
      'Ist ein Schlusstext für bezahlte Rechnungen hinterlegt, wird er verwendet. Die Zahlung ' +
      'lässt sich danach korrigieren oder löschen, die Rechnung nicht mehr.',
    settleConfirm: 'Festschreiben und bezahlt',
    settled: 'Festgeschrieben und als bezahlt erfasst.',
    /** The one thing that would otherwise go unnoticed for months: a document
     *  that asks for payment although it was settled on the spot. */
    settledWithoutTemplate:
      'Festgeschrieben und als bezahlt erfasst. Es ist kein Schlusstext für bezahlte Rechnungen ' +
      'hinterlegt — das Dokument fordert daher weiterhin zur Zahlung auf. Sie hinterlegen ihn ' +
      'in den Einstellungen unter „Rechnungsstellung".',
  },
  /** The Zahlungen screen (D7): the two tabs that replaced Abrechenbar,
   *  Rechnungen and Bezahlübersicht. */
  payments: {
    title: 'Zahlungen',
    description: 'Was erbracht und noch nicht abgerechnet ist, und was daraus geworden ist.',
    tabBillable: 'Offene Vorgänge',
    tabInvoices: 'Rechnungen',
    /** The sticky footer of the first tab. */
    selection: (count: number) =>
      count === 1 ? '1 Position ausgewählt' : `${count} Positionen ausgewählt`,
    selectionEmpty: 'Nichts ausgewählt',
  },
  /** Everything the date and time fields say. The *format* they follow is not
   *  here — that is `dateFormat` in packages/shared, one descriptor for the
   *  whole application. These are its labels. */
  date: {
    open: 'Kalender öffnen',
    today: 'Heute',
    month: 'Monat',
    year: 'Jahr',
    previousMonth: 'Voriger Monat',
    nextMonth: 'Nächster Monat',
    months: [
      'Januar',
      'Februar',
      'März',
      'April',
      'Mai',
      'Juni',
      'Juli',
      'August',
      'September',
      'Oktober',
      'November',
      'Dezember',
    ],
    weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
    invalid: (example: string) => `Kein gültiges Datum. Zum Beispiel ${example}.`,
    timeInvalid: (example: string) => `Keine gültige Uhrzeit. Zum Beispiel ${example}.`,
  },
  /**
   * The billable view and the two ways into it. The status of an activity is
   * shown here and never filters — see `billableQuerySchema`.
   */
  billable: {
    description:
      'Alle erbrachten Leistungen, die auf keiner aktiven Rechnung stehen — nach Kontakt ' +
      'gruppiert. Der Status eines Vorgangs wird angezeigt, filtert aber nicht: ein ' +
      'vergangener Vorgang, der noch auf „geplant“ steht, soll auffallen.',
    empty: 'Nichts offen — alles Erbrachte steht auf einer Rechnung.',
    collect: 'Rechnungen erstellen',
    draftExists: 'Entwurf vorhanden',
    total: 'Summe:',

    collectTitle: 'Rechnungsentwürfe erzeugen?',
    collectBody:
      'Pro Kontakt entsteht ein Entwurf. Hat ein Kontakt bereits einen, werden die Positionen ' +
      'dort angehängt statt einen zweiten anzulegen.',
    collectConfirm: 'Übernehmen',
    willCreate: (count: number) =>
      count === 1 ? 'neuer Entwurf, 1 Position' : `neuer Entwurf, ${count} Positionen`,
    willAppend: (count: number) =>
      count === 1
        ? 'an vorhandenen Entwurf, 1 Position'
        : `an vorhandenen Entwurf, ${count} Positionen`,
    collected: (count: number) =>
      count === 1 ? 'Entwurf steht bereit.' : `${count} Entwürfe stehen bereit.`,

    /** On a single activity. */
    fromActivity: 'Rechnung erstellen',
    stateOpen: 'Offen',
    stateBilled: 'Abgerechnet',
  },
  actions: {
    back: 'Zurück',
    save: 'Speichern',
    cancel: 'Abbrechen',
    delete: 'Löschen',
    edit: 'Bearbeiten',
    close: 'Schließen',
  },
  /** Shared by every catalogue list — `catalogue-controls.tsx` — rather than
   *  each entity repeating "Aktiv"/"Nach oben" under its own key. */
  /** The count row above a list (K3). Its chips only count — they are not
   *  filters, so a zero is left out rather than shown as an empty category. */
  counts: {
    notes: (n: number) => `${n} ${n === 1 ? 'Notiz' : 'Notizen'}`,
    notesLocked: 'Gesperrt',
    notesOpen: 'Offen',
    activities: (total: number, upcoming: number) =>
      `${total} ${total === 1 ? 'Vorgang' : 'Vorgänge'} · ${upcoming} kommend`,
    activitiesBilled: 'Abgerechnet',
    activitiesUnbilled: 'Nicht abgerechnet',
    activitiesNoAppointment: 'Ohne Termin',
    invoices: (n: number) => `${n} ${n === 1 ? 'Rechnung' : 'Rechnungen'}`,
    invoicesOpen: 'Offen',
    invoicesPaid: 'Bezahlt',
    invoicesOverdue: 'Überfällig',
  },
  catalogue: {
    active: 'Aktiv',
    inactive: 'Inaktiv',
    moveUp: 'Nach oben',
    moveDown: 'Nach unten',
    columns: 'Spalten',
    visibleColumns: 'Sichtbare Spalten',
  },
  status: {
    loading: 'Wird geladen …',
  },
  placeholder: {
    /** For an area that is deliberately empty, not a stub waiting to be
     *  filled — purely descriptive of now, no promise of what comes next
     *  (CLAUDE.md, "a form never claims a state that does not exist"). Used
     *  by Übersicht and Zahlungen today. */
    empty: 'Hier gibt es aktuell nichts zu sehen.',
  },
  error: {
    generic: 'Es ist ein unerwarteter Fehler aufgetreten.',
    /** Deliberately different wording from `generic`: the two were identical
     *  once, and an unreachable server read as a server error. */
    serverUnreachable:
      'Der Server ist nicht erreichbar. Bitte prüfen Sie, ob die Anwendung läuft, ' +
      'und versuchen Sie es erneut.',
    notFound: 'Diese Seite gibt es nicht.',
  },
} as const
