import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ShadeProvider } from './context/ShadeContext.jsx';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ShadeProvider>
      <App />
    </ShadeProvider>
  </React.StrictMode>
);
