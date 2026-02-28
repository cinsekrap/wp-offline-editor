import { useState, useEffect, useCallback } from 'react'
import type { Site } from '@shared/types'
import type { PostListFilter } from '@renderer/components/posts/PostList'

export type View = 'dashboard' | 'posts' | 'settings' | 'templates'

interface UseNavigationParams {
  sites: Site[]
  sitesLoading: boolean
  onSelectSiteId: (id: string | null) => void
}

interface UseNavigationReturn {
  currentView: View
  previousView: View
  selectedPostId: string | null
  initialPostFilter: PostListFilter | null
  goToSettings: () => void
  goToDashboard: () => void
  goToPosts: () => void
  goToTemplates: () => void
  selectPostFromDashboard: (id: string) => void
  selectPostFromList: (id: string | null) => void
  navigateToNewPost: (postId: string) => void
  seeAllFromDashboard: (filter?: PostListFilter) => void
  backFromPost: () => void
  backToDashboard: () => void
  handleSelectSite: (site: Site) => void
}

export function useNavigation({
  sites,
  sitesLoading,
  onSelectSiteId
}: UseNavigationParams): UseNavigationReturn {
  const [currentView, setCurrentView] = useState<View>('settings')
  const [previousView, setPreviousView] = useState<View>('dashboard')
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [initialPostFilter, setInitialPostFilter] = useState<PostListFilter | null>(null)
  const [initialRouted, setInitialRouted] = useState(false)

  // Initial routing: pick first site → dashboard, or settings if none
  useEffect(() => {
    if (sitesLoading || initialRouted) return
    setInitialRouted(true)
    if (sites.length > 0) {
      onSelectSiteId(sites[0].id)
      setCurrentView('dashboard')
    } else {
      setCurrentView('settings')
    }
  }, [sitesLoading, initialRouted, sites, onSelectSiteId])

  // Cmd+, keyboard shortcut for settings
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        setCurrentView('settings')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const goToSettings = useCallback(() => setCurrentView('settings'), [])

  const goToDashboard = useCallback(() => {
    setSelectedPostId(null)
    setInitialPostFilter(null)
    setCurrentView('dashboard')
  }, [])

  const goToPosts = useCallback(() => {
    setSelectedPostId(null)
    setInitialPostFilter(null)
    setCurrentView('posts')
  }, [])

  const goToTemplates = useCallback(() => setCurrentView('templates'), [])

  const selectPostFromDashboard = useCallback((id: string) => {
    setPreviousView('dashboard')
    setSelectedPostId(id)
    setInitialPostFilter(null)
    setCurrentView('posts')
  }, [])

  const selectPostFromList = useCallback((id: string | null) => {
    if (id !== null) setPreviousView('posts')
    setSelectedPostId(id)
  }, [])

  const navigateToNewPost = useCallback((postId: string) => {
    setPreviousView('dashboard')
    setSelectedPostId(postId)
    setInitialPostFilter(null)
    setCurrentView('posts')
  }, [])

  const seeAllFromDashboard = useCallback((filter?: PostListFilter) => {
    setPreviousView('dashboard')
    setSelectedPostId(null)
    setInitialPostFilter(filter ?? null)
    setCurrentView('posts')
  }, [])

  const backFromPost = useCallback(() => {
    setSelectedPostId(null)
    if (previousView === 'dashboard') {
      setCurrentView('dashboard')
    }
  }, [previousView])

  const backToDashboard = useCallback(() => {
    setSelectedPostId(null)
    setInitialPostFilter(null)
    setCurrentView('dashboard')
  }, [])

  const handleSelectSite = useCallback(
    (site: Site) => {
      onSelectSiteId(site.id)
      setSelectedPostId(null)
      setInitialPostFilter(null)
      setCurrentView('dashboard')
    },
    [onSelectSiteId]
  )

  return {
    currentView,
    previousView,
    selectedPostId,
    initialPostFilter,
    goToSettings,
    goToDashboard,
    goToPosts,
    goToTemplates,
    selectPostFromDashboard,
    selectPostFromList,
    navigateToNewPost,
    seeAllFromDashboard,
    backFromPost,
    backToDashboard,
    handleSelectSite
  }
}
