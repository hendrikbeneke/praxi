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
  contact: {
    notFound: 'Dieser Kontakt existiert nicht.',
    kindImmutable:
      'Die Art des Kontakts — Person oder Organisation — kann nachträglich nicht geändert werden. ' +
      'Legen Sie stattdessen einen neuen Kontakt an.',
  },
  service: {
    notFound: 'Diese Leistung existiert nicht.',
    shortCodeTaken: 'Dieses Kürzel ist bereits vergeben.',
    groupNotFound: 'Diese Leistungsgruppe existiert nicht.',
    groupNameTaken: 'Eine Leistungsgruppe mit diesem Namen existiert bereits.',
    unknownService: 'Die Gruppe verweist auf eine Leistung, die es nicht gibt.',
  },
  activity: {
    notFound: 'Dieser Vorgang existiert nicht.',
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
    addendumTypeFixed:
      'Ob eine Notiz ein Nachtrag ist, steht mit dem Anlegen fest und lässt sich nicht ändern.',
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
    overlap:
      'In diesem Zeitraum liegt bereits ein Termin. Bitte wählen Sie eine andere Zeit — ' +
      'oder sagen Sie den bestehenden Termin ab, dann wird der Platz frei.',
  },
  numberRange: {
    missing:
      'Für diesen Nummernkreis ist kein Startwert hinterlegt. ' +
      'Bitte richten Sie ihn in den Einstellungen ein.',
  },
} as const
