import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema } from '@praxi/shared'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { currentUserQueryOptions, resetCache, signIn } from '@/lib/auth'
import { strings } from '@/lib/strings'

const searchSchema = z.object({
  /** Where to go after signing in. Relative paths only — an absolute URL here
   *  would turn the login page into an open redirect. */
  redirect: z
    .string()
    .optional()
    .refine((value) => value === undefined || /^\/(?!\/)/.test(value)),
})

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQueryOptions)
    if (user) throw redirect({ to: '/' })
  },
  component: LoginPage,
})

/**
 * The very schema the server validates against — including its transforms, so
 * the email is lower-cased before it leaves the browser. The password field is
 * only checked for presence: a length rule on the sign-in form would say
 * something about the stored password.
 *
 * Input and output type differ because of those transforms, hence the three
 * type arguments to `useForm`: the fields hold the raw input, `handleSubmit`
 * hands over the parsed output.
 */
const formSchema = loginSchema

type FormInput = z.input<typeof formSchema>
type FormOutput = z.output<typeof formSchema>

function LoginPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const { queryClient } = Route.useRouteContext()

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  const mutation = useMutation({
    mutationFn: signIn,
    onSuccess: async (user) => {
      await resetCache(queryClient)
      queryClient.setQueryData(currentUserQueryOptions.queryKey, user)
      await navigate({ to: search.redirect ?? '/' })
    },
  })

  const errorMessage =
    mutation.error instanceof ApiError ? mutation.error.message : strings.login.failed

  return (
    <main className="grid min-h-svh place-items-center px-6 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{strings.app.title}</CardTitle>
          <CardDescription>{strings.login.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="email">{strings.login.email}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                // Single-purpose page: the practitioner opens it to type here.
                autoFocus
                aria-invalid={form.formState.errors.email ? true : undefined}
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="text-destructive text-sm">{strings.validation.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{strings.login.password}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={form.formState.errors.password ? true : undefined}
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <p className="text-destructive text-sm">{strings.validation.required}</p>
              )}
            </div>

            {mutation.isError && (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? strings.login.submitting : strings.login.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
