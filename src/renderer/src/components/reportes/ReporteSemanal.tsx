import { ReporteMovimientos, type ReporteProps } from './ReporteDiario'
export default function ReporteSemanal(props: ReporteProps): React.JSX.Element {
  return <ReporteMovimientos {...props} titulo="Reporte semanal" />
}
