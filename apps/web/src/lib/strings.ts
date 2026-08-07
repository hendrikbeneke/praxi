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
    contacts: 'Kontakte',
    appointments: 'Termine',
    activities: 'Vorgänge',
    invoices: 'Rechnungen',
    services: 'Leistungen',
    settings: 'Einstellungen',
  },
  actions: {
    recheck: 'Erneut prüfen',
  },
  status: {
    loading: 'Wird geladen …',
    serverReachable: 'Server erreichbar',
    serverUnreachable: 'Server nicht erreichbar',
    serverTime: 'Serverzeit',
  },
  error: {
    generic: 'Es ist ein unerwarteter Fehler aufgetreten.',
    notFound: 'Diese Seite gibt es nicht.',
  },
} as const
