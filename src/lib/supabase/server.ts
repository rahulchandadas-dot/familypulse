/**
 * Supabase Server Client
 * Used in Server Components, Server Actions, and API Routes.
 * Uses the service role key for elevated privileges (bypasses RLS).
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL')
}

if (!supabaseServiceRoleKey) {
  throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY')
}

/**
 * Supabase admin client for server-side operations.
 * Uses the service role key — bypasses Row Level Security.
 * NEVER expose this client to the browser.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

/**
 * Creates a standard Supabase client suitable for server-side use.
 * Uses the anon key (respects RLS) for cases where you don't need elevated access.
 */
export function createServerSupabaseClient() {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) {
    throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createClient(supabaseUrl!, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export default supabaseAdmin
