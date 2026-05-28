// ============================================================
// ORDENESYA — Export a SAP (VA01)
// Usa cantidad_sigma si hay conversión, sino cantidad original
// ============================================================
import type { DetalleOrden } from '@/types'
import * as XLSX from 'xlsx'

const MAX_LINEAS_SAP = 52

function cantidadParaSAP(d: DetalleOrden): number {
  return d.cantidad_sigma ?? d.cantidad
}

function formatearCantidad(n: number): string { return n.toFixed(3) }

export function generarClipboardSAP(detalles: DetalleOrden[], numeroOC: string | null): string {
  const lineas = detalles
    .filter(d => d.estado_linea === 'resuelto' && d.sku_interno)
    .slice(0, MAX_LINEAS_SAP)
    .sort((a, b) => a.linea_num - b.linea_num)
  const ref = numeroOC ? `Ref: ${numeroOC}` : ''
  return lineas.map(d => `${d.sku_interno}\t${formatearCantidad(cantidadParaSAP(d))}\t${ref}`).join('\n')
}

export function generarExcelSAP(detalles: DetalleOrden[], nombreCliente: string, numeroOC: string | null): Blob {
  const lineas = detalles
    .filter(d => d.estado_linea === 'resuelto' && d.sku_interno)
    .slice(0, MAX_LINEAS_SAP)
    .sort((a, b) => a.linea_num - b.linea_num)
  const ref = numeroOC ? `Ref: ${numeroOC}` : ''
  const rows = lineas.map(d => ({
    'Material SKU':     d.sku_interno,
    'Descripción':      d.descripcion || '',
    'Cant. Cliente':    formatearCantidad(d.cantidad),
    'UM Cliente':       d.um_cliente || d.unidad_medida || '',
    'Cant. SAP':        formatearCantidad(cantidadParaSAP(d)),
    'UM SAP':           d.um_sigma || d.unidad_medida || '',
    'Texto Suministro': ref,
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 18 }, { wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 20 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pedido SAP')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

export interface ResumenOrden {
  totalLineas: number; lineasResueltas: number; lineasConflicto: number; lineasParaSAP: number; puedeExportar: boolean
}

export function calcularResumen(detalles: DetalleOrden[]): ResumenOrden {
  const resueltas = detalles.filter(d => d.estado_linea === 'resuelto').length
  const conflicto = detalles.filter(d => d.estado_linea === 'conflicto').length
  return { totalLineas: detalles.length, lineasResueltas: resueltas, lineasConflicto: conflicto, lineasParaSAP: Math.min(resueltas, MAX_LINEAS_SAP), puedeExportar: conflicto === 0 && resueltas > 0 }
}
