import './lib/browserCompatibility.ts';
import './features/portalIntake/usePendingNavigation33';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
