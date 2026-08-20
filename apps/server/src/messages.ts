/**
 * German user-facing strings for the API. Everything the client may display
 * lives here — never inlined in a route or a domain function. This is not
 * i18n; it keeps the English-code / German-UI split enforceable.
 */
export const messages = {
  error: {
    badRequest: 'Die Anfrage ist fehlerhaft.',
    validation: 'Die übermittelten Daten sind ungültig.',
    unauthorized: 'Nicht angemeldet.',
    forbidden: 'Keine Berechtigung für diese Aktion.',
    notFound: 'Nicht gefunden.',
    conflict: 'Der Vorgang steht im Konflikt mit dem aktuellen Datenstand.',
    internal: 'Es ist ein unerwarteter Fehler aufgetreten.',
  },
  auth: {
    // One message for unknown email, wrong password and deactivated account —
    // the response must not reveal which of the three it was.
    invalidCredentials: 'E-Mail-Adresse oder Passwort ist falsch.',
    notSignedIn: 'Nicht angemeldet.',
    sessionExpired: 'Die Sitzung ist abgelaufen. Bitte erneut anmelden.',
  },
  settings: {
    missing: 'Es sind keine Praxisstammdaten hinterlegt.',
  },
  openingHours: {
    /** The database refuses this too (`opening_hour_no_overlap`); the domain
     *  refuses first so the answer names the day instead of a constraint. */
    overlap: (weekday: number) =>
      `Am ${
        ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][
          weekday
        ] ?? 'gewählten Tag'
      } überschneiden sich zwei Zeitfenster.`,
  },
  contact: {
    notFound: 'Dieser Kontakt existiert nicht.',
    kindImmutable:
      'Die Art des Kontakts — Person oder Organisation — kann nachträglich nicht geändert werden. ' +
      'Legen Sie stattdessen einen neuen Kontakt an.',
    unknownRole: 'Diese Rolle gibt es nicht. Bitte prüfen Sie die Rollen in den Einstellungen.',
    unknownRelationType:
      'Diese Art von Beziehung gibt es nicht oder sie ist nicht aktiv. ' +
      'Bitte prüfen Sie die Beziehungsarten in den Einstellungen.',
    selfRelation: 'Ein Kontakt kann keine Beziehung zu sich selbst haben.',
    relationExists: 'Diese Beziehung zwischen den beiden Kontakten besteht bereits.',
    relationExclusive:
      'Für diesen Kontakt ist bereits eine Beziehung dieser Art hinterlegt. ' +
      'Bitte entfernen Sie zuerst die bestehende.',
    relationContactMissing: 'Der gewählte Kontakt existiert nicht.',
    relationNotFound: 'Diese Beziehung existiert nicht.',
  },
  valueList: {
    notFound: 'Dieser Eintrag existiert nicht.',
    labelTaken: 'Ein Eintrag mit dieser Bezeichnung gibt es bereits.',
    countryTaken: 'Dieses Land steht bereits in der Liste.',
    /**
     * Says how many, because "clear it there first" without a number sends the
     * practitioner through the whole card index.
     *
     * The demonstrative travels with the noun rather than being glued on in
     * the sentence: "die Anrede" is feminine, "das Geschlecht" and "das Land"
     * are neuter, and a template with one fixed article gets two of the three
     * wrong.
     */
    inUse: (list: 'salutation' | 'gender' | 'country', count: number) => {
      const subject = {
        salutation: 'Diese Anrede',
        gender: 'Dieses Geschlecht',
        country: 'Dieses Land',
      }[list]
      const held = count === 1 ? 'einem Kontakt' : `${count} Kontakten`
      return `${subject} ist ${held} zugeordnet und lässt sich nicht löschen. Entfernen Sie die Zuordnung dort zuerst.`
    },
    /** The foreign key rather than the domain check — it cannot count. Only
     *  reachable if something deletes past `deleteEntry`. */
    inUseUnknown:
      'Dieser Eintrag ist noch Kontakten zugeordnet und lässt sich nicht löschen. ' +
      'Entfernen Sie die Zuordnung dort zuerst.',
  },
  contactType: {
    notFound: 'Dieser Eintrag existiert nicht.',
    codeTaken: 'Dieses Kürzel ist bereits vergeben.',
    labelTaken: 'Eine Rolle mit dieser Bezeichnung gibt es bereits.',
    // Relations only, since migration 0035: a system entry is one the software
    // itself depends on, and `billing_recipient` and `guardian` are the two
    // that do. Roles carry no logic anymore.
    systemNotDeletable:
      'Dieser Eintrag gehört fest zum System und kann nicht gelöscht werden. ' +
      'Sie können ihn umbenennen oder auf inaktiv setzen.',
    // Says how many, because "delete them there first" without a number sends
    // the practitioner looking through the whole card index.
    roleInUse: (count: number) =>
      count === 1
        ? 'Diese Rolle ist einem Kontakt zugeordnet und kann nicht gelöscht werden. ' +
          'Nehmen Sie sie dort zuerst ab.'
        : `Diese Rolle ist ${count} Kontakten zugeordnet und kann nicht gelöscht werden. ` +
          'Nehmen Sie sie dort zuerst ab.',
    /** The foreign key rather than the domain check — it cannot count, so it
     *  cannot say how many. Only reachable if something deletes past
     *  `deleteRoleType`. */
    roleInUseUnknown:
      'Diese Rolle ist noch Kontakten zugeordnet und kann nicht gelöscht werden. ' +
      'Nehmen Sie sie dort zuerst ab.',
    relationInUse:
      'Diese Beziehungsart wird noch verwendet und kann nicht gelöscht werden. ' +
      'Setzen Sie sie auf inaktiv, wenn sie nicht mehr vergeben werden soll.',
    exclusiveConflict:
      'Diese Beziehungsart lässt sich nicht auf „nur einmal pro Kontakt" umstellen: ' +
      'es gibt bereits Kontakte mit mehreren Beziehungen dieser Art.',
  },
  service: {
    notFound: 'Diese Leistung existiert nicht.',
    shortCodeTaken: 'Dieses Kürzel ist bereits vergeben.',
    /**
     * "Wird noch verwendet" without saying where is a message the
     * practitioner cannot act on (D5) — this names every table that still
     * references the service, not just that one does.
     */
    inUse: (usage: { activity: boolean; group: boolean; preset: boolean }) => {
      const reasons = [
        usage.activity && 'in Vorgängen',
        usage.group && 'in einer Leistungsgruppe',
        usage.preset && 'als Vorbelegung einer Vorgangsart',
      ].filter((reason): reason is string => reason !== false)

      const where =
        reasons.length <= 1
          ? (reasons[0] ?? '')
          : `${reasons.slice(0, -1).join(', ')} und ${reasons.at(-1)}`

      return (
        `Diese Leistung wird noch verwendet (${where}) und kann nicht gelöscht werden. ` +
        'Setzen Sie sie auf inaktiv, wenn sie nicht mehr zur Auswahl stehen soll.'
      )
    },
    groupNotFound: 'Diese Leistungsgruppe existiert nicht.',
    groupNameTaken: 'Eine Leistungsgruppe mit diesem Namen existiert bereits.',
    groupInUse:
      'Diese Leistungsgruppe wird noch verwendet und kann nicht gelöscht werden. ' +
      'Setzen Sie sie auf inaktiv, wenn sie nicht mehr zur Auswahl stehen soll.',
    unknownService: 'Die Gruppe verweist auf eine Leistung, die es nicht gibt.',
  },
  activityType: {
    notFound: 'Diese Vorgangsart existiert nicht.',
    codeTaken: 'Dieses Kürzel ist bereits vergeben.',
    inUse:
      'Diese Vorgangsart wird noch von Vorgängen verwendet und kann nicht gelöscht werden. ' +
      'Setzen Sie sie auf inaktiv, wenn sie nicht mehr zur Auswahl stehen soll.',
    presetMissing: 'Die hinterlegte Vorbelegung verweist auf eine Leistung, die es nicht gibt.',
  },
  activity: {
    notFound: 'Dieser Vorgang existiert nicht.',
    unknownType:
      'Diese Vorgangsart gibt es nicht. Bitte prüfen Sie die Vorgangsarten in den Einstellungen.',
    unknownService: 'Eine der Positionen verweist auf eine Leistung, die es nicht gibt.',
    unknownServiceGroup:
      'Diese Leistungsgruppe existiert nicht oder enthält keine Leistungen. ' +
      'Bitte prüfen Sie den Katalog.',
  },
  note: {
    notFound: 'Diese Notiz existiert nicht.',
    locked:
      'Diese Notiz ist gesperrt und kann nicht mehr geändert werden. ' +
      'Ergänzen Sie sie stattdessen durch einen Nachtrag.',
    alreadyLocked: 'Diese Notiz ist bereits gesperrt.',
    addendumTargetMissing: 'Die Notiz, die ergänzt werden soll, existiert nicht.',
    addendumTargetUnlocked:
      'Ein Nachtrag ist nur zu einer gesperrten Notiz möglich. ' +
      'Eine offene Notiz können Sie direkt bearbeiten.',
    chainForked:
      'Diese Notiz konnte nicht gesperrt werden, weil zeitgleich eine andere gesperrt wurde. ' +
      'Bitte versuchen Sie es erneut.',
    fileMissing: 'Es wurde keine Datei übermittelt.',
    fileTooLarge: 'Die Datei ist zu groß. Erlaubt sind höchstens 25 MB.',
    fileTypeNotAccepted:
      'Dieser Dateityp wird nicht angenommen. Möglich sind PDF sowie die Bildformate ' +
      'JPEG, PNG, WebP, HEIC und TIFF.',
    fileNotFound: 'Diese Datei existiert nicht.',
    fileGone:
      'Die Datei ist nicht mehr auf der Festplatte. Bitte prüfen Sie die Dokumentation ' +
      'dieses Kontakts.',
    activityHasNotes:
      'Zu diesem Vorgang gibt es Notizen. Bitte lösen Sie die Notizen zuerst vom Vorgang ' +
      'oder löschen Sie sie, bevor Sie den Vorgang löschen.',
  },
  appointment: {
    notFound: 'Dieser Termin existiert nicht.',
    unknownContact: 'Dieser Kontakt existiert nicht.',
    hasActivity:
      'Zu diesem Termin gehört ein Vorgang. Sagen Sie den Termin ab, statt ihn zu löschen — ' +
      'der Vorgang bleibt dann dokumentiert.',
    /** What Google sees of an appointment that belongs to nobody. Rule 13
     *  allows the contact number and nothing else, and there is none here — so
     *  a constant, never the appointment's own title, which the practitioner
     *  types and could well contain a name. */
    googleBusy: 'Belegt',
  },
  invoice: {
    notFound: 'Diese Rechnung existiert nicht.',
    notADraft: 'Diese Rechnung ist bereits festgeschrieben und kann nicht mehr geändert werden.',
    empty: 'Eine Rechnung braucht mindestens eine Position.',
    numberTaken:
      'Diese Rechnungsnummer ist bereits vergeben. Bitte korrigieren Sie den Nummernkreis ' +
      'in den Einstellungen.',
    itemAlreadyBilled: 'Mindestens eine der gewählten Positionen steht bereits auf einer Rechnung.',
    /** Names what is in the way — a bare "not possible" leaves the
     *  practitioner hunting for the invoice. */
    billedItemBlocksDelete: (item: string, invoiceNumber: string | null) =>
      `Die Position „${item}" steht auf ` +
      (invoiceNumber ? `Rechnung ${invoiceNumber}` : 'einem Rechnungsentwurf') +
      ' und kann nicht entfernt werden. Stornieren Sie die Rechnung ' +
      'beziehungsweise verwerfen Sie den Entwurf, wenn die Position wieder frei werden soll.',
    templateMissing: 'Es ist keine Rechnungsvorlage hinterlegt.',
    templateNotAPdf: 'Die Vorlage muss eine PDF-Datei sein.',
    templateEmpty: 'Die Vorlage enthält keine Seite.',
    templateTooManyPages:
      'Die Vorlage darf höchstens zwei Seiten haben: Seite 1 trägt die erste Seite, ' +
      'Seite 2 alle weiteren.',
    notFinalized:
      'Nur eine festgeschriebene Rechnung kann storniert werden. ' +
      'Einen Entwurf verwerfen Sie stattdessen.',
    alreadyCancelled: 'Diese Rechnung wurde bereits storniert.',
    cancellationNotCancellable:
      'Eine Stornorechnung kann nicht storniert werden. ' +
      'Stellen Sie stattdessen eine neue Rechnung aus.',
    pdfMissing:
      'Das Dokument zu dieser Rechnung liegt nicht mehr auf der Festplatte. ' +
      'Eine festgeschriebene Rechnung wird nicht neu erzeugt — stornieren Sie sie und ' +
      'stellen Sie eine neue aus.',
  },
  payment: {
    notFound: 'Diese Zahlung existiert nicht.',
    draftNotPayable:
      'Ein Rechnungsentwurf kann nicht bezahlt werden. ' +
      'Schreiben Sie die Rechnung zuerst fest.',
  },
  /** The German text on the invoice PDF itself. */
  pdf: {
    title: 'Rechnung',
    /** Rule 9: "Stornorechnung", never "Gutschrift". In German VAT law that
     *  word means self-billing by the recipient (§ 14 Abs. 2 UStG), and using
     *  it wrongly can create a tax liability under § 14c UStG. */
    cancellationTitle: 'Stornorechnung',
    cancellationNumber: 'Stornonummer',
    cancels: (number: string) => `Storno zur Rechnung ${number}.`,
    draft: 'Entwurf',
    invoiceNumber: 'Rechnungsnummer',
    invoiceDate: 'Rechnungsdatum',
    dueDate: 'Zahlbar bis',
    contactNumber: 'Kundennummer',
    /** Prefixes the diagnosis line above the items, where one is recorded. */
    diagnosis: 'Diagnose:',
    position: 'Pos.',
    dateOfService: 'Datum',
    description: 'Leistung',
    feeCode: 'Ziffer',
    quantity: 'Menge',
    unitPrice: 'Einzelpreis',
    amount: 'Betrag',
    total: 'Gesamtbetrag',
    page: 'Seite',
  },
  textTemplate: {
    notFound: 'Dieser Textbaustein existiert nicht.',
    nameTaken: 'Ein Textbaustein dieser Art mit diesem Namen existiert bereits.',
    defaultTaken: 'Es gibt bereits einen Standardbaustein dieser Art.',
    paidVariantTaken: 'Es gibt bereits einen Baustein für die bezahlte Variante.',
  },
  smtp: {
    notConfigured:
      'Es ist kein Mailkonto hinterlegt. Bitte richten Sie es in den Einstellungen ein.',
    keyMismatch:
      'Der hinterlegte Schlüssel passt nicht zum gespeicherten Passwort. ' +
      'Setzen Sie den ursprünglichen ENCRYPTION_KEY zurück oder tragen Sie das Passwort neu ein.',
    encryptionKeyMissing:
      'Ohne ENCRYPTION_KEY in der Umgebung kann kein Passwort gespeichert werden. ' +
      'Siehe .env.example.',
  },
  emailTemplate: {
    notFound: 'Diese Vorlage existiert nicht.',
    nameTaken: 'Eine Vorlage mit diesem Namen existiert bereits.',
  },
  invoiceSend: {
    draftNotSendable:
      'Ein Rechnungsentwurf kann nicht versendet werden. ' +
      'Schreiben Sie die Rechnung zuerst fest.',
    smtpMissing: 'Es ist kein Mailkonto hinterlegt. Bitte richten Sie es in den Einstellungen ein.',
    // The gaps a prefill can leave — no address on the contact, no mail
    // template — are said by the screen and not from here: they stop applying
    // the moment the field is filled in by hand, and only the screen knows
    // that. See `invoiceSendDraftSchema`.
    /** The test send. It goes to the configured sender and nowhere else. */
    testSubject: 'Testmail aus der Praxisverwaltung',
    testBody:
      'Diese Nachricht bestätigt, dass der Mailversand aus der Praxisverwaltung ' +
      'funktioniert.\n\nEs ist kein weiteres Zutun nötig.',
  },
  google: {
    notConfigured:
      'Die Google-Anbindung ist nicht eingerichtet. ' +
      'Es fehlen GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET oder ENCRYPTION_KEY in der Umgebung.',
    notConnected: 'Es besteht keine Verbindung zu Google.',
    // The key changed under a stored token. Nothing is deleted automatically:
    // a key set wrongly by accident must not throw a connection away.
    keyMismatch:
      'Der hinterlegte Schlüssel passt nicht zum gespeicherten Token. ' +
      'Setzen Sie den ursprünglichen ENCRYPTION_KEY zurück oder verbinden Sie neu.',
    authExpired: 'Die Verbindung zu Google ist abgelaufen. Bitte neu verbinden.',
    stateInvalid:
      'Die Anmeldung bei Google ist abgelaufen oder wurde nicht von hier gestartet. ' +
      'Bitte erneut versuchen.',
    conflictNotFound: 'Für diesen Termin gibt es keinen offenen Konflikt.',
    /**
     * What the settings say after a failed pass. The kind of fault, never the
     * error's own text: a driver error's message is the failed query with its
     * parameters, and this string is stored and printed (rule 12). The next
     * tick tries again, which is why a sentence is enough.
     */
    syncFailed: (kind: string) =>
      `Die Synchronisierung ist fehlgeschlagen (${kind}). Der nächste Versuch läuft automatisch.`,
    /** The page the loopback redirect lands on. `127.0.0.1` is a different
     *  origin than `localhost`, so this cannot be the SPA — it is a plain page
     *  that says the flow is done. */
    callbackTitle: 'Google-Kalender verbunden',
    callbackBody: 'Die Verbindung steht. Sie können dieses Fenster schließen.',
    callbackFailed: 'Die Verbindung konnte nicht hergestellt werden.',
  },
  numberRange: {
    missing:
      'Für diesen Nummernkreis ist kein Startwert hinterlegt. ' +
      'Bitte richten Sie ihn in den Einstellungen ein.',
  },
} as const
