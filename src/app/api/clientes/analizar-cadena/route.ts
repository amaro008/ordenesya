// POST /api/clientes/analizar-cadena
// Recibe 3 OCs en base64 y devuelve análisis consolidado de la cadena

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `Eres un experto en analizar órdenes de compra de proveedores de alimentos en México.
Se te proporcionan TRES órdenes de compra de la MISMA cadena. Analízalas juntas y devuelve SOLO un JSON sin markdown.

ESTRUCTURA:
{
  "nombre_cadena": "ver regla abajo",
  "razon_social": "ver regla abajo",
  "rfc_emisor": "RFC del membrete/logo del documento",
  "centro": null,
  "almacen": null,
  "identificadores": ["ver regla abajo"],
  "comedores": ["lista de valores del campo COMEDOR en cada OC"],
  "formato_skus": "descripción del patrón de códigos de producto",
  "skus_detectados": [
    { "codigo": "código exacto de la OC", "descripcion": "descripción del producto como aparece en la OC" }
  ],
  "ocs_procesadas": [{"numero_oc": "..."}]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA PRINCIPAL: CÓMO IDENTIFICAR LA CADENA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

En estos documentos hay DOS bloques de texto con nombres de empresas:

BLOQUE 1 — El MEMBRETE (esquina superior, con logo):
→ Contiene el nombre de la cadena que COMPRA
→ Este nombre va en "nombre_cadena"
→ Ejemplos que has visto: "ARTE DI PIATTO", "FAVORITE VEGAN FOOD", "Kitcheny"
→ El RFC de este bloque va en "rfc_emisor"

BLOQUE 2 — El campo "PROVEEDOR" (en el cuerpo del documento):
→ Contiene el nombre del que VENDE: "SIGMA FOODSERVICE COMERCIAL S DE R.L DE C.V"
→ ESTE NOMBRE NUNCA VA EN "nombre_cadena" NI EN "razon_social"
→ Ignorar completamente para nombre y razón social

VALIDACIÓN: Si "nombre_cadena" contiene "SIGMA" o "FOODSERVICE" → está INCORRECTO, busca el membrete.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA IDENTIFICADORES — EXTRAER MÁXIMO POSIBLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Extrae TODOS los valores que aparezcan en las 3 OCs y que identifiquen al comprador:

1. RFC del membrete → tipo: "rfc_emisor"
2. Nombre exacto del membrete → tipo: "nombre_cadena"  
3. Dominio de correo de los compradores (ej: "platoexpress.com") → tipo: "otro"
4. Nombre de la plataforma/sistema si aparece (ej: "platoexpress", "Plato Express") → tipo: "otro"
5. Número de solicitud web si hay un prefijo constante → tipo: "otro"

IMPORTANTE: Los correos personales (berenice@..., fatima@...) NO son identificadores de cadena.
SÍ es identificador el DOMINIO común de esos correos (platoexpress.com).

Para "skus_detectados": extrae TODOS los productos únicos de las 3 OCs.
- "codigo": el código EXACTO de la columna CLAVE ARTICULO/CLAVE ARTICULOD/Cód. (ej: SIG8912, 8666SIG, 66, 307)
- "descripcion": descripción del producto TAL COMO APARECE en la OC (ej: "CREMA NORTEÑITA 1 LITRO", "JAMON COCIDO REBANADO")
- Incluye mínimo 8 productos, máximo 20, sin repetidos

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EJEMPLO CORRECTO para OCs de Arte Di Piatto
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nombre_cadena: "Arte Di Piatto"
razon_social: "Arte Di Piatto" (o razón social si aparece explícitamente)
rfc_emisor: "ADP021022MM0"
identificadores: [
  { "tipo": "rfc_emisor",    "valor": "ADP021022MM0" },
  { "tipo": "nombre_cadena", "valor": "Arte Di Piatto" },
  { "tipo": "otro",          "valor": "platoexpress.com" },
  { "tipo": "otro",          "valor": "Plato Express" }
]`

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { archivos } = await request.json() as {
      archivos: { nombre: string; base64: string; mimeType: string }[]
    }

    if (!archivos || archivos.length !== 3) {
      return NextResponse.json({ error: 'Se requieren exactamente 3 archivos' }, { status: 400 })
    }

    let responseText = ''

    if (process.env.ANTHROPIC_API_KEY && process.env.AI_PROVIDER !== 'gemini') {
      // ── Claude ──────────────────────────────────────────────
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      const contentBlocks: any[] = archivos.map(a => {
        const isPdf = a.mimeType === 'application/pdf'
        return isPdf
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 } }
          : { type: 'image', source: { type: 'base64', media_type: a.mimeType, data: a.base64 } }
      })

      contentBlocks.push({
        type: 'text',
        text: `Analiza estas ${archivos.length} órdenes de compra de la misma cadena y genera el JSON de configuración:\n\n${PROMPT}`,
      })

      const message = await client.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: contentBlocks }],
      })

      const block = message.content.find(b => b.type === 'text')
      responseText = block && block.type === 'text' ? block.text : ''

    } else if (process.env.GEMINI_API_KEY) {
      // ── Gemini ───────────────────────────────────────────────
      const { GoogleGenerativeAI } = await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' })

      const parts: any[] = archivos.map(a => ({
        inlineData: { mimeType: a.mimeType, data: a.base64 },
      }))
      parts.push({ text: `Analiza estas ${archivos.length} órdenes de compra y genera el JSON:\n\n${PROMPT}` })

      const result = await model.generateContent(parts)
      responseText = result.response.text()
    } else {
      return NextResponse.json({ error: 'No hay proveedor de IA configurado' }, { status: 500 })
    }

    const clean = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)

    // Resolver equivalencias de SKUs contra el catálogo
    const { generarCandidatos } = await import('@/lib/sku-matcher')
    const { generarQuerysPorDescripcion, normalizar } = await import('@/lib/search')

    // Usar skus_detectados (nuevo formato) o ejemplo_skus (fallback)
    const skusRaw: { id: string; desc: string | null }[] = parsed.skus_detectados
      ? (parsed.skus_detectados as any[]).map((s: any) => ({
          id: typeof s === 'string' ? s : (s.codigo || s),
          desc: typeof s === 'string' ? null : (s.descripcion || null),
        }))
      : (parsed.ejemplo_skus || []).map((sku: string) => ({ id: sku, desc: null }))

    const equivalencias = await Promise.all(
      skusRaw.map(async ({ id, desc }) => {
        const candidatos = generarCandidatos(id.toUpperCase())

        // Buscar match exacto o por strip
        for (const c of candidatos) {
          const { data } = await supabase
            .from('oya_skus').select('sku, descripcion')
            .eq('sku', c).eq('activo', true).single()
          if (data) {
            return { id_cliente: id, descripcion_cliente: desc, sku_interno: data.sku, sugerencias: [], estado: 'resuelto' }
          }
        }

        // Sin match — búsqueda semántica por descripción
        let sugerencias: { sku: string; descripcion: string }[] = []
        if (desc) {
          const queries = generarQuerysPorDescripcion(desc)
          const encontrados = new Map<string, { sku: string; descripcion: string }>()

          for (const q of queries) {
            if (encontrados.size >= 5) break
            const { data: similares } = await supabase
              .from('oya_skus').select('sku, descripcion')
              .ilike('descripcion', `%${q}%`)
              .eq('activo', true).limit(5)
            similares?.forEach(s => {
              if (!encontrados.has(s.sku)) {
                encontrados.set(s.sku, s as { sku: string; descripcion: string })
              }
            })
          }
          sugerencias = Array.from(encontrados.values()).slice(0, 5)
        }

        return {
          id_cliente: id,
          descripcion_cliente: desc,
          sku_interno: null,  // no pre-seleccionar, dejar que el usuario elija
          sugerencias: sugerencias.map(s => ({ sku: s.sku, descripcion: s.descripcion })),
          estado: sugerencias.length > 0 ? 'sugerido' : 'pendiente',
        }
      })
    )

    return NextResponse.json({
      nombre_cadena:   parsed.nombre_cadena || null,
      razon_social:    parsed.razon_social || null,
      rfc_emisor:      parsed.rfc_emisor || null,
      centro:          parsed.centro || null,
      almacen:         parsed.almacen || null,
      identificadores: (parsed.identificadores || []).filter((id: any) => id.valor?.trim()),
      comedores:       parsed.comedores || [],
      formato_skus:    parsed.formato_skus || null,
      ejemplo_skus:    skusRaw.map(s => s.id),
      equivalencias,
      ocs_procesadas:  parsed.ocs_procesadas || archivos.map(() => ({ numero_oc: null })),
    })

  } catch (error: any) {
    console.error('Error analizando cadena:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
