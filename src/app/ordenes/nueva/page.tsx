import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Nueva orden' }
import NuevaOrdenForm from './NuevaOrdenForm'
export default function PaginaNuevaOrden() { return <NuevaOrdenForm /> }
