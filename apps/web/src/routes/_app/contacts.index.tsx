import { type Contact, contactRoles, formatContactNameSorted } from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { contactListQueryOptions } from '@/lib/contacts'
import { strings } from '@/lib/strings'

const ALL_ROLES = 'all'
const PAGE_SIZE = 50

/**
 * Role and archived live in the URL; the search term deliberately does not.
 * In this application a search term is almost always a patient's name, and the
 * URL ends up in browser history and autocomplete (CLAUDE.md rule 12).
 */
const searchSchema = z.object({
  role: z.enum(contactRoles).optional(),
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

const column = createColumnHelper<typeof features, Contact>()

// `columns()` keeps each column's own value type; a plain array would widen
// them to a single one and stop type-checking the cells.
const columns = column.columns([
  column.accessor('contactNumber', {
    header: strings.contact.columns.number,
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  column.display({
    id: 'name',
    header: strings.contact.columns.name,
    cell: (info) => {
      const contact = info.row.original
      return (
        <span className="flex items-center gap-2">
          <span className="font-medium">{formatContactNameSorted(contact)}</span>
          {contact.archivedAt && <Badge variant="secondary">{strings.contact.archivedBadge}</Badge>}
        </span>
      )
    },
  }),
  column.display({
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
            <Badge key={entry.role} variant="outline">
              {strings.contact.role[entry.role]}
            </Badge>
          ))}
        </span>
      )
    },
  }),
  column.accessor('city', {
    header: strings.contact.columns.city,
    cell: (info) => info.getValue() ?? '—',
  }),
  column.accessor('email', {
    header: strings.contact.columns.email,
    cell: (info) => info.getValue() ?? '—',
  }),
  column.accessor('phone', {
    header: strings.contact.columns.phone,
    cell: (info) => info.getValue() ?? '—',
  }),
])

function ContactListPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const [term, setTerm] = useState('')
  // Keeps typing responsive without a timer: the list re-queries with the
  // settled value while the input stays immediate.
  const deferredTerm = useDeferredValue(term)

  const contacts = useQuery(
    contactListQueryOptions({
      q: deferredTerm.trim() || undefined,
      role: search.role,
      includeArchived: search.archived ?? false,
      limit: PAGE_SIZE,
    }),
  )

  const rows = contacts.data?.items ?? []
  const total = contacts.data?.total ?? 0

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

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="min-w-64 flex-1">
          <Label htmlFor="contact-search">{strings.contact.search}</Label>
          <Input
            id="contact-search"
            className="mt-2"
            placeholder={strings.contact.searchPlaceholder}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>

        <div className="w-56">
          <Label htmlFor="role-filter">{strings.contact.roleLabel}</Label>
          <Select
            value={search.role ?? ALL_ROLES}
            onValueChange={(value) =>
              void navigate({
                search: (previous) => ({
                  ...previous,
                  role: value === ALL_ROLES ? undefined : (value as (typeof contactRoles)[number]),
                }),
              })
            }
          >
            <SelectTrigger id="role-filter" className="mt-2 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ROLES}>{strings.contact.allRoles}</SelectItem>
              {contactRoles.map((role) => (
                <SelectItem key={role} value={role}>
                  {strings.contact.role[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="show-archived"
            checked={search.archived ?? false}
            onCheckedChange={(checked) =>
              void navigate({
                search: (previous) => ({
                  ...previous,
                  archived: checked === true ? true : undefined,
                }),
              })
            }
          />
          <Label htmlFor="show-archived" className="font-normal">
            {strings.contact.showArchived}
          </Label>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
                  {contacts.isPending
                    ? strings.status.loading
                    : deferredTerm || search.role
                      ? strings.contact.emptyFiltered
                      : strings.contact.empty}
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
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > rows.length && (
        <p className="mt-3 text-muted-foreground text-sm">
          {strings.contact.countOf(rows.length, total)}
        </p>
      )}
    </>
  )
}
