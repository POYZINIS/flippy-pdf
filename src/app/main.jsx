import React from 'react';
import { createRoot } from 'react-dom/client';
import 'neumorui/styles';
import '@jungherz-de/glasskit/glasskit.css';
import './styles.css';
import { App } from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
