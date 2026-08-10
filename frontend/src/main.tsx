import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ─── Apply persisted theme & accent before first paint ───────────────────────
const savedTheme = localStorage.getItem('pcai-theme') || 'dark';
const root = document.documentElement;
if (savedTheme === 'light') {
  root.classList.add('light');
  root.classList.remove('dark');
} else if (savedTheme === 'system') {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.classList.toggle('dark', prefersDark);
  root.classList.toggle('light', !prefersDark);
} else {
  root.classList.add('dark');
}

const accentMap: Record<string, string> = {
  blue:    '217 91% 60%',
  purple:  '271 81% 56%',
  emerald: '158 64% 52%',
  rose:    '347 77% 50%',
  amber:   '38 92% 50%',
  cyan:    '189 94% 43%',
};
const savedAccent = localStorage.getItem('pcai-accent') || 'blue';
root.style.setProperty('--primary', accentMap[savedAccent] || accentMap.blue);
// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
