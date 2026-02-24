import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'
import { Badge } from '@renderer/components/ui/badge'
import { Calendar } from '@renderer/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Button } from '@renderer/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { CalendarIcon } from 'lucide-react'
import { format, parse } from 'date-fns'
import { cn } from '@renderer/lib/utils'
import { AcfGroupField } from './AcfGroupField'
import { AcfRepeaterField } from './AcfRepeaterField'
import { AcfFlexibleContentField } from './AcfFlexibleContentField'
import { AcfMediaField } from './AcfMediaField'
import { AcfGalleryField } from './AcfGalleryField'
import type { AcfField } from '@shared/types'

interface AcfFieldRendererProps {
  field: AcfField
  value: unknown
  onChange: (name: string, value: unknown) => void
}

const UNSUPPORTED_TYPES = new Set([
  'relationship',
  'post_object',
  'page_link',
  'user',
  'taxonomy',
  'clone'
])

/** Resolve display value — use value if defined, otherwise field default_value */
function resolveValue(value: unknown, field: AcfField): unknown {
  if (value !== undefined && value !== null) return value
  return (field.default_value as unknown) ?? undefined
}

/** Render field instructions as muted text below the label */
function Instructions({ field }: { field: AcfField }): JSX.Element | null {
  const instructions = field.instructions as string | undefined
  if (!instructions) return null
  return <p className="text-[11px] text-muted-foreground leading-tight">{instructions}</p>
}

/** Wrap an input with optional prepend/append decorations */
function InputWithAddons({
  prepend,
  append,
  children
}: {
  prepend?: string
  append?: string
  children: React.ReactNode
}): JSX.Element {
  if (!prepend && !append) return <>{children}</>
  return (
    <div className="flex items-center">
      {prepend && (
        <span className="inline-flex items-center px-2 h-8 text-xs text-muted-foreground bg-muted border border-r-0 rounded-l-md">
          {prepend}
        </span>
      )}
      <div className={cn('flex-1', prepend && '[&>input]:rounded-l-none', append && '[&>input]:rounded-r-none')}>
        {children}
      </div>
      {append && (
        <span className="inline-flex items-center px-2 h-8 text-xs text-muted-foreground bg-muted border border-l-0 rounded-r-md">
          {append}
        </span>
      )}
    </div>
  )
}

export function AcfFieldRenderer({ field, value, onChange }: AcfFieldRendererProps): JSX.Element {
  if (UNSUPPORTED_TYPES.has(field.type)) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{field.label}</Label>
        <Badge variant="secondary" className="text-xs">
          {field.type} — not supported
        </Badge>
      </div>
    )
  }

  const prepend = (field.prepend as string) || undefined
  const append = (field.append as string) || undefined
  const placeholder = (field.placeholder as string) || undefined

  switch (field.type) {
    case 'text': {
      const val = (resolveValue(value, field) as string) ?? ''
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <InputWithAddons prepend={prepend} append={append}>
            <Input
              value={val}
              onChange={(e) => onChange(field.name, e.target.value)}
              placeholder={placeholder}
              className="h-8 text-sm"
            />
          </InputWithAddons>
        </div>
      )
    }

    case 'textarea': {
      const val = (resolveValue(value, field) as string) ?? ''
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <Textarea
            value={val}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={placeholder}
            className="text-sm min-h-[60px]"
            rows={3}
          />
        </div>
      )
    }

    case 'number': {
      const val = (resolveValue(value, field) as string) ?? ''
      const min = field.min as number | undefined
      const max = field.max as number | undefined
      const step = field.step as number | undefined
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <InputWithAddons prepend={prepend} append={append}>
            <Input
              type="number"
              value={val}
              onChange={(e) => onChange(field.name, e.target.value)}
              placeholder={placeholder}
              className="h-8 text-sm"
              {...(min !== undefined && min !== '' ? { min } : {})}
              {...(max !== undefined && max !== '' ? { max } : {})}
              {...(step !== undefined && step !== '' ? { step } : {})}
            />
          </InputWithAddons>
        </div>
      )
    }

    case 'email': {
      const val = (resolveValue(value, field) as string) ?? ''
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <InputWithAddons prepend={prepend} append={append}>
            <Input
              type="email"
              value={val}
              onChange={(e) => onChange(field.name, e.target.value)}
              placeholder={placeholder}
              className="h-8 text-sm"
            />
          </InputWithAddons>
        </div>
      )
    }

    case 'url': {
      const val = (resolveValue(value, field) as string) ?? ''
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <InputWithAddons prepend={prepend} append={append}>
            <Input
              type="url"
              value={val}
              onChange={(e) => onChange(field.name, e.target.value)}
              placeholder={placeholder}
              className="h-8 text-sm"
            />
          </InputWithAddons>
        </div>
      )
    }

    case 'select': {
      const val = (resolveValue(value, field) as string) ?? ''
      const allowNull = Boolean(field.allow_null)
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <Select
            value={val}
            onValueChange={(v) => onChange(field.name, v === '__acf_null__' ? '' : v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {allowNull && (
                <SelectItem value="__acf_null__">— Select —</SelectItem>
              )}
              {field.choices &&
                Object.entries(field.choices).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    case 'checkbox': {
      const resolved = resolveValue(value, field)
      const checked = Array.isArray(resolved) ? (resolved as string[]) : []
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <div className="space-y-1">
            {field.choices &&
              Object.entries(field.choices).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`${field.key}-${key}`}
                    checked={checked.includes(key)}
                    onCheckedChange={(isChecked) => {
                      const next = isChecked
                        ? [...checked, key]
                        : checked.filter((v) => v !== key)
                      onChange(field.name, next)
                    }}
                  />
                  <Label htmlFor={`${field.key}-${key}`} className="text-xs font-normal">
                    {label}
                  </Label>
                </div>
              ))}
          </div>
        </div>
      )
    }

    case 'radio': {
      const val = (resolveValue(value, field) as string) ?? ''
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <RadioGroup
            value={val}
            onValueChange={(v) => onChange(field.name, v)}
          >
            {field.choices &&
              Object.entries(field.choices).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <RadioGroupItem value={key} id={`${field.key}-${key}`} />
                  <Label htmlFor={`${field.key}-${key}`} className="text-xs font-normal">
                    {label}
                  </Label>
                </div>
              ))}
          </RadioGroup>
        </div>
      )
    }

    case 'button_group': {
      const val = (resolveValue(value, field) as string) ?? ''
      const choices = field.choices ? Object.entries(field.choices) : []
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <div className="inline-flex rounded-md border overflow-hidden">
            {choices.map(([key, label], i) => (
              <button
                key={key}
                type="button"
                className={cn(
                  'px-3 py-1 text-xs transition-colors',
                  i > 0 && 'border-l',
                  val === key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-muted'
                )}
                onClick={() => onChange(field.name, key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )
    }

    case 'true_false': {
      const resolved = resolveValue(value, field)
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
            <Switch
              checked={Boolean(resolved)}
              onCheckedChange={(v) => onChange(field.name, v)}
            />
          </div>
          <Instructions field={field} />
        </div>
      )
    }

    case 'date_picker': {
      const resolved = (resolveValue(value, field) as string) ?? ''
      let date: Date | undefined
      if (resolved) {
        try {
          date = parse(resolved, 'yyyyMMdd', new Date())
        } catch {
          // ignore parse errors
        }
      }
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-8 w-full justify-start text-left text-sm font-normal',
                  !date && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, 'PPP') : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  onChange(field.name, d ? format(d, 'yyyyMMdd') : '')
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      )
    }

    case 'wysiwyg': {
      const val = (resolveValue(value, field) as string) ?? ''
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <Textarea
            value={val}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={placeholder}
            className="text-sm min-h-[80px]"
            rows={4}
          />
        </div>
      )
    }

    case 'color_picker': {
      const val = (resolveValue(value, field) as string) ?? '#000000'
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <Input
            type="color"
            value={val}
            onChange={(e) => onChange(field.name, e.target.value)}
            className="h-8 w-16 p-1"
          />
        </div>
      )
    }

    case 'image':
      return <AcfMediaField field={field} value={value} onChange={onChange} accept="image/*" />

    case 'file':
      return <AcfMediaField field={field} value={value} onChange={onChange} />

    case 'gallery':
      return <AcfGalleryField field={field} value={value} onChange={onChange} />

    case 'google_map': {
      const resolved = resolveValue(value, field)
      const map = (typeof resolved === 'object' && resolved !== null ? resolved : {}) as {
        address?: string
        lat?: number
        lng?: number
      }
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">{field.label}{field.required && ' *'}</Label>
          <Instructions field={field} />
          <Input
            value={map.address ?? ''}
            onChange={(e) => onChange(field.name, { ...map, address: e.target.value })}
            placeholder="Address"
            className="h-8 text-sm"
          />
          <Input
            type="number"
            step="any"
            value={map.lat ?? ''}
            onChange={(e) => {
              const v = e.target.value
              onChange(field.name, { ...map, lat: v === '' ? '' : Number(v) })
            }}
            placeholder="Latitude"
            className="h-8 text-sm"
          />
          <Input
            type="number"
            step="any"
            value={map.lng ?? ''}
            onChange={(e) => {
              const v = e.target.value
              onChange(field.name, { ...map, lng: v === '' ? '' : Number(v) })
            }}
            placeholder="Longitude"
            className="h-8 text-sm"
          />
        </div>
      )
    }

    case 'group':
      return (
        <AcfGroupField
          field={field}
          value={value}
          onChange={onChange}
          FieldRenderer={AcfFieldRenderer}
        />
      )

    case 'repeater':
      return (
        <AcfRepeaterField
          field={field}
          value={value}
          onChange={onChange}
          FieldRenderer={AcfFieldRenderer}
        />
      )

    case 'flexible_content':
      return (
        <AcfFlexibleContentField
          field={field}
          value={value}
          onChange={onChange}
          FieldRenderer={AcfFieldRenderer}
        />
      )

    default:
      return (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{field.label}</Label>
          <Badge variant="outline" className="text-xs">
            {field.type} — unsupported
          </Badge>
        </div>
      )
  }
}
