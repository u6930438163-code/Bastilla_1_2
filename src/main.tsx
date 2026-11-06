import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';
import './styles/bastilla-unified-ui.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Bastilla: missing #root element in index.html');
}

createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
