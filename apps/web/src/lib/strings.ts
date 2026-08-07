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
  },
  actions: {
    recheck: 'Erneut prüfen',
    retry: 'Erneut versuchen',
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
    notFound: 'Diese Seite gibt es nicht.',
  },
} as const
