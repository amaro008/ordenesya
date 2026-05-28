// GET  /api/configuracion  → devuelve config actual
// POST /api/configuracion  → actualiza una clave

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data } = await supabase
    .from('oya_configuracion')
    .select('clave, valor')

  const config: Record<string, string> = {}
  data?.forEach(row => { config[row.clave] = row.valor })
  return NextResponse.json(config)
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { clave, valor } = await request.json()
  if (!clave || !valor) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const { error } = await supabase
    .from('oya_configuracion')
    .upsert({ clave, valor, updated_at: new Date().toISOString() })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
