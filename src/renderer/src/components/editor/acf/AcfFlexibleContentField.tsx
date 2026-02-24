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
import { GripVertical, Trash2, ChevronRight, Plus } from 'lucide-react'
import { Label } from '@renderer/components/ui/label'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@renderer/components/ui/popover'
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

interface AcfFlexibleContentFieldProps extends FieldRendererProps {
  FieldRenderer: ComponentType<FieldRendererProps>
}

interface BlockState {
  id: string
  data: Record<string, unknown>
}

function normalizeBlocks(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[]
  return []
}

/** Layouts are stored as synthetic sub_fields with type: 'layout' */
function getLayouts(field: AcfField): AcfField[] {
  return (field.sub_fields ?? []).filter((sf) => sf.type === 'layout')
}

function findLayout(layouts: AcfField[], layoutName: string): AcfField | undefined {
  return layouts.find((l) => l.name === layoutName)
}

function SortableBlock({
  block,
  layout,
  onSubFieldChange,
  onRemove,
  FieldRenderer
}: {
  block: BlockState
  layout: AcfField | undefined
  onSubFieldChange: (blockId: string, subName: string, subValue: unknown) => void
  onRemove: (blockId: string) => void
  FieldRenderer: ComponentType<FieldRendererProps>
}): JSX.Element {
  const [open, setOpen] = useState(true)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const layoutLabel = layout?.label ?? (block.data.acf_fc_layout as string) ?? 'Unknown'
  const subFields = layout?.sub_fields ?? []

  const visibleSubFields = useMemo(() => {
    const valueMap = buildFieldValueMap(subFields, block.data)
    return subFields.filter((sf) => isFieldVisible(sf, valueMap))
  }, [subFields, block.data])

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
              className="flex items-center gap-1 flex-1 text-left text-xs truncate"
            >
              <ChevronRight
                className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
              />
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {layoutLabel}
              </Badge>
            </button>
          </CollapsibleTrigger>
          <button
            type="button"
            onClick={() => onRemove(block.id)}
            className="text-muted-foreground hover:text-destructive p-0.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <CollapsibleContent>
          <div className="p-3 space-y-3">
            {visibleSubFields.length > 0 ? (
              visibleSubFields.map((sf) => (
                <FieldRenderer
                  key={sf.key}
                  field={sf}
                  value={block.data[sf.name]}
                  onChange={(subName, subValue) => onSubFieldChange(block.id, subName, subValue)}
                />
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No fields for this layout.</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export function AcfFlexibleContentField({
  field,
  value,
  onChange,
  FieldRenderer
}: AcfFlexibleContentFieldProps): JSX.Element {
  const layouts = getLayouts(field)

  const [blocks, setBlocks] = useState<BlockState[]>(() =>
    normalizeBlocks(value).map((data) => ({ id: crypto.randomUUID(), data }))
  )

  const blocksRef = useRef(blocks)
  blocksRef.current = blocks

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const emitChange = useCallback(
    (newBlocks: BlockState[]) => {
      setBlocks(newBlocks)
      blocksRef.current = newBlocks
      onChange(field.name, newBlocks.map((b) => b.data))
    },
    [field.name, onChange]
  )

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const current = blocksRef.current
    const oldIndex = current.findIndex((b) => b.id === active.id)
    const newIndex = current.findIndex((b) => b.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    emitChange(arrayMove(current, oldIndex, newIndex))
  }

  function handleSubFieldChange(blockId: string, subName: string, subValue: unknown): void {
    const newBlocks = blocksRef.current.map((b) =>
      b.id === blockId ? { ...b, data: { ...b.data, [subName]: subValue } } : b
    )
    emitChange(newBlocks)
  }

  function handleAddBlock(layoutName: string): void {
    const layout = findLayout(layouts, layoutName)
    const data: Record<string, unknown> = { acf_fc_layout: layoutName }
    if (layout?.sub_fields) {
      for (const sf of layout.sub_fields) {
        data[sf.name] = (sf.default_value as unknown) ?? ''
      }
    }
    emitChange([...blocksRef.current, { id: crypto.randomUUID(), data }])
  }

  function handleRemoveBlock(blockId: string): void {
    emitChange(blocksRef.current.filter((b) => b.id !== blockId))
  }

  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
      <div className="space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {blocks.map((block) => (
              <SortableBlock
                key={block.id}
                block={block}
                layout={findLayout(layouts, block.data.acf_fc_layout as string)}
                onSubFieldChange={handleSubFieldChange}
                onRemove={handleRemoveBlock}
                FieldRenderer={FieldRenderer}
              />
            ))}
          </SortableContext>
        </DndContext>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-xs h-7"
            >
              <Plus className="h-3 w-3 mr-1" />
              {(field.button_label as string) || 'Add Layout'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            {layouts.map((layout) => (
              <button
                key={layout.key}
                type="button"
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-accent"
                onClick={() => {
                  handleAddBlock(layout.name)
                  setPickerOpen(false)
                }}
              >
                {layout.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
