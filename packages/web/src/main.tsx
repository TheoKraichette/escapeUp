import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Police display (woff2 variable versionnée via npm — zéro asset binaire dans
// le dépôt). Usage ciblé : titres, chips, stats (voir --font-display).
import '@fontsource-variable/space-grotesk';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Élément #root introuvable dans index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
