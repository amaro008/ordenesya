import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { interpretarOrdenConIA, getMimeType } from '@/lib/ai-provider'
import { resolverLineasOrden, detectarCliente, detectarUbicacion } from '@/lib/sku-matcher'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: usuario } = await supabase.from('oya_usuarios').select('id').eq('auth_id', session.user.id).single()
    if (!usuario) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    const formData = await request.formData()
    const archivo = formData.get('archivo') as File
    if (!archivo) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const mimeType = getMimeType(archivo.name)
    if (!mimeType) return NextResponse.json({ error: 'Formato no soportado' }, { status: 400 })

    const arrayBuffer = await archivo.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const fileName = `${usuario.id}/${Date.now()}-${archivo.name}`
    await supabase.storage.from(process.env.SUPABASE_STORAGE_BUCKET || 'ordenesya').upload(fileName, arrayBuffer, { contentType: mimeType })

    const { resultado: gemini, proveedor } = await interpretarOrdenConIA(base64, mimeType)
    console.log(`[Orden] ${proveedor} | cadena: ${gemini.cadena_detectada?.nombre} | comedor: ${gemini.comedor}`)

    const identificadores = [
      gemini.cadena_detectada?.nombre,
      gemini.cadena_detectada?.rfc,
      ...(gemini.cadena_detectada?.identificadores || []),
    ].filter(Boolean) as string[]

    const clienteId = await detectarCliente(identificadores)
    const ubicacion = await detectarUbicacion(clienteId, gemini.comedor)

    const { data: orden, error: ordenError } = await supabase
      .from('oya_ordenes')
      .insert({
        cliente_id: clienteId,
        ubicacion_id: ubicacion?.id || null,
        asesor_id: usuario.id,
        numero_oc: gemini.numero_oc,
        fecha_oc: gemini.fecha_oc,
        comedor_detectado: gemini.comedor,
        archivo_nombre: archivo.name,
        archivo_tipo: mimeType.includes('pdf') ? 'pdf' : 'imagen',
        estado: 'revisando',
        notas_gemini: JSON.stringify(gemini),
        total_lineas: gemini.lineas.length,
        subtotal_oc: gemini.subtotal || null,
        iva_oc: gemini.iva || null,
        total_oc: gemini.total || null,
      })
      .select().single()

    if (ordenError) throw ordenError

    const detalles = await resolverLineasOrden(gemini.lineas, clienteId)
    const lineasResueltas = detalles.filter(d => d.estado_linea === 'resuelto').length
    const lineasConflicto = detalles.filter(d => d.estado_linea === 'conflicto').length

    await supabase.from('oya_detalles_orden').insert(detalles.map(d => ({ ...d, orden_id: orden.id })))
    await supabase.from('oya_ordenes').update({ lineas_resueltas: lineasResueltas, lineas_conflicto: lineasConflicto }).eq('id', orden.id)

    return NextResponse.json({
      ordenId: orden.id,
      cadenaDetectada: clienteId !== null,
      ubicacionDetectada: ubicacion !== null,
      comedorDetectado: gemini.comedor,
      totalLineas: gemini.lineas.length,
      lineasResueltas,
      lineasConflicto,
    })
  } catch (error: any) {
    console.error('Error procesando orden:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
