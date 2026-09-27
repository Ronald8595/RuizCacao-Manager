import { ReporteMovimientos, type ReporteProps } from './ReporteDiario'
export default function ReporteMensual(props: ReporteProps): React.JSX.Element {
  return <ReporteMovimientos {...props} titulo="Reporte mensual" />
}
