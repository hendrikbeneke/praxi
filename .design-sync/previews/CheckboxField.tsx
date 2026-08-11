import { useState } from 'react'
import { CheckboxField } from '@/components/catalogue-controls'
import { strings } from '@/lib/strings'

export function OhneHinweis() {
  const [checked, setChecked] = useState(true)
  return (
    <CheckboxField
      id="preview-tab"
      label={strings.contactType.showAsTab}
      checked={checked}
      onChange={setChecked}
    />
  )
}

export function MitHinweis() {
  const [checked, setChecked] = useState(false)
  return (
    <CheckboxField
      id="preview-symmetric"
      label={strings.contactType.symmetric}
      hint={strings.contactType.symmetricHint}
      checked={checked}
      onChange={setChecked}
    />
  )
}
