// ============================================================
// ORDENESYA — Supabase client para SERVER COMPONENTS y API ROUTES
// ============================================================
// IMPORTANTE: Este archivo usa next/headers — solo importar en:
//   - Server Components (page.tsx sin 'use client')
//   - Route Handlers (app/api/**/route.ts)
//   - middleware.ts
//
// Para Client Components usa: @/lib/supabase-browser
// ============================================================

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )
}
