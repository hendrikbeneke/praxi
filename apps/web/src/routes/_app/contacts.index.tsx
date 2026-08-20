import {
  type ContactListItem,
  type ContactSortField,
  contactListOrderSchema,
  contactSortFieldSchema,
  formatBerlinDate,
  formatBerlinDayTime,
  formatContactNameSorted,
  formatRelativeDayBerlin,
  sortDirectionSchema,
} from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { z } from 'zod'
import { listTabClass } from '@/components/chip'
import { type ColumnDefinition, ColumnPicker } from '@/components/column-picker'
import { PageHeader } from '@/components/page-header'
import { SortableColumnHeader } from '@/components/sortable-column-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { roleTypeListQueryOptions } from '@/lib/contact-types'
import { contactListQueryOptions } from '@/lib/contacts'
import { strings } from '@/lib/strings'
import {
  updateUserPreferences,
  userPreferencesQueryKey,
  userPreferencesQueryOptions,
} from '@/lib/user-preferences'
import { cn } from '@/lib/utils'

/** `role` absent means the default tab — the first role flagged as one. `all`
 *  is the explicit choice, and the two have to stay distinguishable. */
const ALL_ROLES = 'all'
const PAGE_SIZE = 50

/**
 * Every column the picker offers, in the order a fresh preference falls back
 * to. Deliberately not the appointment column — see the comment on
 * `contactColumns` for why that one stays out of the picker entirely.
 */
const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: 'number', label: strings.contact.columns.number },
  { key: 'name', label: strings.contact.columns.name, locked: true },
  { key: 'roles', label: strings.contact.columns.roles },
  { key: 'city', label: strings.contact.columns.city },
  { key: 'dateOfBirth', label: strings.contact.columns.dateOfBirth },
]
const DEFAULT_COLUMNS = COLUMN_DEFINITIONS.map((entry) => entry.key)

/** The one column the design gives a fixed width, so the digits stay a block
 *  of their own however many of them there are. Applied to `th` and `td` alike
 *  — a width on only one of the two is not a column width. */
const COLUMN_CLASS: Record<string, string> = { contactNumber: 'w-20' }

/**
 * Role, order and archived live in the URL; the search term deliberately does
 * not. In this application a search term is almost always a patient's name, and
 * the URL ends up in browser history and autocomplete (CLAUDE.md rule 12).
 */
const searchSchema = z.object({
  // A role type's id, not an enum: the set is maintained in the settings, and
  // a role has no code to name it by since migration 0035. Not personal data,
  // so it may live in the URL — a uuid there is ugly and nothing more, and a
  // second anchor kept only for the address bar would be the code again.
  role: z.string().optional(),
  /**
   * The screen starts on `current` — opening the contact list is how the day's
   * documentation begins, and the question then is who was just here. The API
   * defaults to `alpha` instead, so the request always names the order rather
   * than relying on the other end's idea of a default.
   */
  order: contactListOrderSchema.default('current'),
  sort: contactSortFieldSchema.default('name'),
  dir: sortDirectionSchema.default('asc'),
  archived: z.boolean().optional(),
})

export const Route = createFileRoute('/_app/contacts/')({
  validateSearch: searchSchema,
  component: ContactListPage,
})

/**
 * No optional features: sorting, filtering and paging all happen in the
 * database, so the table only maps rows onto cells. The feature set has to be
 * declared once and threaded through the column helper as well — in v9 the
 * column types are parameterized by it.
 */
const features = tableFeatures({})

const column = createColumnHelper<typeof features, ContactListItem>()

type ColumnOptions = {
  roleLabels: Map<string, string>
  /** Which columns to show and in what order — the picker's answer. */
  visibleColumns: string[]
  /** Only the `current` order has an appointment to show, and only there does
   *  the column explain anything. */
  showAppointment: boolean
  sortHeader: (field: ContactSortField, label: string, align?: 'end') => React.ReactNode
  now: Date
}

/**
 * Built inside the component rather than at module level: the role labels come
 * from `contact_role_type`, which the practitioner maintains, and the columns
 * depend on the chosen order and on the stored column preference.
 *
 * `columns()` keeps each column's own value type; a plain array would widen
 * them to a single one and stop type-checking the cells.
 */
function contactColumns(options: ColumnOptions) {
  const definitions = [
    {
      key: 'number',
      def: column.accessor('contactNumber', {
        header: () => options.sortHeader('number', strings.contact.columns.number, 'end'),
        cell: (info) => (
          <span className="block text-right text-muted-foreground tabular-nums">
            {info.getValue()}
          </span>
        ),
      }),
    },
    {
      key: 'name',
      def: column.display({
        id: 'name',
        header: () => options.sortHeader('name', strings.contact.columns.name),
        cell: (info) => {
          const contact = info.row.original
          return (
            <span className="flex items-center gap-2">
              <span className="font-semibold">{formatContactNameSorted(contact)}</span>
              {contact.archivedAt && (
                <Badge variant="secondary">{strings.contact.archivedBadge}</Badge>
              )}
            </span>
          )
        },
      }),
    },
    {
      key: 'roles',
      def: column.display({
        id: 'roles',
        header: strings.contact.columns.roles,
        cell: (info) => {
          const { roles } = info.row.original
          if (roles.length === 0) {
            return <span className="text-muted-foreground text-xs">—</span>
          }
          return (
            <span className="flex flex-wrap gap-1">
              {roles.map((entry) => (
                <Badge key={entry.roleTypeId} variant="outline">
                  {options.roleLabels.get(entry.roleTypeId) ?? ''}
                </Badge>
              ))}
            </span>
          )
        },
      }),
    },
    {
      key: 'city',
      def: column.accessor('city', {
        header: strings.contact.columns.city,
        cell: (info) => info.getValue() ?? '—',
      }),
    },
    {
      key: 'dateOfBirth',
      def: column.accessor('dateOfBirth', {
        header: strings.contact.columns.dateOfBirth,
        cell: (info) => {
          const date = info.getValue()
          // A plain date rendered through the Berlin formatter needs an instant;
          // midday can never fall on the wrong side of a timezone boundary.
          return date ? (
            <span className="tabular-nums">{formatBerlinDate(`${date}T12:00:00Z`)}</span>
          ) : (
            '—'
          )
        },
      }),
    },
  ]

  const byKey = new Map(definitions.map((entry) => [entry.key, entry.def]))
  const ordered = options.visibleColumns
    .map((key) => byKey.get(key))
    .filter((def): def is (typeof definitions)[number]['def'] => def !== undefined)

  return column.columns([
    ...ordered,
    /**
     * Deliberately not one of `definitions` above, and so never offered by
     * `ColumnPicker`: this column's visibility already follows the
     * Aktuell/A–Z view (`showAppointment`), not a stored preference. Letting
     * both the picker and the view decide the same column would leave it
     * unclear which of the two is actually in charge (D6).
     */
    ...(options.showAppointment
      ? [
          column.accessor('appointmentAt', {
            header: strings.contact.columns.appointment,
            cell: (info) => {
              const at = info.getValue()
              if (!at) return '—'
              /* One line, and the two halves say different things: the day and
                 the time, then how far off that is. Until K6 this was
                 `formatBerlinDateTime` over `formatRelativeBerlin`, and beyond
                 a day the second one falls back to a date itself — so the cell
                 printed the same instant twice, absolutely. */
              return (
                <span className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="tabular-nums">{formatBerlinDayTime(at)}</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {formatRelativeDayBerlin(at, options.now)}
                  </span>
                </span>
              )
            },
          }),
        ]
      : []),
  ])
}

function ContactListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const queryClient = useQueryClient()

  const [term, setTerm] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)
  // Keeps typing responsive without a timer: the list re-queries with the
  // settled value while the input stays immediate.
  const deferredTerm = useDeferredValue(term)
  const searching = deferredTerm.trim() !== ''

  const roleTypes = useQuery(roleTypeListQueryOptions)
  const types = roleTypes.data ?? []
  const tabTypes = types.filter((type) => type.showAsTab)
  const otherTypes = types.filter((type) => !type.showAsTab)

  const preferences = useQuery(userPreferencesQueryOptions)
  const visibleColumns = preferences.data?.contactListColumns ?? DEFAULT_COLUMNS
  const saveColumns = useMutation({
    mutationFn: (next: string[]) => updateUserPreferences({ contactListColumns: next }),
    onMutate: (next) => {
      queryClient.setQueryData(userPreferencesQueryKey, (current) => ({
        ...(current ?? {}),
        contactListColumns: next,
      }))
    },
    onSuccess: (saved) => queryClient.setQueryData(userPreferencesQueryKey, saved),
  })

  /** No role in the URL means the first tab — "Patient" after the seed. With
   *  no flagged role at all there is nothing to default to, so it is Alle, and
   *  the tab row is then that one button. */
  const activeRole = search.role ?? tabTypes[0]?.id ?? ALL_ROLES
  const otherRole = otherTypes.find((type) => type.id === activeRole)

  /**
   * The search beats both filters: while something is typed, the whole card
   * index is searched, regardless of role and of the time window. This is a
   * rule of this screen, not of the API — hence here and not in the domain.
   */
  const contacts = useQuery(
    contactListQueryOptions({
      q: deferredTerm.trim() || undefined,
      roleTypeId: searching || activeRole === ALL_ROLES ? undefined : activeRole,
      order: searching ? 'alpha' : search.order,
      sort: search.sort,
      dir: search.dir,
      includeArchived: search.archived ?? false,
      limit: PAGE_SIZE,
      // The role types decide what the default tab is, so asking before they
      // arrive would query the wrong list and then correct itself on screen.
      enabled: !roleTypes.isPending,
    }),
  )

  const rows = contacts.data?.items ?? []
  const total = contacts.data?.total ?? 0

  /** One instant per render, so two rows of the same table cannot disagree
   *  about what "now" is. */
  const now = new Date()

  const setSearch = (next: Partial<z.infer<typeof searchSchema>>) =>
    void navigate({ search: (previous) => ({ ...previous, ...next }) })

  /** Clicking a heading sorts — and pulls the view over to A–Z, because in the
   *  `current` order the sort would have nowhere to take effect. */
  const sortHeader = (field: ContactSortField, label: string, align?: 'end') => {
    const activeHere = search.order === 'alpha' && search.sort === field && !searching
    return (
      <SortableColumnHeader
        label={label}
        align={align}
        active={activeHere}
        direction={search.dir}
        onClick={() =>
          setSearch({
            order: 'alpha',
            sort: field,
            dir: activeHere && search.dir === 'asc' ? 'desc' : 'asc',
          })
        }
      />
    )
  }

  const showAppointment = search.order === 'current' && !searching

  // Rebuilt on every render rather than memoized: the labels, the visible
  // columns and the sort arrows all depend on state that changes here, and the
  // table holds no state of its own that recreating them could disturb.
  const columns = contactColumns({
    roleLabels: new Map(types.map((type) => [type.id, type.label])),
    visibleColumns,
    showAppointment,
    sortHeader,
    now,
  })

  const table = useTable({ features, columns, data: rows })

  return (
    <>
      <PageHeader
        title={strings.contact.title}
        description={strings.contact.description}
        actions={
          <Button asChild>
            <Link to="/contacts/new">
              <Plus className="size-4" aria-hidden />
              {strings.contact.create}
            </Link>
          </Button>
        }
      />

      {/* One card, one row — search, the role tabs, and on the right what is
          shown *how*: archived, the order, the columns. The design's own split
          (K6): picking who is listed happens on the left, everything about the
          presentation on the right. */}
      <div className="mb-[18px] flex flex-wrap items-center gap-3 rounded-[10px] border bg-card px-[14px] py-3">
        <div className="relative min-w-[250px] max-w-[380px] flex-[1_1_300px]">
          <Search
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-[11px] size-[15px] text-muted-foreground"
            aria-hidden
          />
          <Input
            id="contact-search"
            aria-label={strings.contact.search}
            className="pl-9"
            placeholder={strings.contact.searchPlaceholder}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>

        <span className="h-[26px] w-px shrink-0 bg-border" />

        {/* The tabs are the roles flagged `show_as_tab`; everything else stays
            reachable behind "Weitere", so no role is unfilterable and the bar
            stays short. Relations never appear here — they are not a property
            of a single contact. */}
        <div className="flex flex-wrap items-center gap-1">
          {tabTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              className={listTabClass(activeRole === type.id)}
              onClick={() => setSearch({ role: type.id })}
            >
              {type.label}
            </button>
          ))}
          <button
            type="button"
            className={listTabClass(activeRole === ALL_ROLES)}
            onClick={() => setSearch({ role: ALL_ROLES })}
          >
            {strings.contact.allRolesTab}
          </button>

          {otherTypes.length > 0 && (
            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger asChild>
                {/* Named after what is chosen once something is, so the bar
                    says which filter is on without a second line. */}
                <button
                  type="button"
                  aria-label={strings.contact.moreRolesMenu}
                  className={listTabClass(otherRole !== undefined)}
                >
                  {otherRole?.label ?? strings.contact.moreRoles}
                  <ChevronDown className="size-[13px]" aria-hidden />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[246px] p-1.5">
                <div className="flex flex-col gap-px">
                  {otherTypes.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      className={cn(
                        'rounded-md px-[9px] py-[7px] text-left text-[13.5px] transition-colors',
                        activeRole === type.id
                          ? 'bg-primary font-semibold text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      )}
                      onClick={() => {
                        setMoreOpen(false)
                        setSearch({ role: type.id })
                      }}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Label
            htmlFor="show-archived"
            className="cursor-pointer gap-2 whitespace-nowrap font-normal text-[13.5px] text-muted-foreground"
          >
            <Checkbox
              id="show-archived"
              checked={search.archived ?? false}
              onCheckedChange={(checked) =>
                setSearch({ archived: checked === true ? true : undefined })
              }
            />
            {strings.contact.showArchived}
          </Label>

          <span className="h-[26px] w-px shrink-0 bg-border" />

          <div className="flex items-center gap-1">
            <button
              type="button"
              className={listTabClass(search.order === 'current')}
              onClick={() => setSearch({ order: 'current' })}
            >
              {strings.contact.orderCurrent}
            </button>
            <button
              type="button"
              className={listTabClass(search.order === 'alpha')}
              onClick={() => setSearch({ order: 'alpha' })}
            >
              {strings.contact.orderAlpha}
            </button>
          </div>

          <ColumnPicker
            columns={COLUMN_DEFINITIONS}
            visible={visibleColumns}
            onChange={(next) => saveColumns.mutate(next)}
          />
        </div>
      </div>

      {searching && (
        <p className="mb-3 text-muted-foreground text-sm">{strings.contact.searchAll}</p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className={COLUMN_CLASS[header.column.id]}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground">
                  <EmptyMessage
                    pending={contacts.isPending}
                    searching={searching}
                    order={search.order}
                    filtered={activeRole !== ALL_ROLES}
                    onShowAll={() => setSearch({ order: 'alpha', role: ALL_ROLES })}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() =>
                    void navigate({
                      to: '/contacts/$contactId',
                      params: { contactId: row.original.id },
                    })
                  }
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className={COLUMN_CLASS[cell.column.id]}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Only when the list is actually cut short — and then it names the page
          size, because "why 50 of 214" is the next question (K3). */}
      {total > rows.length && (
        <p className="mt-3 text-[13px] text-muted-foreground tabular-nums">
          {strings.contact.countOf(rows.length, total, PAGE_SIZE)}
        </p>
      )}
    </>
  )
}

/** An empty `current` list is the normal state on a quiet day, so it says what
 *  it means and offers the way out rather than reading like a dead end. */
function EmptyMessage({
  pending,
  searching,
  order,
  filtered,
  onShowAll,
}: {
  pending: boolean
  searching: boolean
  order: 'current' | 'alpha'
  filtered: boolean
  onShowAll: () => void
}) {
  if (pending) return <>{strings.status.loading}</>
  if (searching) return <>{strings.contact.emptyFiltered}</>

  if (order === 'current') {
    return (
      <span className="flex flex-wrap items-center gap-2">
        {strings.contact.emptyCurrent}
        <Button variant="link" className="h-auto p-0" onClick={onShowAll}>
          {strings.contact.emptyCurrentAction}
        </Button>
      </span>
    )
  }

  return <>{filtered ? strings.contact.emptyFiltered : strings.contact.empty}</>
}
