import { isValid, parse } from 'date-fns'

/** ACF stores date_picker values as Ymd. */
const ACF_DATE_FORMAT = 'yyyyMMdd'

/**
 * Parse an ACF date_picker value, or return undefined when it isn't one.
 *
 * date-fns `parse` does not throw on a value that isn't in the expected format —
 * it returns an Invalid Date, which is truthy. Guarding with try/catch therefore
 * catches nothing, and passing that object to `format` throws a RangeError which
 * takes down the whole field panel. The value arrives from the remote site, so
 * anything can turn up here: a display-formatted date, an ISO string, or a type
 * other than string.
 */
export function parseAcfDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  const parsed = parse(value, ACF_DATE_FORMAT, new Date())
  return isValid(parsed) ? parsed : undefined
}

export { ACF_DATE_FORMAT }
