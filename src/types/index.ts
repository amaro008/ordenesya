export type EstadoOrden = 'borrador' | 'revisando' | 'confirmado' | 'exportado'
export type EstadoLinea = 'resuelto' | 'conflicto' | 'pendiente'
export type MetodoResolucion = 'exacto' | 'sufijo' | 'equivalencia' | 'manual'
export type TipoArchivo = 'pdf' | 'imagen' | 'excel' | 'email'
export type TipoIdentifier = 'nombre_negocio' | 'id_ubicacion' | 'centro_costos' | 'rfc' | 'otro'

export interface Usuario {
  id: string
  auth_id: string
  nombre: string
  email: string
  activo: boolean
  created_at: string
  updated_at: string
}

export interface SKU {
  id: string
  sku: string
  descripcion: string
  familia: string | null
  sublinea: string | null
  linea_ventas: string | null
  marca: string | null
  activo: boolean
}

export interface Cliente {
  id: string
  nombre: string
  razon_social: string | null
  id_sap: string | null          // ID único en SAP — obligatorio
  cadena: string | null          // Agrupador: ARAMARK, SODEXO, etc.
  centro: string | null
  almacen: string | null
  notas: string | null
  activo: boolean
  created_at: string
  identifiers?: ClienteIdentifier[]
  equivalencias?: Equivalencia[]
}

export interface ClienteIdentifier {
  id: string
  cliente_id: string
  tipo: TipoIdentifier
  valor: string
  created_at: string
}

export interface Equivalencia {
  id: string
  cliente_id: string
  id_cliente: string
  sku_interno: string
  descripcion_cliente: string | null
  creado_por: string | null
  created_at: string
  sku?: SKU
}

export interface Orden {
  id: string
  cliente_id: string | null
  asesor_id: string
  numero_oc: string | null
  fecha_oc: string | null
  archivo_nombre: string | null
  archivo_tipo: TipoArchivo | null
  archivo_url: string | null
  estado: EstadoOrden
  total_lineas: number
  lineas_resueltas: number
  lineas_conflicto: number
  // Totales de la OC original
  subtotal_oc: number | null
  iva_oc: number | null
  total_oc: number | null
  created_at: string
  updated_at: string
  cliente?: Cliente
  detalles?: DetalleOrden[]
}

export interface DetalleOrden {
  id: string
  orden_id: string
  linea_num: number
  id_cliente_raw: string | null
  sku_interno: string | null
  descripcion: string | null
  cantidad: number
  precio_unitario: number | null
  importe: number | null
  unidad_medida: string | null
  estado_linea: EstadoLinea
  metodo_resolucion: MetodoResolucion | null
  notas_linea: string | null
  sku?: SKU
}

export interface GeminiOrdenResponse {
  cliente_detectado: {
    nombre: string | null
    identificadores: string[]
  }
  numero_oc: string | null
  fecha_oc: string | null
  subtotal: number | null
  iva: number | null
  total: number | null
  lineas: GeminiLinea[]
  notas: string | null
}

export interface GeminiLinea {
  linea_num: number
  id_producto_cliente: string
  descripcion_cliente: string | null
  cantidad: number
  precio_unitario: number | null
  importe: number | null
  unidad_medida: string | null
}

export interface OrdenRevisorState {
  orden: Orden | null
  detalles: DetalleOrden[]
  clienteSeleccionado: Cliente | null
  hayConflictos: boolean
  totalLineas: number
  lineasResueltas: number
}
