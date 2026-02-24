import { createContext, useContext } from 'react'
import type { Media } from '@shared/types'

export interface AcfMediaContextValue {
  siteId: string
  postId: string
  mediaItems: Media[]
  refreshMedia: () => Promise<void>
}

const AcfMediaContext = createContext<AcfMediaContextValue | null>(null)

export const AcfMediaProvider = AcfMediaContext.Provider

export function useAcfMedia(): AcfMediaContextValue {
  const ctx = useContext(AcfMediaContext)
  if (!ctx) throw new Error('useAcfMedia must be used within AcfMediaProvider')
  return ctx
}
