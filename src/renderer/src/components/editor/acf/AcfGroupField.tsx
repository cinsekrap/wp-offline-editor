import { type ComponentType, useMemo } from 'react'
import { Label } from '@renderer/components/ui/label'
import { buildFieldValueMap, isFieldVisible } from './acf-conditional-logic'
import type { AcfField } from '@shared/types'

interface FieldRendererProps {
  field: AcfField
  value: unknown
  onChange: (name: string, value: unknown) => void
}

interface AcfGroupFieldProps extends FieldRendererProps {
  FieldRenderer: ComponentType<FieldRendererProps>
}

export function AcfGroupField({
  field,
  value,
  onChange,
  FieldRenderer
}: AcfGroupFieldProps): JSX.Element {
  const groupValue = (value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}) as Record<string, unknown>

  const subFields = field.sub_fields ?? []

  const visibleSubFields = useMemo(() => {
    const valueMap = buildFieldValueMap(subFields, groupValue)
    return subFields.filter((sf) => isFieldVisible(sf, valueMap))
  }, [subFields, groupValue])

  function handleSubFieldChange(subName: string, subValue: unknown): void {
    onChange(field.name, { ...groupValue, [subName]: subValue })
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
      <div className="border rounded-md p-3 space-y-3 bg-muted/30">
        {visibleSubFields.map((sub) => (
          <FieldRenderer
            key={sub.key}
            field={sub}
            value={groupValue[sub.name]}
            onChange={handleSubFieldChange}
          />
        ))}
      </div>
    </div>
  )
}
