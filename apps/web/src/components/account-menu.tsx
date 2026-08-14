import type { CurrentUser } from '@praxi/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, LogOut, Settings } from 'lucide-react'
import { useState } from 'react'
import { StartPagePicker } from '@/components/start-page-picker'
import { ThemePicker } from '@/components/theme-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { resetCache, signOut } from '@/lib/auth'
import { practiceSettingsQueryOptions } from '@/lib/settings'
import { strings } from '@/lib/strings'

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
}

/**
 * The topbar's user menu: avatar, name, and — behind "Einstellungen" — the
 * account dialog with the two personal preferences (theme, start page).
 * `Dialog`, not `AlertDialog`: this is a form, not a confirmation, the one
 * thing the prototype had the other way round (CLAUDE.md, D3 decision).
 */
export function AccountMenu({ user }: { user: CurrentUser }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: practiceSettings } = useQuery(practiceSettingsQueryOptions)

  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSettled: async () => {
      await resetCache(queryClient)
      await navigate({ to: '/login' })
    },
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 outline-none hover:bg-accent"
            aria-label={strings.account.settings}
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-xs">
              {initialsOf(user.name)}
            </span>
            <span className="text-sm">{user.name}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>
            <p className="font-semibold">{user.name}</p>
            {practiceSettings && (
              <p className="mt-0.5 font-normal text-muted-foreground text-xs">
                {practiceSettings.practiceName}
              </p>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
            <Settings aria-hidden />
            {strings.account.settings}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => signOutMutation.mutate()}>
            <LogOut aria-hidden />
            {strings.nav.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{strings.account.settings}</DialogTitle>
            <DialogDescription>{strings.account.settingsDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5 py-2">
            <ThemePicker />
            <StartPagePicker />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              {strings.actions.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
