import { DeleteButton } from '@/components/catalogue-controls'
import { strings } from '@/lib/strings'

export function Aktiv() {
  return (
    <DeleteButton
      disabled={false}
      title={strings.contactType.deleteTitle}
      body={strings.contactType.deleteBody}
      onConfirm={() => {}}
    />
  )
}

export function Gesperrt() {
  return (
    <DeleteButton
      disabled={true}
      hint={strings.contactType.systemHint}
      title={strings.contactType.deleteTitle}
      body={strings.contactType.deleteBody}
      onConfirm={() => {}}
    />
  )
}
