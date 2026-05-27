import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { interpretarOrdenConIA, getMimeType } from '@/lib/ai-provider'
import { resolverLineasOrden, detectarCliente } from '@/lib/sku-matcher'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data: usuario } = await supabase
      .from('oya_usuarios').select('id').eq('auth_id', session.user.id).single()
    if (!usuario) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    const formData = await request.formData()
    const archivo = formData.get('archivo') as File
    if (!archivo) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const mimeType = getMimeType(archivo.name)
    if (!mimeType) return NextResponse.json({ error: 'Tipo de archivo no soportado. Usa PDF, imagen (JPG/PNG).' }, { status: 400 })

    const arrayBuffer = await archivo.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Subir a Storage
    const fileName = `${usuario.id}/${Date.now()}-${archivo.name}`
    const { data: storageData } = await supabase.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET || 'ordenesya')
      .upload(fileName, arrayBuffer, { contentType: mimeType })

    // Interpretar con IA (Gemini o Claude según config)
    const { resultado: geminiResponse, proveedor } = await interpretarOrdenConIA(base64, mimeType)
    console.log(`[Orden] Procesada con ${proveedor}`)

    // Detectar cliente
    const identificadores = [
      geminiResponse.cliente_detectado.nombre,
      ...geminiResponse.cliente_detectado.identificadores,
    ].filter(Boolean) as string[]
    const clienteId = await detectarCliente(identificadores)

    // Crear orden
    const { data: orden, error: ordenError } = await supabase
      .from('oya_ordenes')
      .insert({
        cliente_id: clienteId,
        asesor_id: usuario.id,
        numero_oc: geminiResponse.numero_oc,
        fecha_oc: geminiResponse.fecha_oc,
        archivo_nombre: archivo.name,
        archivo_tipo: mimeType.includes('pdf') ? 'pdf' : 'imagen',
        archivo_url: storageData?.path || null,
        estado: 'revisando',
        notas_gemini: JSON.stringify(geminiResponse),
        total_lineas: geminiResponse.lineas.length,
      })
      .select().single()

    if (ordenError) throw ordenError

    // Resolver SKUs
    const detalles = await resolverLineasOrden(geminiResponse.lineas, clienteId)
    const lineasResueltas = detalles.filter((d) => d.estado_linea === 'resuelto').length
    const lineasConflicto = detalles.filter((d) => d.estado_linea === 'conflicto').length

    await supabase.from('oya_detalles_orden').insert(
      detalles.map((d) => ({ ...d, orden_id: orden.id }))
    )
    await supabase.from('oya_ordenes').update({ lineas_resueltas: lineasResueltas, lineas_conflicto: lineasConflicto }).eq('id', orden.id)

    return NextResponse.json({ ordenId: orden.id, clienteDetectado: clienteId !== null, totalLineas: geminiResponse.lineas.length, lineasResueltas, lineasConflicto })
  } catch (error: any) {
    console.error('Error procesando orden:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
