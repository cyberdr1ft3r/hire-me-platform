import React from 'react';
import ReactDOM from 'react-dom/client';

import '../styles.css';
import './preview.css';
import { TaskPreview } from './TaskPreview.js';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <TaskPreview />
  </React.StrictMode>,
);
