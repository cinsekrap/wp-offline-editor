import { useMemo } from 'react'
import { useAcfSchema } from '@renderer/hooks/useAcfSchema'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Separator } from '@renderer/components/ui/separator'
import { AcfFieldRenderer } from './AcfFieldRenderer'
import { buildFieldValueMap, isFieldVisible } from './acf-conditional-logic'
import { Loader2 } from 'lucide-react'
import type { AcfLocationRule, AcfField } from '@shared/types'

/** Location params that indicate a non-post editing context */
const NON_POST_CONTEXT_PARAMS = new Set([
  'options_page',
  'taxonomy',
  'user_form',
  'user_role',
  'nav_menu',
  'nav_menu_item',
  'menu_item',
  'widget',
  'block',
  'comment',
  'attachment',
  'current_user',
  'page_template'
])

/**
 * Returns true if location rules allow the field group to appear for the given post type.
 * A group matches if any OR group targets this post type. An OR group matches if:
 *   1. It has an explicit `post_type == postType` rule, OR
 *   2. It has no `post_type` rules AND no non-post context params (options_page, taxonomy, etc.)
 * This prevents settings/options/taxonomy/menu groups from leaking into the post editor.
 */
function matchesPostType(location: AcfLocationRule[][] | null, postType: string): boolean {
  if (!location || location.length === 0) return true

  return location.some((orGroup) => {
    const postTypeRules = orGroup.filter((rule) => rule.param === 'post_type')
    const hasNonPostContext = orGroup.some((rule) => NON_POST_CONTEXT_PARAMS.has(rule.param))

    if (postTypeRules.length === 0) {
      // No post_type rule — only match if there are also no non-post context params
      return !hasNonPostContext
    }

    // Has explicit post_type rules — check if any matches
    return postTypeRules.some((rule) => {
      if (rule.operator === '==' ) return rule.value === postType
      if (rule.operator === '!=') return rule.value !== postType
      return false
    })
  })
}

interface AcfPanelProps {
  siteId: string
  acfData: Record<string, unknown>
  onChange: (name: string, value: unknown) => void
}

function filterVisibleFields(fields: AcfField[], acfData: Record<string, unknown>): AcfField[] {
  const valueMap = buildFieldValueMap(fields, acfData)
  return fields.filter((f) => isFieldVisible(f, valueMap))
}

export function AcfPanel({ siteId, acfData, onChange }: AcfPanelProps): JSX.Element | null {
  const { schemas: allSchemas, loading } = useAcfSchema(siteId)
  const schemas = allSchemas.filter((s) => matchesPostType(s.location, 'post'))

  // Compute visible fields per schema based on conditional logic
  const visibleFieldsBySchema = useMemo(
    () => schemas.map((s) => filterVisibleFields(s.fields, acfData)),
    [schemas, acfData]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (schemas.length === 0) return null

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-4 p-4">
        {schemas.map((schema, idx) => {
          const visibleFields = visibleFieldsBySchema[idx]
          if (visibleFields.length === 0) return null
          return (
            <div key={schema.id}>
              {idx > 0 && <Separator className="mb-4" />}
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {schema.group_title}
              </h4>
              <div className="space-y-3">
                {visibleFields.map((field) => (
                  <AcfFieldRenderer
                    key={field.key}
                    field={field}
                    value={acfData[field.name]}
                    onChange={onChange}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
