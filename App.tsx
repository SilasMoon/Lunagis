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
          <DataCanvas />
        </section>

        {primaryDataLayer && (
            <>
              <StatusBar />
              <TimeSeriesPlot />
              <TimeSlider />
            </>
        )}
      </main>
    </div>
  );
};

export default App;