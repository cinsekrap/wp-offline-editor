import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Unwrap an error thrown across the IPC boundary.
 *
 * Electron rejects with `Error invoking remote method 'sites:add': Error: …`,
 * which buries the part the reader needs — and for messages that exist to tell
 * someone what to do next, the prefix is the whole problem.
 */
export function ipcErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || !err.message) return fallback
  return err.message.replace(/^Error invoking remote method '[^']*':\s*(?:[\w$]*Error:\s*)?/, '')
}
