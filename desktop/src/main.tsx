import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import WidgetPage from './pages/WidgetPage';
import CapturePage from './pages/CapturePage';
import PetPage from './pages/PetPage';
import './index.css';

const hash = window.location.hash;
const isWidget = hash.startsWith('#/widget');
const isCapture = hash.startsWith('#/capture');
const isPet = hash.startsWith('#/pet');
if (isWidget || isCapture || isPet) {
  document.documentElement.classList.add('widget-mode');
  document.body.classList.add('widget-mode');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isWidget ? <WidgetPage /> : isCapture ? <CapturePage /> : isPet ? <PetPage /> : <App />}
  </React.StrictMode>,
);
