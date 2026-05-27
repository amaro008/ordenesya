// ============================================================
// ORDENESYA — Supabase client para CLIENT COMPONENTS
// ============================================================
// Usar en archivos con 'use client' en lugar de @/lib/supabase
// ============================================================

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
