// POST /api/clientes/analizar-cadena
// Recibe 3 OCs en base64 y devuelve análisis consolidado de la cadena

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `Eres un experto en analizar órdenes de compra de proveedores de alimentos en México.
Se te proporcionan TRES órdenes de compra de la MISMA cadena. Analízalas juntas y devuelve SOLO un JSON sin markdown.

ESTRUCTURA:
{
  "nombre_cadena": "nombre de la empresa/cadena emisora (membrete del documento)",
  "razon_social": "razón social completa del emisor o null",
  "rfc_emisor": "RFC del emisor que aparece consistentemente en las 3 OCs o null",
  "centro": "centro SAP si aparece o null",
  "almacen": "almacén SAP si aparece o null",
  "identificadores": [
    { "tipo": "rfc_emisor", "valor": "RFC exacto" },
    { "tipo": "nombre_cadena", "valor": "nombre exacto como aparece en el membrete" }
  ],
  "comedores": ["lista de comedores/ubicaciones distintas detectados en las 3 OCs"],
  "formato_skus": "descripción en español del patrón de los códigos de producto. Ej: 'Códigos numéricos con prefijo SIG (SIG8912) o sufijo SIG (8666SIG). También aparecen solo números (66, 307). Algunos tienen sufijo RY (8964RY)'",
  "ejemplo_skus": ["lista de los 8-10 códigos de producto más representativos encontrados en las 3 OCs"],
  "ocs_procesadas": [
    { "numero_oc": "MPO 367213 o null" },
    { "numero_oc": "..." },
    { "numero_oc": "..." }
  ]
}

REGLAS CRÍTICAS:
1. EMISOR/CADENA = quien aparece en el membrete (Arte Di Piatto, Aramark, Favorite Vegan Food, Kitcheny)
2. PROVEEDOR = SIGMA FOODSERVICE — NO incluir como cadena
3. COMEDOR = campo COMEDOR del documento (Borgwarner, Navistar, etc.) — van en "comedores"
4. Para "identificadores": incluye solo los que aparecen en las 3 OCs consistentemente
5. Para "formato_skus": describe el patrón real que ves, útil para el asesor que va a capturar pedidos
6. Para "ejemplo_skus": toma los códigos de la columna CLAVE ARTICULO/CLAVE ARTICULOD/Cód. — exactamente como aparecen`

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

    // Asegurar estructura mínima
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
      ocs_procesadas:  parsed.ocs_procesadas || archivos.map(() => ({ numero_oc: null })),
    })

  } catch (error: any) {
    console.error('Error analizando cadena:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
