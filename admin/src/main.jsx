import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { ToastProvider } from './lib/ui';
import './styles.css';

// non-blocking font CSS, same as the storefront
const fonts = document.createElement('link');
fonts.rel = 'stylesheet';
fonts.href = 'https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&family=Noto+Sans+Devanagari:wght@700&display=swap';
document.head.appendChild(fonts);

createRoot(document.getElementById('root')).render(
  <StrictMode><BrowserRouter><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></BrowserRouter></StrictMode>,
);
