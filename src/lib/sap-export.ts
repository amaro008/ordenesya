// ============================================================
// ORDENESYA — Export a SAP (VA01 / Transacción Z)
// ============================================================
// Formato de salida: 2 columnas separadas por Tab
// SKU_INTERNO [TAB] CANTIDAD
// Máximo 52 líneas
// ============================================================

import type { DetalleOrden } from '@/types'
import * as XLSX from 'xlsx'

const MAX_LINEAS_SAP = 52

// Generar texto para copiar al portapapeles
export function generarClipboardSAP(detalles: DetalleOrden[]): string {
  const lineasResueltas = detalles
    .filter((d) => d.estado_linea === 'resuelto' && d.sku_interno)
    .slice(0, MAX_LINEAS_SAP)
    .sort((a, b) => a.linea_num - b.linea_num)

  return lineasResueltas
    .map((d) => `${d.sku_interno}\t${formatearCantidad(d.cantidad)}`)
    .join('\n')
}

// Generar Excel descargable
export function generarExcelSAP(
  detalles: DetalleOrden[],
  nombreCliente: string,
  numeroOC: string | null
): Blob {
  const lineasResueltas = detalles
    .filter((d) => d.estado_linea === 'resuelto' && d.sku_interno)
    .slice(0, MAX_LINEAS_SAP)
    .sort((a, b) => a.linea_num - b.linea_num)

  const rows = lineasResueltas.map((d) => ({
    'Material SKU': d.sku_interno,
    'Descripción': d.descripcion || '',
    'Cantidad': formatearCantidad(d.cantidad),
    'UM': d.unidad_medida || '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)

  // Ancho de columnas
  ws['!cols'] = [
    { wch: 20 }, // SKU
    { wch: 50 }, // Descripción
    { wch: 12 }, // Cantidad
    { wch: 8 },  // UM
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pedido SAP')

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// Formatear cantidad para SAP (3 decimales, sin separador de miles)
function formatearCantidad(cantidad: number): string {
  return cantidad.toFixed(3)
}

// Resumen de la orden para validación del asesor
export interface ResumenOrden {
  totalLineas: number
  lineasResueltas: number
  lineasConflicto: number
  lineasParaSAP: number
  puedeExportar: boolean
}

export function calcularResumen(detalles: DetalleOrden[]): ResumenOrden {
  const resueltas = detalles.filter((d) => d.estado_linea === 'resuelto').length
  const conflicto = detalles.filter((d) => d.estado_linea === 'conflicto').length

  return {
    totalLineas: detalles.length,
    lineasResueltas: resueltas,
    lineasConflicto: conflicto,
    lineasParaSAP: Math.min(resueltas, MAX_LINEAS_SAP),
    puedeExportar: conflicto === 0 && resueltas > 0,
  }
}
