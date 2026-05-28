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

    const config: Record<string, string> = {
      // Defaults si la tabla está vacía
      ai_provider: 'claude',
      ai_model: 'claude-haiku-4-5',
    }
    data?.forEach(row => { config[row.clave] = row.valor })
    return NextResponse.json(config)
  } catch (err: any) {
    console.error('[Config GET]', err)
    return NextResponse.json({ ai_provider: 'claude', ai_model: 'claude-haiku-4-5' })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { clave, valor } = await request.json()
    if (!clave || !valor) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

    // Intentar UPDATE primero
    const { data: updated, error: updateError } = await supabase
      .from('oya_configuracion')
      .update({ valor, updated_at: new Date().toISOString() })
      .eq('clave', clave)
      .select()

    if (updateError) {
      console.error('[Config UPDATE]', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Si no actualizó ninguna fila, hacer INSERT
    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase
        .from('oya_configuracion')
        .insert({ clave, valor, updated_at: new Date().toISOString() })

      if (insertError) {
        console.error('[Config INSERT]', insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    console.log(`[Config] ${clave} = ${valor}`)
    return NextResponse.json({ ok: true, clave, valor })
  } catch (err: any) {
    console.error('[Config POST]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
