import { AlertTriangle, CheckCircle, CloudUpload, Loader2 } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { usePosts } from '@renderer/hooks/usePosts'

const STATUS_COLORS: Record<string, string> = {
  publish: 'bg-green-100 text-green-800 border-green-200',
  draft: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  pending: 'bg-orange-100 text-orange-800 border-orange-200',
  private: 'bg-purple-100 text-purple-800 border-purple-200',
  future: 'bg-blue-100 text-blue-800 border-blue-200',
  trash: 'bg-red-100 text-red-800 border-red-200'
}

interface PostListProps {
  siteId: string
}

export function PostList({ siteId }: PostListProps): JSX.Element {
  const { posts, loading } = usePosts(siteId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Posts</h2>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium mb-1">No posts yet</p>
          <p className="text-sm">Use the sync button in the toolbar to pull posts.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {posts.map((post) => (
            <div
              key={post.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-md border hover:bg-accent/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{post.title || '(Untitled)'}</p>
                <p className="text-xs text-muted-foreground">
                  {post.modified_remote
                    ? new Date(post.modified_remote).toLocaleString()
                    : new Date(post.modified_local).toLocaleString()}
                </p>
              </div>

              <Badge className={STATUS_COLORS[post.status] || ''} variant="outline">
                {post.status}
              </Badge>

              {post.conflict && (
                <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" title="Conflict" />
              )}
              {post.synced && !post.conflict && (
                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" title="Synced" />
              )}
              {!post.synced && !post.conflict && (
                <CloudUpload className="h-4 w-4 text-blue-500 flex-shrink-0" title="Not synced" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
