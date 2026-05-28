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
  "ejemplo_skus": ["códigos tal como aparecen en la columna de claves"],
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
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-pro' })

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

    const skusRaw: { id: string; desc: string | null }[] = (parsed.ejemplo_skus || [])
      .map((sku: string) => ({ id: sku, desc: null }))

    // También extraer de lineas si el JSON las trae
    // (el prompt devuelve ejemplo_skus, no lineas completas)

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

        // Sin match — buscar sugerencias por descripción si hay
        let sugerencias: string[] = []
        if (desc) {
          const palabras = desc.split(' ').filter(p => p.length > 3).slice(0, 3).join(' | ')
          if (palabras) {
            const { data: similares } = await supabase
              .from('oya_skus').select('sku, descripcion')
              .ilike('descripcion', `%${palabras.split(' | ')[0]}%`)
              .eq('activo', true).limit(3)
            sugerencias = (similares || []).map(s => s.sku)
          }
        }

        return {
          id_cliente: id,
          descripcion_cliente: desc,
          sku_interno: sugerencias[0] || null,
          sugerencias,
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
      ejemplo_skus:    parsed.ejemplo_skus || [],
      equivalencias,
      ocs_procesadas:  parsed.ocs_procesadas || archivos.map(() => ({ numero_oc: null })),
    })

  } catch (error: any) {
    console.error('Error analizando cadena:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
