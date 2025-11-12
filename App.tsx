// Fix: Removed invalid file header which was causing parsing errors.
import React from 'react';
import { ToolBar } from './components/TopBar';
import { SidePanel } from './components/ControlPanel';
import { DataCanvas } from './components/DataCanvas';
import { TimeSlider } from './components/TimeSlider';
import { TimeSeriesPlot } from './components/TimeSeriesPlot';
import { ImportFilesModal } from './components/ImportFilesModal';
import { useGlobalContext } from './context/GlobalContext';
import { useLayersContext } from './context/LayersContext';

const App: React.FC = () => {
  const { 
    importRequest, 
    handleRestoreSession, 
    setImportRequest,
    activeTool, 
    onToolSelect,
  } = useGlobalContext();
  
  const { primaryDataLayer } = useLayersContext();

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
              <TimeSeriesPlot />
              <TimeSlider />
            </>
        )}
      </main>
    </div>
  );
};

export default App;