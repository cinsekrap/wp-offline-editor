import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport
} from '@renderer/components/ui/toast'
import { useToast } from '@renderer/components/ui/use-toast'
import { useEffect } from 'react'

export function Toaster(): React.JSX.Element {
  const { toasts } = useToast()

  // Mirror the number of unseen error/warning toasts onto the Dock badge, so
  // persistent toasts fired while the window was unfocused are noticeable.
  const attentionCount = toasts.filter(
    (t) => t.open && (t.variant === 'destructive' || t.variant === 'warning')
  ).length
  useEffect(() => {
    window.electronAPI.setBadgeCount(attentionCount)
  }, [attentionCount])

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
