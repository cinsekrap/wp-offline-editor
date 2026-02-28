export type ToastFn = (opts: {
  title: string
  description?: string
  variant?: 'default' | 'destructive' | 'warning'
}) => void
