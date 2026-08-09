/**
 * German user-facing strings for the frontend. Labels, buttons, validation
 * messages — everything the practitioner reads lives here, never inlined in a
 * component. This is not i18n; it keeps the English-code / German-UI split
 * enforceable.
 */
export const strings = {
  app: {
    title: 'Praxisverwaltung',
  },
  nav: {
    dashboard: 'Übersicht',
    contacts: 'Kontakte',
    appointments: 'Termine',
    activities: 'Vorgänge',
    invoices: 'Rechnungen',
    services: 'Leistungen',
    settings: 'Einstellungen',
    signOut: 'Abmelden',
  },
  login: {
    title: 'Anmelden',
    description: 'Bitte melden Sie sich mit Ihren Zugangsdaten an.',
    email: 'E-Mail-Adresse',
    password: 'Passwort',
    submit: 'Anmelden',
    submitting: 'Anmeldung läuft …',
    failed: 'E-Mail-Adresse oder Passwort ist falsch.',
  },
  settings: {
    title: 'Praxisstammdaten',
    description: 'Diese Angaben gelten für die gesamte Praxis.',
    sectionPractice: 'Praxis',
    sectionAddress: 'Anschrift',
    sectionContact: 'Kontakt',
    sectionBanking: 'Bankverbindung',
    sectionInvoicing: 'Rechnungsstellung',
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
    loadFailed: 'Die Praxisstammdaten konnten nicht geladen werden.',
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
    quantity: 'Bitte eine Menge ab 1 eingeben.',
  },
  contact: {
    title: 'Kontakte',
    description: 'Personen und Organisationen der Praxis.',
    create: 'Neuer Kontakt',
    createTitle: 'Kontakt anlegen',
    search: 'Suchen',
    searchPlaceholder: 'Name, Firma oder Kontaktnummer',
    /** Never in the URL — a search term here is usually a patient's name. */
    searchHint: 'Der Suchbegriff wird nicht in der Adresszeile gespeichert.',
    showArchived: 'Archivierte anzeigen',
    allRoles: 'Alle Rollen',
    empty: 'Keine Kontakte vorhanden.',
    emptyFiltered: 'Kein Kontakt passt zu dieser Suche.',
    countOf: (shown: number, total: number) => `${shown} von ${total} angezeigt`,
    archivedBadge: 'Archiviert',

    kindLabel: 'Art',
    kind: {
      person: 'Person',
      organization: 'Organisation',
    },
    kindImmutable: 'Die Art kann nachträglich nicht geändert werden.',

    roleLabel: 'Rollen',
    role: {
      patient: 'Patient',
      prospect: 'Interessent',
      participant: 'Teilnehmer',
      guardian: 'Sorgeberechtigt',
      billing_recipient: 'Rechnungsempfänger',
      other: 'Sonstige',
    },
    roleSince: 'seit',
    noRoles: 'Keine Rolle zugewiesen',

    columns: {
      number: 'Nr.',
      name: 'Name',
      roles: 'Rollen',
      city: 'Ort',
      email: 'E-Mail',
      phone: 'Telefon',
    },

    sectionName: 'Name',
    sectionAddress: 'Anschrift',
    sectionContact: 'Kontakt',
    sectionInternal: 'Intern',
    salutation: 'Anrede',
    salutationOptions: ['Herr', 'Frau'],
    academicTitle: 'Titel',
    firstName: 'Vorname',
    lastName: 'Nachname',
    dateOfBirth: 'Geburtsdatum',
    companyName: 'Firmenname',
    contactPerson: 'Ansprechpartner',
    vatId: 'USt-IdNr.',
    street: 'Straße und Hausnummer',
    postalCode: 'PLZ',
    city: 'Ort',
    country: 'Land (ISO-Code, z. B. DE)',
    email: 'E-Mail-Adresse',
    phone: 'Telefon',
    internalNote: 'Interne Notiz',
    internalNoteHint: 'Nur intern sichtbar, erscheint auf keinem Dokument.',
    contactNumber: 'Kontaktnummer',

    save: 'Speichern',
    saving: 'Wird gespeichert …',
    created: 'Kontakt angelegt.',
    saved: 'Kontakt gespeichert.',
    saveFailed: 'Der Kontakt konnte nicht gespeichert werden.',
    loadFailed: 'Der Kontakt konnte nicht geladen werden.',

    archive: 'Archivieren',
    unarchive: 'Wiederherstellen',
    archived: 'Kontakt archiviert.',
    unarchived: 'Kontakt wiederhergestellt.',
    archiveTitle: 'Kontakt archivieren?',
    archiveBody:
      'Der Kontakt verschwindet aus der Liste, bleibt aber erhalten und kann jederzeit ' +
      'wiederhergestellt werden. Gelöscht wird nichts.',
    cancel: 'Abbrechen',

    tabs: {
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
    showInactive: 'Inaktive anzeigen',

    create: 'Neue Leistung',
    createTitle: 'Leistung anlegen',
    editTitle: 'Leistung bearbeiten',
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
    inactiveBadge: 'Inaktiv',

    groupCreate: 'Neue Gruppe',
    groupCreateTitle: 'Leistungsgruppe anlegen',
    groupEditTitle: 'Leistungsgruppe bearbeiten',
    groupEmpty: 'Noch keine Leistungsgruppen.',
    groupName: 'Name',
    groupItems: 'Enthaltene Leistungen',
    groupItemsEmpty: 'Noch keine Leistung hinzugefügt.',
    groupAddItem: 'Leistung hinzufügen',
    groupChooseService: 'Leistung wählen',
    groupQuantity: 'Menge',
    groupSum: 'Summe',
    groupMoveUp: 'Nach oben',
    groupMoveDown: 'Nach unten',
    groupRemove: 'Entfernen',
    groupCount: (count: number) => (count === 1 ? '1 Leistung' : `${count} Leistungen`),
    /** A group may hold a service that was deactivated afterwards. */
    groupInactiveService: 'Diese Leistung ist inaktiv.',
    groupHint:
      'Eine Gruppe ist nur eine Auswahlhilfe. Beim Anlegen eines Vorgangs wird sie sofort in ' +
      'einzelne Positionen aufgelöst; gespeichert wird kein Verweis auf die Gruppe.',

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
    editTitle: 'Vorgang bearbeiten',
    empty: 'Noch keine Vorgänge.',

    type: 'Art',
    types: {
      session: 'Sitzung',
      talk: 'Vortrag',
      consultation: 'Beratung',
      other: 'Sonstiges',
    },
    contact: 'Kontakt',
    contactSearch: 'Name oder Kontaktnummer tippen',
    contactNoResults: 'Kein Kontakt gefunden. Archivierte Kontakte werden nicht vorgeschlagen.',
    contactLocked: 'fest',
    contactChange: 'Anderer Kontakt',
    contactRequired: 'Bitte zuerst einen Kontakt wählen.',
    occurredAt: 'Datum und Uhrzeit',
    durationMin: 'Dauer in Minuten',
    activityTitle: 'Bezeichnung',
    internalNote: 'Interne Notiz',
    internalNoteHint: 'Nur intern sichtbar, erscheint auf keinem Dokument.',

    items: 'Positionen',
    itemsEmpty: 'Noch keine Position.',
    addService: 'Leistung hinzufügen',
    addGroup: 'Leistungsgruppe einfügen',
    addFree: 'Freie Position',
    chooseService: 'Leistung wählen',
    chooseGroup: 'Gruppe wählen',
    /** Rule 5, said plainly where it matters most. */
    copyHint:
      'Beim Hinzufügen werden Bezeichnung, Ziffer, Preis und Dauer aus dem Katalog kopiert. ' +
      'Ab dann gehören sie zu diesem Vorgang und ändern sich nicht mehr mit.',
    groupHint: 'Eine Gruppe wird sofort in einzelne Positionen aufgelöst.',
    itemDescription: 'Bezeichnung',
    itemFeeCode: 'Ziffer',
    itemQuantity: 'Menge',
    itemPrice: 'Einzelpreis',
    itemDuration: 'Dauer',
    itemBillable: 'Abrechenbar',
    itemBillableHint:
      'Nicht abrechenbar heißt: die Position bleibt als Dokumentation stehen, ' +
      'kommt aber auf keine Rechnung.',
    itemRemove: 'Position entfernen',
    itemMoveUp: 'Nach oben',
    itemMoveDown: 'Nach unten',
    freeItemDefault: 'Freie Position',
    sumBillable: 'Abrechenbar',
    sumTotal: 'Gesamt',
    notBillableBadge: 'nicht abrechenbar',

    appointment: 'Termin',
    withAppointment: 'Termin im Kalender anlegen',
    withAppointmentHint:
      'Ohne Termin wird der Vorgang nur dokumentiert und erscheint nicht im Kalender.',
    appointmentFrom: 'Beginn',
    appointmentTo: 'Ende',
    appointmentRange: 'Zeitraum',
    appointmentRangeHint: 'Ergibt sich aus Beginn und Dauer.',
    durationRequired: 'Für einen Termin wird eine Dauer gebraucht.',
    appointmentStatus: 'Status',
    appointmentTitle: 'Titel im Kalender',
    appointmentNote: 'Notiz zum Termin',

    save: 'Speichern',
    saving: 'Wird gespeichert …',
    cancel: 'Abbrechen',
    created: 'Vorgang angelegt.',
    saved: 'Vorgang gespeichert.',
    saveFailed: 'Der Vorgang konnte nicht gespeichert werden.',
    remove: 'Vorgang löschen',
    removeTitle: 'Vorgang löschen?',
    removeBody:
      'Der Vorgang und seine Positionen werden gelöscht, der Termin im Kalender ebenfalls. ' +
      'Das lässt sich nicht rückgängig machen.',
    removed: 'Vorgang gelöscht.',
  },
  appointment: {
    title: 'Termine',
    description: 'Kalender der Praxis.',
    today: 'Heute',
    previous: 'Zurück',
    next: 'Weiter',
    week: 'Woche',
    day: 'Tag',
    empty: 'Keine Termine in diesem Zeitraum.',
    newHere: 'Termin anlegen',
    status: {
      planned: 'Geplant',
      confirmed: 'Bestätigt',
      attended: 'Wahrgenommen',
      cancelled: 'Abgesagt',
      cancelled_late: 'Kurzfristig abgesagt',
      no_show: 'Nicht erschienen',
    },
    /** The distinction the exclusion constraint makes. */
    releasesSlot: 'Der Zeitraum wird dadurch wieder frei.',
    holdsSlot: 'Der Zeitraum bleibt belegt.',
    moved: 'Termin verschoben.',
    moveFailed: 'Der Termin konnte nicht verschoben werden.',
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
    writtenBy: 'Verfasst von',

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
    addendum: 'Nachtrag',
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
    fileOpen: 'Öffnen',
    fileDownload: 'Herunterladen',
    fileHint:
      'PDF sowie JPEG, PNG, WebP, HEIC und TIFF, höchstens 25 MB. ' +
      'Anhänge sind Teil der Notiz und werden beim Sperren mit festgeschrieben.',
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
  actions: {
    recheck: 'Erneut prüfen',
    retry: 'Erneut versuchen',
    back: 'Zurück',
  },
  status: {
    loading: 'Wird geladen …',
    serverReachable: 'Server erreichbar',
    serverUnreachable: 'Server nicht erreichbar',
    serverTime: 'Serverzeit',
  },
  placeholder: {
    /** Shown on the navigation targets whose slice has not been built yet. */
    comingSoon: 'Dieser Bereich entsteht in einem späteren Schritt.',
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
