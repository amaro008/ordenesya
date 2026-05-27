import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Nuevo cliente' }
import NuevoClienteForm from './NuevoClienteForm'
export default function PaginaNuevoCliente() { return <NuevoClienteForm /> }
