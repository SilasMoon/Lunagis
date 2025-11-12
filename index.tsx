// Fix: Removed invalid file header which was causing parsing errors.
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { GlobalProvider } from './context/GlobalContext';
import { LayersProvider } from './context/LayersContext';
import { TimeProvider } from './context/TimeContext';
import { MapProvider } from './context/AppContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <GlobalProvider>
      <TimeProvider>
        <LayersProvider>
          <MapProvider>
            <App />
          </MapProvider>
        </LayersProvider>
      </TimeProvider>
    </GlobalProvider>
  </React.StrictMode>
);