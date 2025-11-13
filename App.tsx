// Fix: Removed invalid file header which was causing parsing errors.
import React from 'react';
import { ToolBar } from './components/TopBar';
import { SidePanel } from './components/ControlPanel';
import { DataCanvas } from './components/DataCanvas';
import { TimeSlider } from './components/TimeSlider';
import { TimeSeriesPlot } from './components/TimeSeriesPlot';
import { ImportFilesModal } from './components/ImportFilesModal';
import { useAppContext } from './context/AppContext';
import { StatusBar } from './components/StatusBar';
import { ErrorBoundary } from './components/ErrorBoundary';

const App: React.FC = () => {
  const { 
    importRequest, 
    handleRestoreSession, 
    setImportRequest,
    activeTool, 
    onToolSelect,
    primaryDataLayer
  } = useAppContext();

  return (
    <div className="h-screen bg-gray-900 text-gray-200 flex flex-row font-sans overflow-hidden">
      {importRequest && <ImportFilesModal requiredFiles={importRequest.requiredFiles} onCancel={() => setImportRequest(null)} onConfirm={(files) => handleRestoreSession(importRequest.config, files)} />}
      <ToolBar activeTool={activeTool} onToolSelect={onToolSelect} />
      
      <SidePanel />
      
      <main className="flex-grow flex flex-col min-w-0">
        <section className="flex-grow flex items-center justify-center bg-black/20 p-4 sm:p-6 lg:p-8 relative">
          <ErrorBoundary
            fallback={
              <div className="text-center p-8">
                <p className="text-red-500 text-xl mb-4">Canvas Error</p>
                <p className="text-gray-400">The map canvas encountered an error. Try reloading the page.</p>
              </div>
            }
          >
            <DataCanvas />
          </ErrorBoundary>
        </section>

        {primaryDataLayer && (
            <>
              <ErrorBoundary fallback={<div className="h-8 bg-gray-800"></div>}>
                <StatusBar />
              </ErrorBoundary>
              <ErrorBoundary fallback={<div className="h-48 bg-gray-800"></div>}>
                <TimeSeriesPlot />
              </ErrorBoundary>
              <ErrorBoundary fallback={<div className="h-20 bg-gray-800"></div>}>
                <TimeSlider />
              </ErrorBoundary>
            </>
        )}
      </main>
    </div>
  );
};

export default App;