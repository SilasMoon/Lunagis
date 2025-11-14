// Fix: Removed invalid file header which was causing parsing errors.
// Fix: Import useState, useRef, useEffect, and useMemo from React to resolve hook-related errors.
import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { ColorMapName, GeoCoordinates, PixelCoords, TimeRange, Tool, Layer, DataLayer, AnalysisLayer, ColorStop, DaylightFractionHoverData, Artifact, ArtifactBase, CircleArtifact, RectangleArtifact, PathArtifact, Waypoint, DteCommsLayer, LpfCommsLayer } from '../types';
import { COLOR_MAPS } from '../types';
import { Colorbar } from './Colorbar';
import { indexToDateString } from '../utils/time';
import { sanitizeLayerNameForExpression } from '../services/analysisService';
import { useAppContext } from '../context/AppContext';


declare const d3: any;

// Helper function to format duration in hours and days.
const formatDuration = (hours: number): string => {
  if (hours === 0) return "0 hrs";
  const days = (hours / 24).toFixed(1);
  return `${hours} hrs (${days} days)`;
};

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

const AddLayerMenu: React.FC = () => {
    const { onAddDataLayer, onAddDteCommsLayer, onAddLpfCommsLayer, onAddBaseMapLayer, isLoading } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const npyInputRef = useRef<HTMLInputElement>(null);
    const dteInputRef = useRef<HTMLInputElement>(null);
    const lpfInputRef = useRef<HTMLInputElement>(null);
    const pngInputRef = useRef<HTMLInputElement>(null);
    const vrtInputRef = useRef<HTMLInputElement>(null);
    const [pendingPng, setPendingPng] = useState<File | null>(null);
    const [pendingVrt, setPendingVrt] = useState<File | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleNpySelect = (e: React.ChangeEvent<HTMLInputElement>, handler: (f: File) => void) => { 
        if (e.target.files?.[0]) {
            handler(e.target.files[0]);
        }
        setIsOpen(false);
    };
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
            <div className="absolute top-full left-0 mt-2 w-full bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10 p-3 space-y-2">
                <input type="file" ref={npyInputRef} onChange={(e) => handleNpySelect(e, onAddDataLayer)} accept=".npy" style={{ display: 'none' }} />
                <button onClick={() => npyInputRef.current?.click()} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-md">Data Layer (.npy)</button>
                
                <input type="file" ref={dteInputRef} onChange={(e) => handleNpySelect(e, onAddDteCommsLayer)} accept=".npy" style={{ display: 'none' }} />
                <button onClick={() => dteInputRef.current?.click()} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-md">DTE Comms Layer (.npy)</button>

                <input type="file" ref={lpfInputRef} onChange={(e) => handleNpySelect(e, onAddLpfCommsLayer)} accept=".npy" style={{ display: 'none' }} />
                <button onClick={() => lpfInputRef.current?.click()} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-md">LPF Comms Layer (.npy)</button>
                
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

const rgbaToHexAlpha = (colorStr: string): { hex: string; alpha: number } => {
    const d3Color = d3.color(colorStr);
    if (!d3Color) return { hex: '#000000', alpha: 1 };

    const { r, g, b, opacity } = d3Color.rgb();
    const toHex = (c: number) => ('0' + Math.round(c).toString(16)).slice(-2);
    const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    
    return { hex, alpha: opacity };
};

const hexAlphaToRgba = (hex: string, alpha: number): string => {
    const d3Color = d3.color(hex);
    if (!d3Color) return `rgba(0, 0, 0, ${alpha})`;
    const { r, g, b } = d3Color.rgb();
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};


const CustomColormapEditor: React.FC<{
    stops: ColorStop[];
    onStopsChange: (stops: ColorStop[]) => void;
    units?: 'days' | string;
    layerRange: { min: number; max: number };
}> = ({ stops, onStopsChange, units, layerRange }) => {
    const [newValue, setNewValue] = useState<string>("0");
    const [newHex, setNewHex] = useState('#ffffff');
    const [newAlpha, setNewAlpha] = useState(1.0);

    const handleAddStop = () => {
        const numericValue = parseFloat(newValue);
        if (isNaN(numericValue)) return;
        
        const newStops = [...stops, { value: numericValue, color: hexAlphaToRgba(newHex, newAlpha) }];
        newStops.sort((a, b) => a.value - b.value);
        onStopsChange(newStops);
    };
    
    const handleUpdateStop = (index: number, updatedProp: Partial<ColorStop & {alpha: number}>) => {
        const newStops = [...stops];
        const currentStop = newStops[index];
        
        if ('value' in updatedProp) {
            const numericValue = typeof updatedProp.value === 'string' ? parseFloat(updatedProp.value) : updatedProp.value;
            if (isNaN(numericValue as number)) return;
            newStops[index] = { ...currentStop, value: numericValue as number };
            newStops.sort((a, b) => a.value - b.value);
        } else {
            const { hex, alpha } = rgbaToHexAlpha(currentStop.color);
            const nextHex = 'color' in updatedProp ? updatedProp.color! : hex;
            const nextAlpha = 'alpha' in updatedProp ? updatedProp.alpha! : alpha;
            newStops[index] = { ...currentStop, color: hexAlphaToRgba(nextHex, nextAlpha) };
        }
        onStopsChange(newStops);
    };


    const handleRemoveStop = (index: number) => {
        onStopsChange(stops.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3 p-3 bg-gray-900/30 rounded-md">
            <h4 className="text-sm font-medium text-gray-300">Colormap Stops</h4>
            <div className="space-y-2">
                {stops.map((stop, index) => {
                    const { hex, alpha } = rgbaToHexAlpha(stop.color);
                    const isFirstStop = index === 0;
                    
                    const displayValue = isFirstStop
                        ? (units === 'days' ? (layerRange.min / 24).toFixed(1) : layerRange.min.toFixed(0))
                        : (units === 'days' ? stop.value.toFixed(1) : stop.value.toFixed(0));

                    return (
                        <div key={index} className="grid grid-cols-[20px_1fr_auto_auto_auto] items-center gap-2 text-sm">
                            <span className="text-right pr-1 font-mono text-gray-400">
                                {!isFirstStop && '>='}
                            </span>
                            <input 
                                type="text" // Use text to display formatted value
                                defaultValue={displayValue}
                                key={displayValue + stop.color} // Force re-render on sort
                                readOnly={isFirstStop}
                                onBlur={isFirstStop ? undefined : (e) => {
                                    let val = parseFloat(e.target.value);
                                    if(isNaN(val)) return;
                                    handleUpdateStop(index, { value: val });
                                }}
                                className="w-full bg-gray-700 text-white text-sm rounded-md p-1 border border-gray-600 disabled:bg-gray-800 disabled:text-gray-500"
                                disabled={isFirstStop}
                                title={`Value${units === 'days' ? ' (days)' : ''}`}
                            />
                            <input 
                                type="color"
                                value={hex}
                                onChange={(e) => handleUpdateStop(index, { color: e.target.value })}
                                className="w-8 h-8 p-0 border-none rounded-md bg-transparent"
                            />
                            <input 
                                type="number"
                                min="0" max="1" step="0.01"
                                defaultValue={alpha.toFixed(2)}
                                onBlur={(e) => {
                                    let newAlpha = parseFloat(e.target.value);
                                    if (isNaN(newAlpha)) newAlpha = 1.0;
                                    if (newAlpha < 0) newAlpha = 0; if (newAlpha > 1) newAlpha = 1;
                                    handleUpdateStop(index, { alpha: newAlpha });
                                }}
                                className="w-16 bg-gray-700 text-white text-sm rounded-md p-1 border border-gray-600"
                                placeholder="Opacity"
                            />
                            <button disabled={isFirstStop} onClick={() => handleRemoveStop(index)} className="text-gray-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed ml-auto">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            </button>
                        </div>
                    );
                })}
            </div>
             <div className="border-t border-gray-600 pt-3 grid grid-cols-[20px_1fr_auto_auto_auto] items-center gap-2">
                <span/>
                <input 
                    type="number"
                    step={units === 'days' ? 0.1 : 1}
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    className="w-full bg-gray-700 text-white text-sm rounded-md p-1 border border-gray-600"
                    placeholder="Value"
                />
                <input 
                    type="color"
                    value={newHex}
                    onChange={(e) => setNewHex(e.target.value)}
                    className="w-8 h-8 p-0 border-none rounded-md bg-transparent"
                />
                <input 
                    type="number"
                    min="0" max="1" step="0.01"
                    value={newAlpha}
                    onChange={(e) => setNewAlpha(Number(e.target.value))}
                    className="w-16 bg-gray-700 text-white text-sm rounded-md p-1 border border-gray-600"
                    placeholder="Opacity"
                />
                <button onClick={handleAddStop} className="bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold py-1.5 px-2 rounded-md">Add</button>
            </div>
        </div>
    );
};

const FlickerIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);

const formatLayerType = (type: Layer['type']): string => {
    switch (type) {
        case 'basemap': return 'Basemap Layer';
        case 'data': return 'Data Layer';
        case 'analysis': return 'Analysis Layer';
        case 'dte_comms': return 'DTE Comms Layer';
        case 'lpf_comms': return 'LPF Comms Layer';
        default: return 'Layer';
    }
};

const LayerItem = React.memo<{ layer: Layer; isActive: boolean; onSelect: () => void; }>(({ layer, isActive, onSelect }) => {
    const {
        onUpdateLayer,
        onRemoveLayer,
        onCalculateNightfallLayer,
        onCalculateDaylightFractionLayer,
        daylightFractionHoverData,
        flickeringLayerId,
        onToggleFlicker,
        layers,
        onRecalculateExpressionLayer,
        isLoading
    } = useAppContext();

    const [editingExpression, setEditingExpression] = useState(false);
    const [newExpression, setNewExpression] = useState('');

    const isNightfall = layer.type === 'analysis' && layer.analysisType === 'nightfall';
    const isExpression = layer.type === 'analysis' && layer.analysisType === 'expression';
    const useDaysUnitForCustom = isNightfall && layer.colormap === 'Custom';
    const hasColormap = layer.type === 'data' || layer.type === 'analysis' || layer.type === 'dte_comms' || layer.type === 'lpf_comms';

    const availableExpressionVariables = useMemo(() => {
        return layers
            .filter(l => l.type === 'data' || l.type === 'analysis' || l.type === 'dte_comms' || l.type === 'lpf_comms')
            .filter(l => l.id !== layer.id) // Exclude self
            .map(l => sanitizeLayerNameForExpression(l.name));
    }, [layers, layer.id]);

    const handleStartEditExpression = () => {
        if (layer.type === 'analysis' && layer.params.expression) {
            setNewExpression(layer.params.expression);
            setEditingExpression(true);
        }
    };

    const handleSaveExpression = async () => {
        if (newExpression.trim() && onRecalculateExpressionLayer) {
            await onRecalculateExpressionLayer(layer.id, newExpression);
            setEditingExpression(false);
        }
    };

    return (
        <div className={`bg-gray-800/60 rounded-lg border ${isActive ? 'border-cyan-500/50' : 'border-gray-700/80'}`}>
            <div className="flex items-center p-2 gap-2">
                <button onClick={() => onUpdateLayer(layer.id, { visible: !layer.visible })} title={layer.visible ? 'Hide Layer' : 'Show Layer'} className="text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" style={{ opacity: layer.visible ? 1 : 0.3 }} /></svg>
                </button>
                <button onClick={() => onToggleFlicker(layer.id)} title="Flicker Layer" className={`${layer.id === flickeringLayerId ? 'text-cyan-400' : 'text-gray-400 hover:text-white'}`}>
                    <FlickerIcon />
                </button>
                <div onClick={onSelect} className="flex-grow cursor-pointer truncate text-sm">
                    <p className="font-medium text-gray-200" title={layer.name}>{layer.name}</p>
                    <p className="text-xs text-gray-400">{formatLayerType(layer.type)}</p>
                    {layer.type === 'analysis' && layer.analysisType === 'expression' && layer.params.expression && (
                      <p className="text-xs text-gray-500 font-mono truncate mt-1" title={layer.params.expression}>
                        Expr: {layer.params.expression}
                      </p>
                    )}
                </div>
                <button onClick={onSelect} className="text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isActive ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
                 <button onClick={() => onRemoveLayer(layer.id)} title="Remove Layer" className="text-gray-500 hover:text-red-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
            </div>
            {isActive && (
                <div className="p-3 border-t border-gray-700 space-y-4 animate-fade-in">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Opacity: {Math.round(layer.opacity * 100)}%</label>
                        <input type="range" min="0" max="1" step="0.01" value={layer.opacity} onChange={(e) => onUpdateLayer(layer.id, { opacity: Number(e.target.value) })} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1" />
                    </div>
                    {hasColormap && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Colormap</label>
                            <div className="flex items-center gap-2">
                                <select value={layer.colormap} onChange={(e) => onUpdateLayer(layer.id, { colormap: e.target.value as ColorMapName })} className="flex-grow bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block p-2.5">
                                  {COLOR_MAPS.map(name => (<option key={name} value={name}>{name}</option>))}
                                </select>
                                <label className="flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer whitespace-nowrap">
                                    <input 
                                        type="checkbox" 
                                        checked={!!layer.colormapInverted} 
                                        onChange={(e) => onUpdateLayer(layer.id, { colormapInverted: e.target.checked })} 
                                        className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500"
                                    />
                                    Invert
                                </label>
                            </div>
                          </div>
                           {layer.colormap === 'Custom' && (
                               <CustomColormapEditor
                                   layerRange={layer.range}
                                   stops={
                                    (layer.customColormap || []).map(s => ({
                                        ...s,
                                        value: useDaysUnitForCustom ? s.value / 24 : s.value
                                    }))
                                   }
                                   onStopsChange={(stops) => {
                                      const stopsInHours = stops.map(s => ({
                                          ...s,
                                          value: useDaysUnitForCustom ? s.value * 24 : s.value
                                        }));
                                      onUpdateLayer(layer.id, { customColormap: stopsInHours });
                                   }}
                                   units={useDaysUnitForCustom ? 'days' : undefined}
                               />
                           )}
                           {layer.colormap !== 'Custom' && (
                               <div className="space-y-2 p-3 bg-gray-900/30 rounded-md">
                                   <h4 className="text-sm font-medium text-gray-300">Transparency Thresholds</h4>
                                   <div className="space-y-2">
                                       <div>
                                           <label className="block text-xs text-gray-400 mb-1">Lower ≤</label>
                                           <div className="flex items-center gap-1.5">
                                               <input
                                                   type="number"
                                                   step="any"
                                                   value={layer.transparencyLowerThreshold ?? ''}
                                                   onChange={(e) => {
                                                       const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                       onUpdateLayer(layer.id, { transparencyLowerThreshold: val });
                                                   }}
                                                   placeholder="None"
                                                   className="flex-1 bg-gray-700 text-white text-sm rounded-md px-2 py-1.5 border border-gray-600"
                                               />
                                               {layer.transparencyLowerThreshold !== undefined && (
                                                   <button
                                                       onClick={() => onUpdateLayer(layer.id, { transparencyLowerThreshold: undefined })}
                                                       className="text-gray-400 hover:text-red-400 flex-shrink-0"
                                                       title="Clear"
                                                   >
                                                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                           <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                       </svg>
                                                   </button>
                                               )}
                                           </div>
                                       </div>
                                       <div>
                                           <label className="block text-xs text-gray-400 mb-1">Upper ≥</label>
                                           <div className="flex items-center gap-1.5">
                                               <input
                                                   type="number"
                                                   step="any"
                                                   value={layer.transparencyUpperThreshold ?? ''}
                                                   onChange={(e) => {
                                                       const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                       onUpdateLayer(layer.id, { transparencyUpperThreshold: val });
                                                   }}
                                                   placeholder="None"
                                                   className="flex-1 bg-gray-700 text-white text-sm rounded-md px-2 py-1.5 border border-gray-600"
                                               />
                                               {layer.transparencyUpperThreshold !== undefined && (
                                                   <button
                                                       onClick={() => onUpdateLayer(layer.id, { transparencyUpperThreshold: undefined })}
                                                       className="text-gray-400 hover:text-red-400 flex-shrink-0"
                                                       title="Clear"
                                                   >
                                                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                           <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                       </svg>
                                                   </button>
                                               )}
                                           </div>
                                       </div>
                                       <p className="text-xs text-gray-500 italic">Values at or beyond thresholds become transparent</p>
                                   </div>
                               </div>
                           )}
                          <div className="flex flex-col items-center">
                            <Colorbar 
                                colorMap={layer.colormap}
                                customColormap={layer.customColormap}
                                dataRange={
                                    isNightfall
                                    ? { min: -(layer.params.clipValue ?? 0), max: layer.params.clipValue ?? 0 }
                                    : layer.range
                                }
                                units={
                                    layer.type === 'analysis' 
                                        ? (layer.analysisType === 'nightfall' 
                                            ? 'days' 
                                            : '%') 
                                        : undefined
                                } 
                                inverted={layer.colormapInverted}
                                isThreshold={layer.colormap === 'Custom'}
                            />
                          </div>
                        </>
                    )}
                    {layer.type === 'analysis' && layer.analysisType === 'daylight_fraction' && daylightFractionHoverData && (
                        <div className="mt-3 p-3 bg-gray-900/40 rounded-md text-sm space-y-2 animate-fade-in">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Hover Details</h4>
                            <div className="flex justify-between">
                                <span className="text-gray-300">Daylight Fraction:</span>
                                <span className="font-mono text-cyan-300">{daylightFractionHoverData.fraction.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-300">Total Daylight:</span>
                                <span className="font-mono text-cyan-300">{formatDuration(daylightFractionHoverData.dayHours)}</span>
                            </div>
                             <div className="flex justify-between">
                                <span className="text-gray-300">Total Night:</span>
                                <span className="font-mono text-cyan-300">{formatDuration(daylightFractionHoverData.nightHours)}</span>
                            </div>

                            <div className="border-t border-gray-700/50 pt-2 mt-2 space-y-1">
                                <p className="text-xs text-gray-400">Day Periods</p>
                                <div className="flex justify-between text-xs pl-2"><span className="text-gray-400">Count:</span><span className="font-mono text-cyan-400">{daylightFractionHoverData.dayPeriods}</span></div>
                                <div className="flex justify-between text-xs pl-2"><span className="text-gray-400">Longest:</span><span className="font-mono text-cyan-400">{formatDuration(daylightFractionHoverData.longestDayPeriod)}</span></div>
                                <div className="flex justify-between text-xs pl-2"><span className="text-gray-400">Shortest:</span><span className="font-mono text-cyan-400">{formatDuration(daylightFractionHoverData.shortestDayPeriod)}</span></div>
                            </div>
                            <div className="border-t border-gray-700/50 pt-2 mt-2 space-y-1">
                                <p className="text-xs text-gray-400">Night Periods</p>
                                <div className="flex justify-between text-xs pl-2"><span className="text-gray-400">Count:</span><span className="font-mono text-cyan-400">{daylightFractionHoverData.nightPeriods}</span></div>
                                <div className="flex justify-between text-xs pl-2"><span className="text-gray-400">Longest:</span><span className="font-mono text-cyan-400">{formatDuration(daylightFractionHoverData.longestNightPeriod)}</span></div>
                                <div className="flex justify-between text-xs pl-2"><span className="text-gray-400">Shortest:</span><span className="font-mono text-cyan-400">{formatDuration(daylightFractionHoverData.shortestNightPeriod)}</span></div>
                            </div>
                        </div>
                    )}
                    {layer.type === 'data' && (
                        <div className="border-t border-gray-700 pt-3 space-y-2">
                           <button onClick={() => onCalculateNightfallLayer(layer.id)} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-3 rounded-md text-sm transition-all">
                             Calculate Nightfall Forecast
                           </button>
                           <button onClick={() => onCalculateDaylightFractionLayer(layer.id)} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold py-2 px-3 rounded-md text-sm transition-all">
                             Calculate Daylight Fraction
                           </button>
                        </div>
                    )}
                    {isNightfall && (
                        <div className="border-t border-gray-700 pt-3 space-y-3">
                            <h4 className="text-sm font-medium text-gray-300">Colormap Clipping</h4>
                            <div>
                                <label className="block text-xs text-gray-400">
                                    Clip colormap at: {
                                        `${((layer.params.clipValue ?? 0) / 24).toFixed(1)} days`
                                    }
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1000"
                                    step="1"
                                    value={layer.params.clipValue}
                                    onChange={(e) => onUpdateLayer(layer.id, { params: { ...layer.params, clipValue: Number(e.target.value) }})}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500 mt-1"
                                />
                            </div>
                        </div>
                    )}
                    {isExpression && (
                        <div className="border-t border-gray-700 pt-3 space-y-3">
                            <h4 className="text-sm font-medium text-gray-300">Expression</h4>
                            {!editingExpression ? (
                                <>
                                    <div className="bg-gray-900/40 p-2 rounded-md">
                                        <p className="text-xs font-mono text-gray-300 break-words">
                                            {layer.params.expression || 'No expression defined'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleStartEditExpression}
                                        disabled={!!isLoading}
                                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-3 rounded-md text-sm transition-all"
                                    >
                                        Edit Expression
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">New Expression</label>
                                        <textarea
                                            value={newExpression}
                                            onChange={(e) => setNewExpression(e.target.value)}
                                            rows={3}
                                            className="w-full bg-gray-700 text-white text-xs rounded-md p-1.5 border border-gray-600 font-mono"
                                            placeholder="Enter expression..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-400 mb-1">Available Variables</label>
                                        <div className="bg-gray-800 p-2 rounded-md text-xs font-mono text-gray-400 flex flex-wrap gap-x-2 gap-y-1">
                                            {availableExpressionVariables.length > 0 ? availableExpressionVariables.map(v => <span key={v}>{v}</span>) : <span className="text-gray-500">No variables available</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setEditingExpression(false)}
                                            className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-1.5 px-3 rounded-md text-sm"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleSaveExpression}
                                            disabled={!newExpression.trim() || !!isLoading}
                                            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-1.5 px-3 rounded-md text-sm"
                                        >
                                            {isLoading && isLoading.toLowerCase().includes('expression') ? 'Calculating...' : 'Apply'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

const ExpressionEditor: React.FC = () => {
    const { layers, onCreateExpressionLayer, setIsCreatingExpression, isLoading } = useAppContext();
    const [name, setName] = useState('Expression Layer');
    const [expression, setExpression] = useState('');

    const availableVariables = useMemo(() => {
        return layers
            .filter(l => l.type === 'data' || l.type === 'analysis' || l.type === 'dte_comms' || l.type === 'lpf_comms')
            .map(l => sanitizeLayerNameForExpression(l.name));
    }, [layers]);

    const handleSubmit = async () => {
        if (name.trim() && expression.trim()) {
            await onCreateExpressionLayer(name, expression);
        }
    };

    // Show progress overlay when computing
    const isComputing = !!isLoading && isLoading.toLowerCase().includes('expression');

    return (
        <div className="p-3 bg-gray-900/50 border border-cyan-700 rounded-md text-sm text-cyan-200 space-y-4">
            <h3 className="text-base font-medium text-cyan-300">Create Expression Layer</h3>

            {isComputing && (
                <div className="p-4 bg-cyan-900/50 border border-cyan-500 rounded-md text-center space-y-3 animate-pulse">
                    <div className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-cyan-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-cyan-300 font-semibold">{isLoading}</span>
                    </div>
                    <p className="text-xs text-cyan-400">Please wait, this may take a while for large datasets...</p>
                </div>
            )}

            {availableVariables.length === 0 && !isComputing && (
                <div className="p-2 bg-red-900/30 border border-red-600/50 rounded-md text-xs text-red-200">
                    No data layers available. Please load data layers before creating expressions.
                </div>
            )}
            <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Layer Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isComputing}
                    className="w-full bg-gray-700 text-white text-sm rounded-md p-1.5 border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Expression</label>
                <textarea
                    value={expression}
                    onChange={(e) => setExpression(e.target.value)}
                    rows={4}
                    disabled={isComputing}
                    className="w-full bg-gray-700 text-white text-sm rounded-md p-1.5 border border-gray-600 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="(Nightfall_Forecast > 0) AND (DTE_Comms == 1)"
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Available Variables</label>
                <div className="bg-gray-800 p-2 rounded-md text-xs font-mono text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
                    {availableVariables.length > 0 ? availableVariables.map(v => <span key={v}>{v}</span>) : <span className="text-gray-500">No data layers available.</span>}
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <button
                    onClick={() => setIsCreatingExpression(false)}
                    disabled={isComputing}
                    className="bg-gray-600 hover:bg-gray-500 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-semibold py-1.5 px-3 rounded-md text-sm"
                >
                    Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!name.trim() || !expression.trim() || isComputing}
                  className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold py-1.5 px-3 rounded-md text-sm"
                >
                  {isComputing ? 'Computing...' : 'Create'}
                </button>
            </div>
        </div>
    );
};

const LayersPanel: React.FC = () => {
    const {
        layers,
        activeLayerId,
        setActiveLayerId,
        isCreatingExpression,
        setIsCreatingExpression,
        isLoading,
    } = useAppContext();

    // Helper to check if there are layers with datasets
    const hasDataLayers = useMemo(() => {
        return layers.some((l: Layer) => l.type === 'data' || l.type === 'analysis' || l.type === 'dte_comms' || l.type === 'lpf_comms');
    }, [layers]);

    if (isCreatingExpression) {
        return <ExpressionEditor />;
    }

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-cyan-300">Layer Management</h2>
            <AddLayerMenu />
            {!hasDataLayers && (
                <div className="p-2 bg-yellow-900/30 border border-yellow-600/50 rounded-md text-xs text-yellow-200">
                    Load a data layer before creating expression layers
                </div>
            )}
            <button
                onClick={() => setIsCreatingExpression(true)}
                disabled={!!isLoading || !hasDataLayers}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-md text-sm transition-all flex items-center justify-center gap-2"
                title={!hasDataLayers ? "Load a data layer first" : "Create a layer from an expression"}
            >
                Add Expression Layer
            </button>
            {isLoading && <div className="text-sm text-cyan-300 text-center p-2 bg-gray-900/50 rounded-md">{isLoading}</div>}
            <div className="space-y-2">
                {layers.length > 0 ? (
                    [...layers].reverse().map((layer: Layer) => (
                        <LayerItem
                            key={layer.id}
                            layer={layer}
                            isActive={layer.id === activeLayerId}
                            onSelect={() => setActiveLayerId(layer.id === activeLayerId ? null : layer.id)}
                        />
                    ))
                ) : (
                    <p className="text-sm text-gray-500 text-center p-4">No layers loaded.</p>
                )}
            </div>
        </div>
    );
};

const ArtifactItem = React.memo<{ artifact: Artifact; isActive: boolean; onSelect: () => void; }>(({ artifact, isActive, onSelect }) => {
    const { onUpdateArtifact, onRemoveArtifact, onStartAppendWaypoints } = useAppContext();

    const handleCommonUpdate = (prop: keyof ArtifactBase, value: any) => {
        onUpdateArtifact(artifact.id, { [prop]: value });
    };

    const handleWaypointUpdate = (path: PathArtifact, wpIndex: number, newProps: Partial<Waypoint>) => {
        const newWaypoints = [...path.waypoints];
        newWaypoints[wpIndex] = { ...newWaypoints[wpIndex], ...newProps };
        onUpdateArtifact(path.id, { waypoints: newWaypoints });
    };

    const handleWaypointGeoChange = (path: PathArtifact, wpIndex: number, coord: 'lon' | 'lat', value: string) => {
        const numericValue = parseFloat(value);
        if (isNaN(numericValue)) return;

        const newWaypoints = [...path.waypoints];
        const oldPos = newWaypoints[wpIndex].geoPosition;
        const newPos: [number, number] = [
            coord === 'lon' ? numericValue : oldPos[0],
            coord === 'lat' ? numericValue : oldPos[1]
        ];
        newWaypoints[wpIndex] = { ...newWaypoints[wpIndex], geoPosition: newPos };
        onUpdateArtifact(path.id, { waypoints: newWaypoints });
    };
    
    const handleRemoveWaypoint = (path: PathArtifact, wpIndex: number) => {
        const newWaypoints = path.waypoints.filter((_, i) => i !== wpIndex);
        onUpdateArtifact(path.id, { waypoints: newWaypoints });
    };

    return (
        <div className={`bg-gray-800/60 rounded-lg border ${isActive ? 'border-cyan-500/50' : 'border-gray-700/80'}`}>
            <div className="flex items-center p-2 gap-2">
                <button onClick={() => handleCommonUpdate('visible', !artifact.visible)} title={artifact.visible ? 'Hide' : 'Show'} className="text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" style={{ opacity: artifact.visible ? 1 : 0.3 }} /></svg>
                </button>
                <div onClick={onSelect} className="flex-grow cursor-pointer truncate text-sm">
                    <p className="font-medium text-gray-200" title={artifact.name}>{artifact.name}</p>
                    <p className="text-xs text-gray-400">{artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1)}</p>
                </div>
                <button onClick={onSelect} className="text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isActive ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
                <button onClick={() => onRemoveArtifact(artifact.id)} title="Remove" className="text-gray-500 hover:text-red-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
            </div>
            {isActive && (
                <div className="p-3 border-t border-gray-700 space-y-4 text-sm animate-fade-in">
                    <Section title="General" defaultOpen={true}>
                        <div className="flex items-center justify-between">
                            <label className="font-medium text-gray-300">Name</label>
                            <input type="text" value={artifact.name} onChange={e => handleCommonUpdate('name', e.target.value)} className="w-40 bg-gray-700 text-white rounded-md p-1 border border-gray-600 text-right" />
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="font-medium text-gray-300">Color</label>
                            <input type="color" value={artifact.color} onChange={e => handleCommonUpdate('color', e.target.value)} className="w-10 h-8 p-0 border-none rounded-md bg-transparent cursor-pointer" />
                        </div>
                        <div>
                            <label className="block font-medium text-gray-300 mb-1">Thickness: {artifact.thickness}px</label>
                            <input type="range" min="1" max="10" step="1" value={artifact.thickness} onChange={e => handleCommonUpdate('thickness', Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                        </div>
                    </Section>
                    
                    {artifact.type === 'circle' && (
                        <Section title="Circle Properties" defaultOpen={true}>
                            <div className="flex items-center justify-between">
                                <label className="font-medium text-gray-300">Radius (m)</label>
                                <input type="number" min="0" value={(artifact as CircleArtifact).radius} onChange={e => onUpdateArtifact(artifact.id, { radius: Number(e.target.value) })} className="w-24 bg-gray-700 text-white rounded-md p-1 border border-gray-600 text-right" />
                            </div>
                        </Section>
                    )}

                    {artifact.type === 'rectangle' && (
                        <Section title="Rectangle Properties" defaultOpen={true}>
                            <div className="flex items-center justify-between">
                                <label className="font-medium text-gray-300">Width (m)</label>
                                <input type="number" min="0" value={(artifact as RectangleArtifact).width} onChange={e => onUpdateArtifact(artifact.id, { width: Number(e.target.value) })} className="w-24 bg-gray-700 text-white rounded-md p-1 border border-gray-600 text-right" />
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="font-medium text-gray-300">Height (m)</label>
                                <input type="number" min="0" value={(artifact as RectangleArtifact).height} onChange={e => onUpdateArtifact(artifact.id, { height: Number(e.target.value) })} className="w-24 bg-gray-700 text-white rounded-md p-1 border border-gray-600 text-right" />
                            </div>
                            <div>
                                <label className="block font-medium text-gray-300 mb-1">Rotation: {(artifact as RectangleArtifact).rotation}°</label>
                                <input type="range" min="0" max="360" step="1" value={(artifact as RectangleArtifact).rotation} onChange={e => onUpdateArtifact(artifact.id, { rotation: Number(e.target.value) })} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                            </div>
                        </Section>
                    )}

                    {artifact.type === 'path' && (
                        <>
                            <Section title="Path Tools">
                                <button onClick={onStartAppendWaypoints} className="w-full bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold py-1.5 px-2 rounded-md">Add Waypoints</button>
                            </Section>
                            <Section title="Path Waypoints" defaultOpen={true}>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                    {(artifact as PathArtifact).waypoints.map((wp, i) => (
                                        <div key={wp.id} className="bg-gray-900/40 p-1.5 rounded-md space-y-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-gray-400">{i + 1}.</span>
                                                <input type="text" value={wp.label} 
                                                    onChange={e => handleWaypointUpdate(artifact as PathArtifact, i, { label: e.target.value })}
                                                    className="w-full bg-gray-700 text-white rounded p-1 border border-gray-600 text-sm" placeholder="Label" />
                                                <button onClick={() => handleRemoveWaypoint(artifact as PathArtifact, i)} title="Remove Waypoint" className="text-gray-500 hover:text-red-400">
                                                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2 pl-6">
                                                <input type="number" step="any" value={wp.geoPosition[0]} onChange={e => handleWaypointGeoChange(artifact as PathArtifact, i, 'lon', e.target.value)} className="w-full bg-gray-700 text-white rounded p-1 border border-gray-600 text-xs" placeholder="Lon" title="Longitude" />
                                                <input type="number" step="any" value={wp.geoPosition[1]} onChange={e => handleWaypointGeoChange(artifact as PathArtifact, i, 'lat', e.target.value)} className="w-full bg-gray-700 text-white rounded p-1 border border-gray-600 text-xs" placeholder="Lat" title="Latitude" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        </>
                    )}
                </div>
            )}
        </div>
    );
});


const ArtifactsPanel: React.FC = () => {
    const {
        artifacts,
        activeArtifactId,
        setActiveArtifactId,
        artifactCreationMode,
        setArtifactCreationMode,
        onFinishArtifactCreation,
        primaryDataLayer,
        baseMapLayer,
        isAppendingWaypoints
    } = useAppContext();
    const isDataLoaded = !!primaryDataLayer || !!baseMapLayer;

    if (!isDataLoaded) {
        return (
          <div>
            <h2 className="text-lg font-semibold text-cyan-300">Artifacts</h2>
            <p className="text-sm text-gray-400 mt-2">Load a basemap or data layer to add artifacts.</p>
          </div>
        );
    }
  
    return (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-cyan-300">Artifacts</h2>
          {artifactCreationMode === 'path' ? (
            <div className="p-3 bg-cyan-900/50 border border-cyan-700 rounded-md text-sm text-cyan-200 space-y-3">
                <p><strong>Drawing Path:</strong> Click on the map to add waypoints. Press 'Esc' or click finish when done.</p>
                <button onClick={onFinishArtifactCreation} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-1.5 px-3 rounded-md text-sm transition-all">Finish Drawing</button>
            </div>
          ) : isAppendingWaypoints ? (
            <div className="p-3 bg-teal-900/50 border border-teal-700 rounded-md text-sm text-teal-200 space-y-3">
                <p><strong>Appending to Path:</strong> Click on the map to add new waypoints. Press 'Esc' or click finish to stop.</p>
                <button onClick={onFinishArtifactCreation} className="w-full bg-teal-600 hover:bg-teal-500 text-white font-semibold py-1.5 px-3 rounded-md text-sm transition-all">Finish Appending</button>
            </div>
          ) : (
            <>
                <p className="text-sm text-gray-400">Add and manage annotations on the map. Click a button below, then click on the map to place an artifact.</p>
                <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => setArtifactCreationMode('circle')} className="bg-teal-700 hover:bg-teal-600 text-white font-semibold py-2 px-2 rounded-md text-sm transition-all text-center">Add Circle</button>
                    <button onClick={() => setArtifactCreationMode('rectangle')} className="bg-indigo-700 hover:bg-indigo-600 text-white font-semibold py-2 px-2 rounded-md text-sm transition-all text-center">Add Rect</button>
                    <button onClick={() => setArtifactCreationMode('path')} className="bg-purple-700 hover:bg-purple-600 text-white font-semibold py-2 px-2 rounded-md text-sm transition-all text-center">Add Path</button>
                </div>
            </>
          )}

          <div className="space-y-2">
            {artifacts.length > 0 ? (
              [...artifacts].reverse().map(artifact => (
                <ArtifactItem 
                    key={artifact.id} 
                    artifact={artifact}
                    isActive={artifact.id === activeArtifactId}
                    onSelect={() => setActiveArtifactId(artifact.id === activeArtifactId ? null : artifact.id)}
                />
              ))
            ) : (
              <p className="text-sm text-gray-500 text-center p-4">No artifacts created.</p>
            )}
          </div>
        </div>
    );
};


const MeasurementPanel: React.FC = () => {
    const {
        primaryDataLayer,
        selectedCells,
        selectionColor,
        setSelectionColor,
        onClearSelection
    } = useAppContext();
    const isDataLoaded = !!primaryDataLayer;
    
    if (!isDataLoaded) {
        return (
          <div>
            <h2 className="text-lg font-semibold text-cyan-300">Measurement</h2>
            <p className="text-sm text-gray-400 mt-2">Load a data layer to select cells.</p>
          </div>
        );
    }

    return (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-cyan-300">Cell Selection</h2>
          <p className="text-sm text-gray-400">Click on the map to select or deselect individual cells.</p>
          <Section title="Selection Tools" defaultOpen={true}>
            <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Selected cells:</span>
                <span className="font-mono text-cyan-300">{selectedCells.length}</span>
            </div>
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">Highlight Color</label>
                <input 
                    type="color" 
                    value={selectionColor} 
                    onChange={(e) => setSelectionColor(e.target.value)} 
                    className="w-10 h-8 p-0 border-none rounded-md bg-transparent cursor-pointer" 
                />
            </div>
            <button 
                onClick={onClearSelection} 
                disabled={selectedCells.length === 0}
                className="w-full bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white font-semibold py-2 px-3 rounded-md text-sm transition-all"
            >
                Clear Selection
            </button>
          </Section>
        </div>
    );
};

const PlayIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>;
const StopIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>;

const ConfigurationPanel: React.FC = () => {
    const {
        primaryDataLayer, baseMapLayer, activeLayer, timeRange,
        showGraticule, setShowGraticule,
        graticuleDensity, setGraticuleDensity,
        selectedPixel,
        showGrid, setShowGrid,
        gridSpacing, setGridSpacing,
        gridColor, setGridColor,
        isPlaying, isPaused, playbackSpeed,
        onTogglePlay, onPlaybackSpeedChange,
        onImportConfig, onExportConfig,
        artifactDisplayOptions, setArtifactDisplayOptions,
        nightfallPlotYAxisRange, onNightfallPlotYAxisRangeChange,
    } = useAppContext();
    const isDataLoaded = !!primaryDataLayer || !!baseMapLayer;
    const importInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = () => importInputRef.current?.click();

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
          onImportConfig(e.target.files[0]);
          e.target.value = ''; // Reset input to allow selecting the same file again
      }
    };
  
    const isNightfallActive = activeLayer?.type === 'analysis' && activeLayer.analysisType === 'nightfall';

    return (
        <div className="space-y-4">
            <h2 className="text-lg font-semibold text-cyan-300">Configuration</h2>
            
            <Section title="Session Management" defaultOpen={true}>
              <input type="file" ref={importInputRef} onChange={handleFileSelect} accept=".json" style={{ display: 'none' }} />
              <div className="flex items-center gap-2">
                  <button onClick={handleImportClick} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-3 rounded-md text-sm transition-all">Import Config</button>
                  <button onClick={onExportConfig} disabled={!isDataLoaded} className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-gray-600 text-white font-semibold py-2 px-3 rounded-md text-sm transition-all">Export Config</button>
              </div>
            </Section>
            
            {!isDataLoaded ? <p className="text-sm text-gray-400 mt-2">Load a data layer or import a session to see more options.</p> : (
                <>
                  {isNightfallActive && (
                      <Section title="Plot Options" defaultOpen={true}>
                          <h4 className="text-sm font-medium text-gray-300 mb-2">Nightfall Plot Y-Axis Range</h4>
                          <div className="flex items-center gap-2">
                              <label className="text-xs text-gray-400">Min (days)</label>
                              <input type="number" step="1" value={nightfallPlotYAxisRange.min}
                                  onChange={e => onNightfallPlotYAxisRangeChange({ ...nightfallPlotYAxisRange, min: Number(e.target.value) })}
                                  className="w-full bg-gray-700 text-white text-sm rounded-md p-1 border border-gray-600" />
                              <label className="text-xs text-gray-400">Max (days)</label>
                              <input type="number" step="1" value={nightfallPlotYAxisRange.max}
                                  onChange={e => onNightfallPlotYAxisRangeChange({ ...nightfallPlotYAxisRange, max: Number(e.target.value) })}
                                  className="w-full bg-gray-700 text-white text-sm rounded-md p-1 border border-gray-600" />
                          </div>
                      </Section>
                  )}
                  <Section title="Time Animation">
                      <div className="flex items-center gap-4">
                          <button
                              onClick={onTogglePlay}
                              disabled={!isPlaying && !isPaused && (!timeRange || timeRange.start >= timeRange.end)}
                              className="flex items-center justify-center gap-2 w-28 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold py-2 px-3 rounded-md text-sm transition-all"
                              title={isPlaying ? "Stop" : isPaused ? "Resume Playback" : (!timeRange || timeRange.start >= timeRange.end ? "Select a time range on the slider to enable playback" : "Play")}
                          >
                              {isPlaying ? <StopIcon /> : <PlayIcon />}
                              <span>{isPlaying ? 'Stop' : isPaused ? 'Resume' : 'Play'}</span>
                          </button>
                          <div className="flex-grow">
                              <label className="block text-xs text-gray-400 mb-1">Speed: {playbackSpeed} FPS</label>
                              <input
                                  type="range"
                                  min="1"
                                  max="30"
                                  step="1"
                                  value={playbackSpeed}
                                  onChange={(e) => onPlaybackSpeedChange(Number(e.target.value))}
                                  disabled={isPlaying}
                                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50"
                              />
                          </div>
                      </div>
                  </Section>
                  <Section title="View Options" defaultOpen={true}>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showGraticule} onChange={(e) => setShowGraticule(e.target.checked)} className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500" /><span>Show Graticule</span></label>
                    {showGraticule && (
                      <div className="pt-3">
                        <label className="block text-sm font-medium text-gray-400">Density: {graticuleDensity.toFixed(1)}x</label>
                        <input type="range" min="0.2" max="5" step="0.1" value={graticuleDensity} onChange={(e) => setGraticuleDensity(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1" />
                      </div>
                    )}
                  </Section>
                  <Section title="Artifact Display Options">
                      <div>
                          <label className="block text-sm font-medium text-gray-400">Waypoint Dot Size: {artifactDisplayOptions.waypointDotSize}px</label>
                          <input type="range" min="2" max="20" step="1" 
                              value={artifactDisplayOptions.waypointDotSize}
                              onChange={(e) => setArtifactDisplayOptions({ ...artifactDisplayOptions, waypointDotSize: Number(e.target.value) })}
                              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1"
                          />
                      </div>
                       <div>
                          <label className="block text-sm font-medium text-gray-400">Label Font Size: {artifactDisplayOptions.labelFontSize}px</label>
                          <input type="range" min="8" max="24" step="1" 
                              value={artifactDisplayOptions.labelFontSize}
                              onChange={(e) => setArtifactDisplayOptions({ ...artifactDisplayOptions, labelFontSize: Number(e.target.value) })}
                              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1"
                          />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-300">
                          <input type="checkbox" 
                              checked={artifactDisplayOptions.showSegmentLengths}
                              onChange={(e) => setArtifactDisplayOptions({ ...artifactDisplayOptions, showSegmentLengths: e.target.checked })}
                              className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500" />
                          <span>Show Segment Lengths</span>
                      </label>
                  </Section>
                  <Section title="Grid Overlay">
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} className="w-4 h-4 text-cyan-600 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500" /><span>Show Grid Overlay</span></label>
                    {showGrid && (
                        <div className="pt-3 space-y-3 border-t border-gray-700/50 mt-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Spacing: {gridSpacing}m</label>
                                <input type="range" min="10" max="1000" step="10" value={gridSpacing} onChange={(e) => setGridSpacing(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mt-1" />
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-400">Color</label>
                                <input type="color" value={gridColor.slice(0, 7)} onChange={(e) => setGridColor(e.target.value + '80')} className="w-10 h-8 p-0 border-none rounded-md bg-transparent cursor-pointer" />
                            </div>
                        </div>
                    )}
                  </Section>
                  <Section title="Selected Pixel" defaultOpen={true}>
                    <div className="text-sm space-y-2">
                       <div className="flex justify-between"><span className="text-gray-400">Pixel (X, Y):</span><span className="font-mono text-green-400">{selectedPixel ? `${selectedPixel.x}, ${selectedPixel.y}`: '---'}</span></div>
                    </div>
                  </Section>
                </>
            )}
        </div>
    );
}

export const SidePanel: React.FC = () => {
    const { activeTool } = useAppContext();
    const renderPanel = () => {
        switch (activeTool) {
            case 'layers': return <LayersPanel />;
            case 'artifacts': return <ArtifactsPanel />;
            case 'measurement': return <MeasurementPanel />;
            case 'config': return <ConfigurationPanel />;
            default: return null;
        }
    };

    return (
        <aside className="bg-gray-800/50 border-r border-gray-700 p-4 w-80 flex-shrink-0 flex flex-col gap-6 overflow-y-auto">
            {renderPanel()}
        </aside>
    );
};