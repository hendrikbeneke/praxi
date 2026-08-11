import { ReadModeFooter } from '@/components/read-mode-footer'

export function Bearbeitbar() {
  return <ReadModeFooter onClose={() => {}} onEdit={() => {}} />
}

export function Gesperrt() {
  return <ReadModeFooter onClose={() => {}} onEdit={() => {}} canEdit={false} />
}
