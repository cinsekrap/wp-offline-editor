import type { AcfField } from '@shared/types'

interface ConditionalRule {
  field: string // key of the controlling field
  operator: string
  value: string
}

type ConditionalLogic = ConditionalRule[][] // OR-of-AND groups

/**
 * Build a map from field key → current value for sibling fields.
 */
export function buildFieldValueMap(
  fields: AcfField[],
  values: Record<string, unknown>
): Map<string, unknown> {
  const map = new Map<string, unknown>()
  for (const f of fields) {
    map.set(f.key, values[f.name])
  }
  return map
}

/**
 * Evaluate whether a single conditional rule passes.
 */
function evaluateRule(rule: ConditionalRule, controlValue: unknown): boolean {
  const actual = controlValue ?? ''
  const expected = rule.value ?? ''

  switch (rule.operator) {
    case '==':
      return String(actual) === String(expected)
    case '!=':
      return String(actual) !== String(expected)
    case '==empty':
      return actual === '' || actual === null || actual === undefined || actual === false
    case '!=empty':
      return actual !== '' && actual !== null && actual !== undefined && actual !== false
    case '==contains':
      if (Array.isArray(actual)) {
        return actual.some((v) => String(v) === String(expected))
      }
      return String(actual).includes(String(expected))
    default:
      // Unknown operator → show field (safe default)
      return true
  }
}

/**
 * Determine if a field should be visible given the current sibling values.
 * conditional_logic is an OR-of-AND structure: the field is visible if ANY
 * outer group has ALL its rules pass.
 *
 * If the field has no conditional_logic, it's always visible.
 */
export function isFieldVisible(
  field: AcfField,
  fieldValueMap: Map<string, unknown>
): boolean {
  const logic = field.conditional_logic as ConditionalLogic | undefined
  if (!logic || !Array.isArray(logic) || logic.length === 0) return true

  // OR groups — field visible if any group passes
  return logic.some((andGroup) => {
    if (!Array.isArray(andGroup) || andGroup.length === 0) return true

    // AND group — all rules must pass
    return andGroup.every((rule) => {
      const controlValue = fieldValueMap.get(rule.field)
      return evaluateRule(rule, controlValue)
    })
  })
}
