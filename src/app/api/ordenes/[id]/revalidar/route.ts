// POST /api/ordenes/[id]/revalidar
// Re-corre el matching de SKUs con el cliente asignado

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { resolverSKU } from '@/lib/sku-matcher'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { clienteId } = await request.json()
    const ordenId = params.id

    // Obtener detalles en conflicto
    const { data: detalles } = await supabase
      .from('oya_detalles_orden')
      .select('*')
      .eq('orden_id', ordenId)
      .eq('estado_linea', 'conflicto')

    if (!detalles?.length) return NextResponse.json({ resueltosNuevos: 0 })

    let resueltosNuevos = 0

    for (const detalle of detalles) {
      if (!detalle.id_cliente_raw) continue
      const match = await resolverSKU(detalle.id_cliente_raw, detalle.notas_linea, clienteId)
      if (match.estado === 'resuelto') {
        await supabase.from('oya_detalles_orden').update({
          sku_interno: match.sku_interno,
          descripcion: match.descripcion,
          estado_linea: 'resuelto',
          metodo_resolucion: match.metodo,
        }).eq('id', detalle.id)
        resueltosNuevos++
      }
    }

    // Recalcular contadores en la orden
    const { data: todosDetalles } = await supabase
      .from('oya_detalles_orden')
      .select('estado_linea')
      .eq('orden_id', ordenId)

    const resueltos = todosDetalles?.filter((d) => d.estado_linea === 'resuelto').length || 0
    const conflictos = todosDetalles?.filter((d) => d.estado_linea === 'conflicto').length || 0

    await supabase.from('oya_ordenes').update({
      lineas_resueltas: resueltos,
      lineas_conflicto: conflictos,
    }).eq('id', ordenId)

    return NextResponse.json({ resueltosNuevos, resueltos, conflictos })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
