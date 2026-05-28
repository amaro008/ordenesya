import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data, error } = await supabase
      .from('oya_configuracion')
      .select('clave, valor')

    if (error) throw error

    const config: Record<string, string> = {}
    data?.forEach(row => { config[row.clave] = row.valor })
    return NextResponse.json(config)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { clave, valor } = await request.json()
    if (!clave || !valor) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    const { error } = await supabase
      .from('oya_configuracion')
      .upsert(
        { clave, valor, updated_at: new Date().toISOString() },
        { onConflict: 'clave' }
      )

    if (error) {
      console.error('Error guardando config:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, clave, valor })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
