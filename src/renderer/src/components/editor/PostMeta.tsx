import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Calendar } from '@renderer/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@renderer/lib/utils'
import type { PostStatus } from '@shared/types'

interface PostMetaProps {
  status: PostStatus
  scheduledDate: Date | undefined
  onStatusChange: (status: PostStatus) => void
  onDateChange: (date: Date | undefined) => void
}

const STATUS_OPTIONS: { value: PostStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending Review' },
  { value: 'private', label: 'Private' },
  { value: 'publish', label: 'Published' },
  { value: 'future', label: 'Scheduled' }
]

export function PostMeta({
  status,
  scheduledDate,
  onStatusChange,
  onDateChange
}: PostMetaProps): JSX.Element {
  return (
    <div className="space-y-4 p-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Status
        </Label>
        <Select value={status} onValueChange={(v) => onStatusChange(v as PostStatus)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {status === 'future' && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Publish Date
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-8 w-full justify-start text-left text-sm font-normal',
                  !scheduledDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {scheduledDate ? format(scheduledDate, 'PPP') : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={scheduledDate} onSelect={onDateChange} />
            </PopoverContent>
          </Popover>
          {scheduledDate && (
            <div className="flex gap-2">
              <Input
                type="time"
                className="h-8 text-sm"
                value={format(scheduledDate, 'HH:mm')}
                onChange={(e) => {
                  const [hours, minutes] = e.target.value.split(':').map(Number)
                  const next = new Date(scheduledDate)
                  next.setHours(hours, minutes)
                  onDateChange(next)
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
