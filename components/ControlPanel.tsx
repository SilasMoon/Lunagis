import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { ColorMapName, GeoCoordinates, PixelCoords, TimeRange, Tool, Layer, DataLayer, AnalysisLayer } from '../types';
import { COLOR_MAPS } from '../types';
import { Colorbar } from './Colorbar';
import { indexToDateString } from '../utils/time';

const Section: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div>
      <h3 className="text-base font-medium text-gray-300 mb-2 bg-gray-900/50 p-2 rounded-md cursor-pointer flex justify-between items-center" onClick={() => setIsOpen(!isOpen)}>
        <span>{title}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
      </h3>
      {isOpen && <div className="p-3 rounded-md space-y-4 animate-fade-in bg-gray-800/30">{children}</div>}
    </div>
  );
};

const AddLayerMenu: React.FC<{ onAddDataLayer: (f: File) => void; onAddBaseMapLayer: (p: File, v: File) => void; isLoading: boolean; }> = ({ onAddDataLayer, onAddBaseMapLayer, isLoading }) => {
    const [isOpen, setIsOpen] = useState(false);
    const npyInputRef = useRef<HTMLInputElement>(null);
    const pngInputRef = useRef<HTMLInputElement>(null);
    const vrtInputRef = useRef<HTMLInputElement>(null);
    const [pendingPng, setPendingPng] = useState<File | null>(null);
    const [pendingVrt, setPendingVrt] = useState<File | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleNpySelect = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) onAddDataLayer(e.target.files[0]); setIsOpen(false); };
    const handleAddBaseMap = () => { if (pendingPng && pendingVrt) { onAddBaseMapLayer(pendingPng, pendingVrt); setPendingPng(null); setPendingVrt(null); setIsOpen(false); }};

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <div className="relative" ref={dropdownRef}>
        <button onClick={() => setIsOpen(!isOpen)} disabled={!!isLoading} className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-md text-sm transition-all flex items-center justify-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
            Add Layer
        </button>
        {isOpen && (
            <div className="absolute top-full left-0 mt-2 w-full bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10 p-3 space-y-3">
                <input type="file" ref={npyInputRef} onChange={handleNpySelect} accept=".npy" style={{ display: 'none' }} />
                <button onClick={() => npyInputRef.current?.click()} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-md">Data Layer (.npy)</button>
                <div className="border-t border-gray-700 pt-2 space-y-2">
                    <p className="text-sm text-gray-400 px-3">Base Map Layer</p>
                    <div className="grid grid-cols-2 gap-2">
                        <input type="file" ref={pngInputRef} onChange={(e) => setPendingPng(e.target.files?.[0] ?? null)} accept=".png" style={{ display: 'none' }} />
                        <button onClick={() => pngInputRef.current?.click()} className="w-full text-center px-3 py-2 text-xs bg-teal-700 hover:bg-teal-600 rounded-md truncate" title={pendingPng?.name}>{pendingPng ? pendingPng.name : 'Select .png'}</button>
                        <input type="file" ref={vrtInputRef} onChange={(e) => setPendingVrt(e.target.files?.[0] ?? null)} accept=".vrt" style={{ display: 'none' }} />
                        <button onClick={() => vrtInputRef.current?.click()} className="w-full text-center px-3 py-2 text-xs bg-purple-700 hover:bg-purple-600 rounded-md truncate" title={pendingVrt?.name}>{pendingVrt ? pendingVrt.name : 'Select .vrt'}</button>
                    </div>
                    <button onClick={handleAddBaseMap} disabled={!pendingPng || !pendingVrt} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 text-white font-semibold py-1 px-3 rounded-md text-sm transition-all">Add Base Map</button>
                </div>
            </div>
        )}
      </div>
    );
};

const LayerItem: React.FC<{ layer: Layer; isActive: boolean; onSelect: () => void; onUpdate: (id: string, updates: Partial<Layer>) => void; onRemove: (id: string) => void; onCalculateAnalysis: (id: string, params: any) => void; }> = ({ layer, isActive, onSelect, onUpdate, onRemove, onCalculateAnalysis }) => {
    const [computationThreshold, setComputationThreshold] = useState(0.8);
    const [clippingThreshold, setClippingThreshold] = useState(24);
    
    const handleAnalysis = () => {
        onCalculateAnalysis(layer.id, { computationThreshold, clippingThreshold });
    };

    return (
        <div className={`bg-gray-800/60 rounded-lg border ${isActive ? 'border-cyan-500/50' : 'border-gray-700/80'}`}>
            <div className="flex items-center p-2 gap-2">
                <button onClick={() => onUpdate(layer.id, { visible: !layer.visible })} title={layer.visible ? 'Hide Layer' : 'Show Layer'} className="text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" style={{ opacity: layer.visible ? 1 : 0.3 }} /></svg>
                </button>
                <div onClick={onSelect} className="flex-grow cursor-pointer truncate text-sm">
                    <p className="font-medium text-gray-200" title={layer.name}>{layer.name}</p>
                    <p className="text-xs text-gray-400">{layer.type.charAt(0).toUpperCase() + layer.type.slice(1)} Layer</p>
                </div>
                <button onClick={onSelect} className="text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isActive ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
                 <button onClick={() => onRemove(layer.id)} title="Remove Layer" className="text-gray-500 hover:text-red-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
            </div>
            {isActive && (
                <div className="p-3 border-t border-gray-700 space-y-4 animate-fade-in">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Opacity: {Math.round(layer.opacity * 100)}%</label>
                        <input type="range" min="0" max="1" step="0.01" value={layer.opacity} onChange={(e) => onUpdate(layer.id, { opacity: Number(e.target.value) })} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1" />
                    </div>
                    {(layer.type === 'data' || layer.type === 'analysis') && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Colormap</label>
                            <select value={layer.colormap} onChange={(e) => onUpdate(layer.id, { colormap: e.target.value as ColorMapName })} className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block p-2.5">
                              {COLOR_MAPS.map(name => (<option key={name} value={name}>{name}</option>))}
                            </select>
                          </div>
                          <div className="flex flex-col items-center"><Colorbar colorMap={layer.colormap} dataRange={layer.range} units={layer.type === 'analysis' ? 'hours' : undefined} /></div>
                        </>
                    )}
                    {layer.type === 'data' && (
                        <div className="border-t border-gray-700 pt-3 space-y-3">
                             <p className="text-xs text-gray-400">Calculate a new analysis layer from this data layer.</p>
                             <div>
                                <label className="block text-sm font-medium text-gray-400">Value Threshold: {computationThreshold.toFixed(2)}</label>
                                <input type="range" min={layer.range.min} max={layer.range.max} step="0.01" value={computationThreshold} onChange={(e) => setComputationThreshold(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500 mt-1"/>
                             </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-400">Clip Duration at (days): {Math.round(clippingThreshold / 24)}</label>
                                <input type="range" min="1" max="30" step="1" value={Math.round(clippingThreshold / 24)} onChange={(e) => setClippingThreshold(Number(e.target.value) * 24)} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500 mt-1"/>
                             </div>
                             <button onClick={handleAnalysis} className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-3 rounded-md text-sm transition-all">Calculate Duration</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const LayersPanel: React.FC<any> = (props) => {
    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-cyan-300">Layer Management</h2>
            <AddLayerMenu onAddDataLayer={props.onAddDataLayer} onAddBaseMapLayer={props.onAddBaseMapLayer} isLoading={!!props.isLoading} />
            {props.isLoading && <div className="text-sm text-cyan-300 text-center p-2 bg-gray-900/50 rounded-md">{props.isLoading}</div>}
            <div className="space-y-2">
                {props.layers.length > 0 ? (
                    [...props.layers].reverse().map((layer: Layer) => (
                        <LayerItem
                            key={layer.id}
                            layer={layer}
                            isActive={layer.id === props.activeLayerId}
                            onSelect={() => props.onActiveLayerChange(layer.id === props.activeLayerId ? null : layer.id)}
                            onUpdate={props.onUpdateLayer}
                            onRemove={props.onRemoveLayer}
                            onCalculateAnalysis={props.onCalculateAnalysisLayer}
                        />
                    ))
                ) : (
                    <p className="text-sm text-gray-500 text-center p-4">No layers loaded.</p>
                )}
            </div>
        </div>
    );
};

const MeasurementPanel = () => (
    <div>
        <h2 className="text-lg font-semibold text-cyan-300">Measurement</h2>
        <p className="text-sm text-gray-400 mt-2">Measurement tools will be available here in a future update.</p>
    </div>
);

const ConfigurationPanel: React.FC<any> = ({ isDataLoaded, timeRange, showGraticule, onShowGraticuleChange, graticuleDensity, onGraticuleDensityChange, hoveredCoords, selectedPixel }) => {
  return (
    <div className="space-y-4">
        <h2 className="text-lg font-semibold text-cyan-300">Configuration</h2>
        {!isDataLoaded ? <p className="text-sm text-gray-400 mt-2">Load a data layer to access configuration.</p> : (
            <>
              <Section title="Time Range Details" defaultOpen={true}>
                {timeRange && (
                  <div className="text-sm space-y-2 font-mono">
                    <div><span className="text-gray-400">Start:</span><span className="block text-cyan-300">{indexToDateString(timeRange.start)}</span></div>
                    <div><span className="text-gray-400">End:</span><span className="block text-cyan-300">{indexToDateString(timeRange.end)}</span></div>
                    <div className="pt-2 border-t border-gray-700/50 flex justify-between"><span className="text-gray-400">Duration:</span><span className="text-green-400">{timeRange.end - timeRange.start + 1} hours</span></div>
                  </div>
                )}
              </Section>
              <Section title="View Options" defaultOpen={true}>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showGraticule} onChange={(e) => onShowGraticuleChange(e.target.checked)} className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500" /><span>Show Graticule</span></label>
                {showGraticule && (
                  <div className="pt-3">
                    <label className="block text-sm font-medium text-gray-400">Density: {graticuleDensity.toFixed(1)}x</label>
                    <input type="range" min="0.2" max="5" step="0.1" value={graticuleDensity} onChange={(e) => onGraticuleDensityChange(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1" />
                  </div>
                )}
              </Section>
              <Section title="Cursor Coordinates" defaultOpen={true}>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-gray-400">Lat:</span><span className="font-mono text-green-400">{hoveredCoords ? hoveredCoords.lat.toFixed(6) : '---'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Lon:</span><span className="font-mono text-green-400">{hoveredCoords ? hoveredCoords.lon.toFixed(6) : '---'}</span></div>
                   <div className="pt-2 border-t border-gray-700/50 flex justify-between"><span className="text-gray-400">Pixel (X, Y):</span><span className="font-mono text-green-400">{selectedPixel ? `${selectedPixel.x}, ${selectedPixel.y}`: '---'}</span></div>
                </div>
              </Section>
            </>
        )}
    </div>
  );
}

export const SidePanel: React.FC<{ activeTool: Tool; [key: string]: any; }> = ({ activeTool, ...props }) => {
  const renderPanel = () => {
    switch (activeTool) {
      case 'layers': return <LayersPanel {...props} />;
      case 'measurement': return <MeasurementPanel />;
      case 'config': return <ConfigurationPanel {...props} />;
      default: return null;
    }
  };

  return (
    <aside className="bg-gray-800/50 border-r border-gray-700 p-4 w-80 flex-shrink-0 flex flex-col gap-6 overflow-y-auto">
      {renderPanel()}
    </aside>
  );
};