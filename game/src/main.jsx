import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// No StrictMode: the WebGL globe binds canvas event listeners in its
// constructor and a double effect-run would bind them twice.
createRoot(document.getElementById('root')).render(<App />)
