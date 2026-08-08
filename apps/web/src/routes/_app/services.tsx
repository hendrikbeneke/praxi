import { formatEuro, type Service, type ServiceGroup } from '@praxi/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
import { ServiceDialog } from '@/components/service-dialog'
import { ServiceGroupDialog } from '@/components/service-group-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { serviceGroupListQueryOptions, serviceListQueryOptions } from '@/lib/services'
import { strings } from '@/lib/strings'

/** Nothing personal here, so both filters may live in the URL. */
const searchSchema = z.object({
  tab: z.enum(['services', 'groups']).optional(),
  inactive: z.boolean().optional(),
})

export const Route = createFileRoute('/_app/services')({
  validateSearch: searchSchema,
  component: ServicesPage,
})

const features = tableFeatures({})
const column = createColumnHelper<typeof features, Service>()

const columns = column.columns([
  column.accessor('shortCode', {
    header: strings.service.shortCode,
    cell: (info) => info.getValue() ?? '—',
  }),
  column.display({
    id: 'description',
    header: strings.service.serviceDescription,
    cell: (info) => (
      <span className="flex items-center gap-2">
        <span className="font-medium">{info.row.original.description}</span>
        {!info.row.original.active && (
          <Badge variant="secondary">{strings.service.inactiveBadge}</Badge>
        )}
      </span>
    ),
  }),
  column.accessor('feeCode', {
    header: strings.service.feeCode,
    cell: (info) => info.getValue() ?? '—',
  }),
  column.accessor('defaultPriceCents', {
    header: strings.service.price,
    cell: (info) => <span className="tabular-nums">{formatEuro(info.getValue())}</span>,
  }),
  column.accessor('defaultDurationMin', {
    header: strings.service.duration,
    cell: (info) => {
      const minutes = info.getValue()
      return minutes === null ? (
        <span className="text-muted-foreground">{strings.service.durationEmpty}</span>
      ) : (
        <span className="tabular-nums">
          {minutes} {strings.service.durationMinutes}
        </span>
      )
    },
  }),
])

function ServicesPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const includeInactive = search.inactive ?? false
  const tab = search.tab ?? 'services'

  const services = useQuery(serviceListQueryOptions(includeInactive))
  const groups = useQuery(serviceGroupListQueryOptions(includeInactive))
  // The group editor picks from the catalogue, and it must not offer an entry
  // that no longer applies.
  const activeServices = useQuery(serviceListQueryOptions(false))

  const [editedService, setEditedService] = useState<Service | undefined>()
  const [serviceOpen, setServiceOpen] = useState(false)
  const [editedGroup, setEditedGroup] = useState<ServiceGroup | undefined>()
  const [groupOpen, setGroupOpen] = useState(false)

  const rows = services.data ?? []
  const table = useTable({ features, columns, data: rows })

  function openService(service?: Service) {
    setEditedService(service)
    setServiceOpen(true)
  }

  function openGroup(group?: ServiceGroup) {
    setEditedGroup(group)
    setGroupOpen(true)
  }

  return (
    <>
      <PageHeader
        title={strings.service.title}
        description={strings.service.description}
        actions={
          <Button onClick={() => (tab === 'services' ? openService() : openGroup())}>
            <Plus className="size-4" aria-hidden />
            {tab === 'services' ? strings.service.create : strings.service.groupCreate}
          </Button>
        }
      />

      <p className="mb-6 max-w-3xl text-muted-foreground text-sm">{strings.service.templateHint}</p>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({
            search: (previous) => ({
              ...previous,
              tab: value === 'services' ? undefined : 'groups',
            }),
          })
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="services">{strings.service.tabServices}</TabsTrigger>
            <TabsTrigger value="groups">{strings.service.tabGroups}</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Checkbox
              id="show-inactive"
              checked={includeInactive}
              onCheckedChange={(checked) =>
                void navigate({
                  search: (previous) => ({
                    ...previous,
                    inactive: checked === true ? true : undefined,
                  }),
                })
              }
            />
            <Label htmlFor="show-inactive" className="font-normal">
              {strings.service.showInactive}
            </Label>
          </div>
        </div>

        <TabsContent value="services" className="pt-6">
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
                      {services.isPending ? strings.status.loading : strings.service.empty}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => openService(row.original)}
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
        </TabsContent>

        <TabsContent value="groups" className="pt-6">
          {groups.data?.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {groups.isPending ? strings.status.loading : strings.service.groupEmpty}
            </p>
          ) : (
            <ul className="space-y-3">
              {groups.data?.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    className="w-full rounded-md border px-4 py-3 text-left transition-colors hover:bg-accent"
                    onClick={() => openGroup(group)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{group.name}</span>
                      {!group.active && (
                        <Badge variant="secondary">{strings.service.inactiveBadge}</Badge>
                      )}
                      <span className="text-muted-foreground text-sm">
                        {strings.service.groupCount(group.items.length)}
                      </span>
                    </span>
                    <span className="mt-1 block text-muted-foreground text-sm">
                      {group.items
                        .map((item) => `${item.quantity}× ${item.description}`)
                        .join(', ') || strings.service.groupItemsEmpty}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <ServiceDialog service={editedService} open={serviceOpen} onOpenChange={setServiceOpen} />
      <ServiceGroupDialog
        group={editedGroup}
        services={activeServices.data ?? []}
        open={groupOpen}
        onOpenChange={setGroupOpen}
      />
    </>
  )
}
