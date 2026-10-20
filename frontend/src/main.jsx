import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// A reload starts at the top of the page instead of restoring the previous scroll position.
try {
  if (performance.getEntriesByType('navigation')[0]?.type === 'reload') sessionStorage.removeItem('react-router-scroll-positions');
} catch { /* storage unavailable: nothing to clear */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
