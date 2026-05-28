// POST /api/clientes/analizar-cadena
// Recibe 3 OCs en base64 y devuelve análisis consolidado de la cadena

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `Eres un experto en analizar órdenes de compra de proveedores de alimentos en México.
Se te proporcionan TRES órdenes de compra de la MISMA cadena. Analízalas juntas y devuelve SOLO un JSON sin markdown.

ESTRUCTURA:
{
  "nombre_cadena": "nombre de la empresa/cadena que COMPRA y emite la OC — la que aparece en el MEMBRETE o LOGO del documento",
  "razon_social": "razón social completa del comprador o null",
  "rfc_emisor": "RFC del comprador/emisor que aparece consistentemente en las 3 OCs o null",
  "centro": "centro SAP si aparece o null",
  "almacen": "almacén SAP si aparece o null",
  "identificadores": [
    { "tipo": "rfc_emisor", "valor": "RFC exacto del comprador" },
    { "tipo": "nombre_cadena", "valor": "nombre exacto de la cadena como aparece en el membrete" },
    { "tipo": "otro", "valor": "dominio de correo del comprador si aparece, ej: platoexpress.com" }
  ],
  "comedores": ["lista de comedores/ubicaciones distintas detectados en las 3 OCs"],
  "formato_skus": "descripción en español del patrón de los códigos de producto. Ej: 'Códigos numéricos con prefijo SIG (SIG8912) o sufijo SIG (8666SIG). También aparecen solo números (66, 307). Algunos tienen sufijo RY (8964RY)'",
  "ejemplo_skus": ["lista de los 8-10 códigos de producto más representativos encontrados — TAL COMO APARECEN en la columna de claves, incluyendo letras SIG, RY, etc."],
  "ocs_procesadas": [
    { "numero_oc": "MPO 367213 o null" },
    { "numero_oc": "..." },
    { "numero_oc": "..." }
  ]
}

== REGLA MÁS IMPORTANTE: QUIÉN ES QUIÉN ==

Estos documentos tienen DOS empresas. Debes identificarlas correctamente:

EMPRESA A — EL COMPRADOR (quien emite la OC, quien tú debes identificar como cadena):
- Aparece en el MEMBRETE o LOGO del documento en la parte superior
- Ejemplos: Arte Di Piatto, Favorite Vegan Food / Kitcheny, Aramark
- Tiene su propio RFC en el membrete: ADP021022MM0, FVF1607088M2, AME950116SJ1
- Los correos de los compradores terminan en @platoexpress.com o similar
- El campo "PROVEEDOR" en el cuerpo del documento dice a quién va dirigida — ESE es el vendedor

EMPRESA B — EL VENDEDOR/PROVEEDOR (a quien se le envía la OC):
- Aparece en el campo "PROVEEDOR" del cuerpo del documento
- Es SIGMA FOODSERVICE COMERCIAL S DE R.L DE C.V
- Su RFC es CNO930113K12
- NUNCA debe aparecer como nombre_cadena — es el receptor de la OC, no el emisor

== IDENTIFICADORES — incluir TODOS los que aparezcan ==
Incluye en el array "identificadores" TODOS los siguientes que encuentres:
- RFC del membrete (tipo: rfc_emisor)
- Nombre exacto del membrete (tipo: nombre_cadena)
- Dominio de correo de los compradores (tipo: otro) — ej: "platoexpress.com"
- Nombre de la plataforma si aparece (tipo: otro)

== EJEMPLO CORRECTO para OCs de Arte Di Piatto ==
nombre_cadena: "Arte Di Piatto"  (NO "SIGMA FOODSERVICE")
rfc_emisor: "ADP021022MM0"       (el RFC del membrete, NO CNO930113K12)
identificadores: [
  { tipo: "rfc_emisor", valor: "ADP021022MM0" },
  { tipo: "nombre_cadena", valor: "Arte Di Piatto" },
  { tipo: "otro", valor: "platoexpress.com" }
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
