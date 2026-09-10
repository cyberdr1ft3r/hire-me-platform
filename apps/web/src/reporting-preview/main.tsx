import React from 'react';
import ReactDOM from 'react-dom/client';

import { ReportingPreview } from './ReportingPreview.js';
import '../styles.css';
import './preview.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ReportingPreview />
  </React.StrictMode>,
);
