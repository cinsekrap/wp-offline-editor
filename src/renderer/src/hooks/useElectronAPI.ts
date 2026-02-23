import type { ElectronAPI } from '@shared/types'

export function useElectronAPI(): ElectronAPI {
  return window.electronAPI
}
