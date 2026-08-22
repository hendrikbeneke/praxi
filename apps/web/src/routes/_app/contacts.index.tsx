import {
  type ContactListItem,
  type ContactSortField,
  contactSortFieldSchema,
  formatBerlinDate,
  formatContactNameSorted,
  sortDirectionSchema,
} from '@praxi/shared'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table'
import { ChevronDown, Plus, Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { z } from 'zod'
import { listTabClass } from '@/components/chip'
import { type ColumnDefinition, ColumnPicker } from '@/components/column-picker'
import { InfiniteSentinel } from '@/components/infinite-sentinel'
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
  /** One plain sort. The `current` order and its switch went with L3 — it
   *  filtered to a window of fourteen days while claiming to sort. */
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
  sortHeader: (field: ContactSortField, label: string, align?: 'end') => React.ReactNode
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
        header: () => options.sortHeader('city', strings.contact.columns.city),
        cell: (info) => info.getValue() ?? '—',
      }),
    },
    {
      key: 'dateOfBirth',
      def: column.accessor('dateOfBirth', {
        header: () => options.sortHeader('dateOfBirth', strings.contact.columns.dateOfBirth),
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

  /**
   * The appointment column stood here until L3 and is gone with the order that
   * explained it. It is not a property of a contact but of the calendar, it
   * cost a join on every read of this list, and whether the practice needs it
   * here at all is not decided — learning that first is cheaper than carrying
   * it meanwhile.
   */
  return column.columns(ordered)
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
   * The search beats the role filter: while something is typed, the whole card
   * index is searched. This is a rule of this screen, not of the API — hence
   * here and not in the domain.
   *
   * It no longer touches the sort. Until L3 typing forced the alphabetical
   * order, because the other one filtered to a fortnight and would have hidden
   * most of what was searched for; with one plain sort there is nothing left
   * to override.
   */
  const contacts = useInfiniteQuery(
    contactListQueryOptions({
      q: deferredTerm.trim() || undefined,
      roleTypeId: searching || activeRole === ALL_ROLES ? undefined : activeRole,
      sort: search.sort,
      dir: search.dir,
      includeArchived: search.archived ?? false,
      // The role types decide what the default tab is, so asking before they
      // arrive would query the wrong list and then correct itself on screen.
      enabled: !roleTypes.isPending,
    }),
  )

  const rows = contacts.data?.pages.flatMap((page) => page.items) ?? []
  /** Counted once, with the first page — see `listContacts`. */
  const total = contacts.data?.pages[0]?.total ?? 0

  const setSearch = (next: Partial<z.infer<typeof searchSchema>>) =>
    void navigate({ search: (previous) => ({ ...previous, ...next }) })

  /** Clicking a heading sorts. Nothing else moves with it anymore. */
  const sortHeader = (field: ContactSortField, label: string, align?: 'end') => {
    const activeHere = search.sort === field
    return (
      <SortableColumnHeader
        label={label}
        align={align}
        active={activeHere}
        direction={search.dir}
        onClick={() =>
          setSearch({ sort: field, dir: activeHere && search.dir === 'asc' ? 'desc' : 'asc' })
        }
      />
    )
  }

  // Rebuilt on every render rather than memoized: the labels, the visible
  // columns and the sort arrows all depend on state that changes here, and the
  // table holds no state of its own that recreating them could disturb.
  const columns = contactColumns({
    roleLabels: new Map(types.map((type) => [type.id, type.label])),
    visibleColumns,
    sortHeader,
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
                    filtered={activeRole !== ALL_ROLES}
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

      {/* The list runs on as it is scrolled; the count says how far along it
          is rather than how much was withheld. */}
      {total > 0 && (
        <p className="mt-3 text-[13px] text-muted-foreground tabular-nums">
          {strings.contact.countLoaded(rows.length, total)}
        </p>
      )}

      <InfiniteSentinel
        hasMore={contacts.hasNextPage}
        loading={contacts.isFetchingNextPage}
        onReach={() => void contacts.fetchNextPage()}
      />
    </>
  )
}

/** Three states, and they are told apart because the way out differs: nothing
 *  yet, nothing matching what was typed, nothing in this role. */
function EmptyMessage({
  pending,
  searching,
  filtered,
}: {
  pending: boolean
  searching: boolean
  filtered: boolean
}) {
  if (pending) return <>{strings.status.loading}</>
  if (searching) return <>{strings.contact.emptyFiltered}</>
  return <>{filtered ? strings.contact.emptyFiltered : strings.contact.empty}</>
}
