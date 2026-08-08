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
  numberRange: {
    missing:
      'Für diesen Nummernkreis ist kein Startwert hinterlegt. ' +
      'Bitte richten Sie ihn in den Einstellungen ein.',
  },
} as const
