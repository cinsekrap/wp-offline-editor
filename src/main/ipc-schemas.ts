import { z } from 'zod'

export const uuidSchema = z.string().uuid()

const postStatusSchema = z.enum(['draft', 'publish', 'pending', 'private', 'future', 'trash'])

export const SiteInputSchema = z.object({
  url: z.string().url(),
  username: z.string().min(1),
  password: z.string().min(1),
  label: z.string().optional(),
  auto_sync: z.boolean().optional(),
  pull_published: z.number().int().positive().optional(),
  media_library_limit: z.number().int().positive().optional()
})

export const SiteUpdateSchema = z.object({
  id: uuidSchema,
  label: z.string().optional(),
  url: z.string().url().optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  auto_sync: z.boolean().optional(),
  pull_published: z.number().int().positive().optional(),
  media_library_limit: z.number().int().positive().optional(),
  wp_author_id: z.number().int().nullable().optional()
})

export const PostInputSchema = z.object({
  site_id: uuidSchema,
  title: z.string().optional(),
  content: z.string().optional(),
  status: postStatusSchema.optional(),
  acf: z.unknown().optional(),
  excerpt: z.string().optional(),
  slug: z.string().optional()
})

export const PostUpdateSchema = z.object({
  id: uuidSchema,
  title: z.string().optional(),
  content: z.string().optional(),
  status: postStatusSchema.optional(),
  acf: z.unknown().optional(),
  date: z.string().nullable().optional(),
  featured_image: z.string().nullable().optional(),
  excerpt: z.string().optional(),
  slug: z.string().optional(),
  categories: z.array(z.number().int()).optional(),
  tags: z.array(z.number().int()).optional()
})

export const ConflictStrategySchema = z.enum(['keep-mine', 'keep-theirs', 'fork'])

export const TaxonomySchema = z.enum(['category', 'post_tag'])

export const TemplateInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  title_template: z.string().optional(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  status: z.enum(['draft', 'publish', 'pending', 'private', 'future']).optional(),
  category_names: z.array(z.string()).optional(),
  tag_names: z.array(z.string()).optional()
})

export const TemplateUpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  title_template: z.string().optional(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
  status: z.enum(['draft', 'publish', 'pending', 'private', 'future']).optional(),
  category_names: z.array(z.string()).optional(),
  tag_names: z.array(z.string()).optional()
})

export const AppSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  editorFontSize: z.number().int().min(8).max(32).optional(),
  forceOffline: z.boolean().optional(),
  autoSyncInterval: z.number().int().min(0).optional()
})
