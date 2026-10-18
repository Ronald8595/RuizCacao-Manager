import '../src/renderer/src/assets/main.css'
import { createRoot } from 'react-dom/client'
import Acceso from '../src/renderer/src/components/Acceso'
createRoot(document.getElementById('root')!).render(<Acceso>{() => <p>Sesión iniciada</p>}</Acceso>)
