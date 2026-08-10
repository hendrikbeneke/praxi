import type { Invoice, RecipientSnapshot } from '@praxi/shared'
import { dueDate, formatEuro } from '@praxi/shared'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { ADDRESS_FIELD, CONTENT, INFO_BLOCK, MARKS, mmToPt } from './din5008.js'

/**
 * The variable content of an invoice. The practice identity — letterhead,
 * logo, name, tax number, return address — comes from the uploaded template
 * and never from here (CLAUDE.md rule 11); `overlay.ts` puts the two together.
 *
 * Standard Helvetica, so no font file is embedded and nothing is fetched. That
 * satisfies rule 12 by having nothing to bundle in the first place, and it
 * keeps the output byte-identical across machines.
 *
 * Amounts are formatted here and nowhere earlier: cents cross the API, euros
 * appear only when something is rendered for a human (rule 2). `formatEuro`
 * is the same function the screen uses, so the printed invoice cannot read
 * differently from the screen it was checked on.
 */

const mm = mmToPt

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#111111',
    paddingTop: mm(CONTENT.top),
    paddingLeft: mm(CONTENT.left),
    paddingRight: mm(CONTENT.right),
    paddingBottom: mm(CONTENT.bottom + 8),
  },
  addressField: {
    position: 'absolute',
    left: mm(ADDRESS_FIELD.left),
    top: mm(ADDRESS_FIELD.top),
    width: mm(ADDRESS_FIELD.width),
    height: mm(ADDRESS_FIELD.height),
  },
  addressLine: { fontSize: 10, lineHeight: 1.35 },
  infoBlock: {
    position: 'absolute',
    left: mm(INFO_BLOCK.left),
    top: mm(INFO_BLOCK.top),
    width: mm(INFO_BLOCK.width),
    fontSize: 9,
  },
  infoRow: { flexDirection: 'row', marginBottom: 2 },
  infoLabel: { width: '45%', color: '#555555' },
  infoValue: { width: '55%' },
  mark: {
    position: 'absolute',
    left: mm(MARKS.left),
    width: mm(MARKS.length),
    borderTopWidth: 0.5,
    borderTopColor: '#999999',
  },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 10 },
  paragraph: { lineHeight: 1.45, marginBottom: 10 },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: '#111111',
    paddingBottom: 3,
    marginBottom: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.25,
    borderBottomColor: '#cccccc',
  },
  colPos: { width: '6%' },
  colDate: { width: '15%' },
  colText: { width: '43%' },
  colFee: { width: '10%' },
  colQty: { width: '8%', textAlign: 'right' },
  colUnit: { width: '18%', textAlign: 'right' },
  colAmount: { width: '18%', textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 5,
    borderTopWidth: 0.75,
    borderTopColor: '#111111',
    fontFamily: 'Helvetica-Bold',
  },
  totalLabel: { width: '64%', textAlign: 'right', paddingRight: 8 },
  totalValue: { width: '36%', textAlign: 'right' },
  pageNumber: {
    position: 'absolute',
    bottom: mm(CONTENT.bottom - 6),
    right: mm(CONTENT.right),
    fontSize: 8,
    color: '#666666',
  },
})

/** `de-DE` short date. Kept local to the PDF because the invoice date is a
 *  plain date and must not travel through a timezone on its way to paper. */
function formatDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}.${month}.${year}`
}

function AddressBlock({ recipient }: { recipient: RecipientSnapshot }) {
  const lines = [
    recipient.name,
    recipient.contactPerson,
    recipient.street,
    [recipient.postalCode, recipient.city].filter(Boolean).join(' ') || null,
    recipient.country === 'DE' ? null : recipient.country,
  ].filter((line): line is string => Boolean(line?.trim()))

  return (
    <View style={styles.addressField}>
      {/* The return-address zone belongs to the template; leaving it empty
          here is what keeps the two from printing on top of each other. */}
      <View style={{ height: mm(ADDRESS_FIELD.returnAddressHeight) }} />
      {lines.map((line) => (
        <Text key={line} style={styles.addressLine}>
          {line}
        </Text>
      ))}
    </View>
  )
}

function InfoBlock({ invoice, labels }: { invoice: Invoice; labels: PdfLabels }) {
  const cancellation = invoice.type === 'cancellation_invoice'

  const rows: [string, string][] = [
    [
      cancellation ? labels.cancellationNumber : labels.invoiceNumber,
      invoice.number ?? labels.draft,
    ],
    [labels.invoiceDate, formatDate(invoice.invoiceDate)],
    // No payment date on a document that takes the demand back.
    ...(cancellation
      ? []
      : ([[labels.dueDate, formatDate(dueDate(invoice.invoiceDate, invoice.paymentTermDays))]] as [
          string,
          string,
        ][])),
    [labels.contactNumber, String(invoice.recipientSnapshot?.contactNumber ?? '')],
  ]

  return (
    <View style={styles.infoBlock}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.infoRow}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue}>{value}</Text>
        </View>
      ))}
    </View>
  )
}

/** German strings for the document. Passed in rather than imported so the
 *  language split stays visible: `messages.ts` owns them. */
export type PdfLabels = {
  title: string
  /** "Stornorechnung" — never "Gutschrift", which in German VAT law means
   *  self-billing by the recipient (CLAUDE.md rule 9). */
  cancellationTitle: string
  cancellationNumber: string
  cancels: (number: string) => string
  draft: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string
  contactNumber: string
  position: string
  dateOfService: string
  description: string
  feeCode: string
  quantity: string
  unitPrice: string
  amount: string
  total: string
  page: string
}

export function InvoiceDocument({
  invoice,
  labels,
  /** Pinned so the same invoice renders byte-identically every time. */
  timestamp,
}: {
  invoice: Invoice
  labels: PdfLabels
  timestamp: Date
}) {
  const recipient = invoice.recipientSnapshot
  const title = invoice.type === 'cancellation_invoice' ? labels.cancellationTitle : labels.title

  return (
    <Document
      title={`${title} ${invoice.number ?? ''}`.trim()}
      producer="praxi"
      creator="praxi"
      creationDate={timestamp}
      modificationDate={timestamp}
    >
      <Page size="A4" style={styles.page}>
        {/* Fold and punch marks, drawn on every page. */}
        <View style={[styles.mark, { top: mm(MARKS.firstFold) }]} fixed />
        <View style={[styles.mark, { top: mm(MARKS.secondFold) }]} fixed />
        <View style={[styles.mark, { top: mm(MARKS.punch), width: mm(MARKS.length + 2) }]} fixed />

        {recipient && <AddressBlock recipient={recipient} />}
        <InfoBlock invoice={invoice} labels={labels} />

        <Text style={styles.title}>
          {title} {invoice.number ?? ''}
        </Text>

        {/* A cancellation carries no intro or outro text — see the reasoning
            at `cancelInvoice`. What it does say is which invoice it takes
            back, and that is generated, not a text block. */}
        {invoice.cancelsInvoiceNumber && (
          <Text style={styles.paragraph}>{labels.cancels(invoice.cancelsInvoiceNumber)}</Text>
        )}

        {invoice.introText && <Text style={styles.paragraph}>{invoice.introText}</Text>}

        <View style={styles.tableHead} fixed>
          <Text style={styles.colPos}>{labels.position}</Text>
          <Text style={styles.colDate}>{labels.dateOfService}</Text>
          <Text style={styles.colText}>{labels.description}</Text>
          <Text style={styles.colFee}>{labels.feeCode}</Text>
          <Text style={styles.colQty}>{labels.quantity}</Text>
          <Text style={styles.colUnit}>{labels.unitPrice}</Text>
          <Text style={styles.colAmount}>{labels.amount}</Text>
        </View>

        {invoice.lines.map((line, index) => (
          <View key={line.id} style={styles.row} wrap={false}>
            <Text style={styles.colPos}>{index + 1}</Text>
            <Text style={styles.colDate}>
              {line.dateOfService ? formatDate(line.dateOfService) : ''}
            </Text>
            <Text style={styles.colText}>{line.description}</Text>
            <Text style={styles.colFee}>{line.feeCode ?? ''}</Text>
            <Text style={styles.colQty}>{line.quantity}</Text>
            <Text style={styles.colUnit}>{formatEuro(line.unitPriceCents)}</Text>
            <Text style={styles.colAmount}>{formatEuro(line.amountCents)}</Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{labels.total}</Text>
          <Text style={styles.totalValue}>{formatEuro(invoice.totalCents)}</Text>
        </View>

        {invoice.outroText && (
          <Text style={[styles.paragraph, { marginTop: 14 }]}>{invoice.outroText}</Text>
        )}

        <Text
          style={styles.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => `${labels.page} ${pageNumber}/${totalPages}`}
        />
      </Page>
    </Document>
  )
}
