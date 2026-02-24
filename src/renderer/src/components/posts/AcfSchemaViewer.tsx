import { useState } from 'react'
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { useAcfSchema } from '@renderer/hooks/useAcfSchema'
import type { AcfField } from '@shared/types'

interface AcfSchemaViewerProps {
  siteId: string
}

export function AcfSchemaViewer({ siteId }: AcfSchemaViewerProps): JSX.Element {
  const { schemas, loading } = useAcfSchema(siteId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">ACF Schema</h2>
      </div>

      {schemas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium mb-1">No schema yet</p>
          <p className="text-sm">Use the sync button in the toolbar to pull schema.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schemas.map((schema) => (
            <FieldGroupCard
              key={schema.id}
              title={schema.group_title}
              version={schema.version}
              fields={schema.fields}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FieldGroupCard({
  title,
  version,
  fields
}: {
  title: string
  version: number
  fields: AcfField[]
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-accent/30 transition-colors rounded-lg"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0" />
        )}
        <span className="font-medium text-sm flex-1">{title}</span>
        <Badge variant="secondary" className="text-xs">
          v{version}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {fields.length} field{fields.length !== 1 ? 's' : ''}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t">
          <FieldTree fields={fields} depth={0} />
        </div>
      )}
    </div>
  )
}

function FieldTree({ fields, depth }: { fields: AcfField[]; depth: number }): JSX.Element {
  return (
    <div className={depth > 0 ? 'ml-4 border-l pl-3' : ''}>
      {fields.map((field) => (
        <FieldNode key={field.key} field={field} depth={depth} />
      ))}
    </div>
  )
}

function FieldNode({ field, depth }: { field: AcfField; depth: number }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = field.sub_fields && field.sub_fields.length > 0
  const hasChoices = field.choices && Object.keys(field.choices).length > 0

  const typeColor =
    field.type === 'layout'
      ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
      : field.type === 'repeater'
        ? 'bg-teal-100 text-teal-700 border-teal-200'
        : field.type === 'flexible_content'
          ? 'bg-violet-100 text-violet-700 border-violet-200'
          : field.type === 'group'
            ? 'bg-sky-100 text-sky-700 border-sky-200'
            : ''

  return (
    <div className="py-1">
      <div className="flex items-center gap-2">
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 hover:bg-accent rounded"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <span className="text-sm font-mono">{field.name}</span>

        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${typeColor}`}>
          {field.type}
        </Badge>

        {field.required && (
          <span className="text-red-500 text-xs font-bold" title="Required">*</span>
        )}

        {field.label !== field.name && (
          <span className="text-xs text-muted-foreground truncate">{field.label}</span>
        )}
      </div>

      {expanded && hasChildren && (
        <FieldTree fields={field.sub_fields!} depth={depth + 1} />
      )}

      {expanded && hasChoices && (
        <div className="ml-8 mt-1 text-xs text-muted-foreground">
          Choices:{' '}
          {Object.entries(field.choices!).map(([k, v], i) => (
            <span key={k}>
              {i > 0 && ', '}
              <code className="bg-muted px-1 rounded">{k === v ? k : `${k}: ${v}`}</code>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
