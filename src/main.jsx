import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { CartProvider } from './cart';
import { CatalogProvider } from './store';
import { AuthProvider } from './auth';
import './styles.css';

document.documentElement.classList.add('js');

// non-blocking font CSS: system sans shows first, Jost swaps in
const fonts = document.createElement('link');
fonts.rel = 'stylesheet';
fonts.href = 'https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&family=Noto+Sans+Devanagari:wght@700&display=swap';
document.head.appendChild(fonts);
createRoot(document.getElementById('root')).render(
  <StrictMode><BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><CatalogProvider><AuthProvider><CartProvider><App /></CartProvider></AuthProvider></CatalogProvider></BrowserRouter></StrictMode>,
);
