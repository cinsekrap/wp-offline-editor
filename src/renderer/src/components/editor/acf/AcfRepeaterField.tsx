import { type ComponentType, useState, useRef, useCallback, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, ChevronRight } from 'lucide-react'
import { Label } from '@renderer/components/ui/label'
import { Button } from '@renderer/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { cn } from '@renderer/lib/utils'
import { buildFieldValueMap, isFieldVisible } from './acf-conditional-logic'
import type { AcfField } from '@shared/types'

interface FieldRendererProps {
  field: AcfField
  value: unknown
  onChange: (name: string, value: unknown) => void
}

interface AcfRepeaterFieldProps extends FieldRendererProps {
  FieldRenderer: ComponentType<FieldRendererProps>
}

interface RowState {
  id: string
  data: Record<string, unknown>
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[]
  return []
}

function getRowLabel(row: Record<string, unknown>, subFields: AcfField[], index: number): string {
  for (const sf of subFields) {
    if (sf.type === 'text' || sf.type === 'textarea' || sf.type === 'email' || sf.type === 'url') {
      const val = row[sf.name]
      if (typeof val === 'string' && val.trim()) return val.trim()
    }
  }
  return `Row ${index + 1}`
}

function SortableRow({
  row,
  index,
  subFields,
  onSubFieldChange,
  onRemove,
  canRemove,
  FieldRenderer
}: {
  row: RowState
  index: number
  subFields: AcfField[]
  onSubFieldChange: (rowId: string, subName: string, subValue: unknown) => void
  onRemove: (rowId: string) => void
  canRemove: boolean
  FieldRenderer: ComponentType<FieldRendererProps>
}): JSX.Element {
  const [open, setOpen] = useState(true)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const label = getRowLabel(row.data, subFields, index)

  const visibleSubFields = useMemo(() => {
    const valueMap = buildFieldValueMap(subFields, row.data)
    return subFields.filter((sf) => isFieldVisible(sf, valueMap))
  }, [subFields, row.data])

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('border rounded-md bg-background', isDragging && 'opacity-50 shadow-lg')}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-muted/40 rounded-t-md">
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 flex-1 text-left text-xs font-medium truncate"
            >
              <ChevronRight
                className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
              />
              <span className="truncate">{label}</span>
            </button>
          </CollapsibleTrigger>
          {canRemove && (
            <button
              type="button"
              onClick={() => onRemove(row.id)}
              className="text-muted-foreground hover:text-destructive p-0.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <CollapsibleContent>
          <div className="p-3 space-y-3">
            {visibleSubFields.map((sf) => (
              <FieldRenderer
                key={sf.key}
                field={sf}
                value={row.data[sf.name]}
                onChange={(subName, subValue) => onSubFieldChange(row.id, subName, subValue)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export function AcfRepeaterField({
  field,
  value,
  onChange,
  FieldRenderer
}: AcfRepeaterFieldProps): JSX.Element {
  const subFields = field.sub_fields ?? []
  const min = (field.min as number) ?? 0
  const max = (field.max as number) ?? 0

  const [rows, setRows] = useState<RowState[]>(() =>
    normalizeRows(value).map((data) => ({ id: crypto.randomUUID(), data }))
  )

  // Track the latest rows in a ref so emitChange always uses current state
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const emitChange = useCallback(
    (newRows: RowState[]) => {
      setRows(newRows)
      rowsRef.current = newRows
      onChange(field.name, newRows.map((r) => r.data))
    },
    [field.name, onChange]
  )

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const current = rowsRef.current
    const oldIndex = current.findIndex((r) => r.id === active.id)
    const newIndex = current.findIndex((r) => r.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    emitChange(arrayMove(current, oldIndex, newIndex))
  }

  function handleSubFieldChange(rowId: string, subName: string, subValue: unknown): void {
    const newRows = rowsRef.current.map((r) =>
      r.id === rowId ? { ...r, data: { ...r.data, [subName]: subValue } } : r
    )
    emitChange(newRows)
  }

  function handleAddRow(): void {
    const newRow: Record<string, unknown> = {}
    for (const sf of subFields) {
      newRow[sf.name] = (sf.default_value as unknown) ?? ''
    }
    emitChange([...rowsRef.current, { id: crypto.randomUUID(), data: newRow }])
  }

  function handleRemoveRow(rowId: string): void {
    emitChange(rowsRef.current.filter((r) => r.id !== rowId))
  }

  const canAdd = max === 0 || rows.length < max
  const canRemove = rows.length > min

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
        {(min > 0 || max > 0) && (
          <span className="text-[10px] text-muted-foreground">
            {rows.length}{max > 0 ? ` / ${max}` : ''}
          </span>
        )}
      </div>
      <div className="space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={rows.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            {rows.map((row, i) => (
              <SortableRow
                key={row.id}
                row={row}
                index={i}
                subFields={subFields}
                onSubFieldChange={handleSubFieldChange}
                onRemove={handleRemoveRow}
                canRemove={canRemove}
                FieldRenderer={FieldRenderer}
              />
            ))}
          </SortableContext>
        </DndContext>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full text-xs h-7"
          onClick={handleAddRow}
          disabled={!canAdd}
        >
          + {(field.button_label as string) || 'Add Row'}
        </Button>
      </div>
    </div>
  )
}
