import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { parseNpy } from '../services/npyParser';
import { parseVrt } from '../services/vrtParser';
import * as analysisService from '../services/analysisService';
import type { DataSet, Layer, DataLayer, BaseMapLayer, AnalysisLayer, DaylightFractionHoverData, ColorStop, DteCommsLayer, LpfCommsLayer } from '../types';
import { useTimeContext } from './TimeContext';
import { useGlobalContext } from './GlobalContext';

export const sanitizeLayerNameForExpression = (name: string): string => {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
};

const dataUrlToImage = (dataUrl: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = dataUrl;
    });
};

interface LayersContextType {
    layers: Layer[];
    setLayers: React.Dispatch<React.SetStateAction<Layer[]>>;
    activeLayerId: string | null;
    setActiveLayerId: React.Dispatch<React.SetStateAction<string | null>>;
    isCreatingExpression: boolean;
    setIsCreatingExpression: React.Dispatch<React.SetStateAction<boolean>>;
    flickeringLayerId: string | null;
    daylightFractionHoverData: DaylightFractionHoverData | null; // This might move later if needed elsewhere

    // Derived State
    baseMapLayer: BaseMapLayer | undefined;
    primaryDataLayer: DataLayer | undefined;
    activeLayer: Layer | undefined;

    // Handlers
    onAddDataLayer: (file: File) => void;
    onAddDteCommsLayer: (file: File) => void;
    onAddLpfCommsLayer: (file: File) => void;
    onAddBaseMapLayer: (pngFile: File, vrtFile: File) => void;
    onUpdateLayer: (id: string, updates: Partial<Layer>) => void;
    onRemoveLayer: (id: string) => void;
    onCalculateNightfallLayer: (sourceLayerId: string) => void;
    onCalculateDaylightFractionLayer: (sourceLayerId: string) => void;
    onCreateExpressionLayer: (name: string, expression: string) => Promise<void>;
    onToggleFlicker: (layerId: string) => void;
}

const LayersContext = createContext<LayersContextType | null>(null);

export const useLayersContext = () => {
    const context = useContext(LayersContext);
    if (!context) {
        throw new Error("useLayersContext must be used within a LayersProvider");
    }
    return context;
};

export const LayersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { setIsLoading, sessionDataToRestore, setSessionDataToRestore } = useGlobalContext();
    const { timeRange, initializeTime } = useTimeContext();

    const [layers, setLayers] = useState<Layer[]>([]);
    const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
    const [isCreatingExpression, setIsCreatingExpression] = useState(false);
    const [flickeringLayerId, setFlickeringLayerId] = useState<string | null>(null);
    const [daylightFractionHoverData, setDaylightFractionHoverData] = useState<DaylightFractionHoverData | null>(null); // Kept here for now

    const flickerIntervalRef = useRef<number | null>(null);
    const originalVisibilityRef = useRef<boolean | null>(null);

    const baseMapLayer = useMemo(() => layers.find(l => l.type === 'basemap') as BaseMapLayer | undefined, [layers]);
    const primaryDataLayer = useMemo(() => layers.find(l => l.type === 'data') as DataLayer | undefined, [layers]);
    const activeLayer = useMemo(() => layers.find(l => l.id === activeLayerId), [layers, activeLayerId]);

    const onUpdateLayer = useCallback((id: string, updates: Partial<Layer>) => {
        setLayers(prevLayers =>
            prevLayers.map(l => (l.id === id ? ({ ...l, ...updates } as Layer) : l))
        );
    }, []);

    const onToggleFlicker = useCallback((layerId: string) => {
      const currentlyFlickeringId = flickeringLayerId;
      if (flickerIntervalRef.current) { clearInterval(flickerIntervalRef.current); flickerIntervalRef.current = null; }
      if (currentlyFlickeringId && originalVisibilityRef.current !== null) { onUpdateLayer(currentlyFlickeringId, { visible: originalVisibilityRef.current }); }
      if (currentlyFlickeringId === layerId) { setFlickeringLayerId(null); originalVisibilityRef.current = null; }
      else {
          const layerToFlicker = layers.find(l => l.id === layerId);
          if (layerToFlicker) { originalVisibilityRef.current = layerToFlicker.visible; setFlickeringLayerId(layerId); }
      }
    }, [layers, flickeringLayerId, onUpdateLayer]);

    useEffect(() => {
      if (flickeringLayerId) {
          flickerIntervalRef.current = window.setInterval(() => {
              setLayers(prevLayers => prevLayers.map(l => l.id === flickeringLayerId ? { ...l, visible: !l.visible } : l));
          }, 400);
      }
      return () => { if (flickerIntervalRef.current) { clearInterval(flickerIntervalRef.current); flickerIntervalRef.current = null; } };
    }, [flickeringLayerId]);
    
    const handleAddNpyLayer = useCallback(async (file: File, layerType: 'data' | 'dte_comms' | 'lpf_comms') => {
      if (!file) return;
      setIsLoading(`Parsing "${file.name}"...`);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const { data: float32Array, shape, header } = parseNpy(arrayBuffer);
        if (shape.length !== 3) throw new Error(`Expected a 3D array, but got ${shape.length} dimensions.`);
        
        const [height, width, time] = shape;
        let min = Infinity, max = -Infinity;
        for (const value of float32Array) { if (value < min) min = value; if (value > max) max = value; }

        const dataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width)));
        
        let flatIndex = 0;
        if (header.fortran_order) {
          for (let t = 0; t < time; t++) for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) dataset[t][y][x] = float32Array[flatIndex++];
        } else {
          for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let t = 0; t < time; t++) dataset[t][y][x] = float32Array[flatIndex++];
        }
        
        const newLayer: DataLayer | DteCommsLayer | LpfCommsLayer = {
          id: `${layerType}-${Date.now()}`, name: file.name, type: layerType, visible: true, opacity: 1.0,
          fileName: file.name, dataset, range: { min, max }, colormap: 'Viridis',
          colormapInverted: false,
          customColormap: [{ value: min, color: '#000000' }, { value: max, color: '#ffffff' }],
          dimensions: { time, height, width },
        };

        setLayers(prev => [...prev, newLayer]);
        setActiveLayerId(newLayer.id);

        if (layerType === 'data' && !primaryDataLayer) {
            initializeTime(time - 1);
        }
      } catch (error) {
        alert(`Error loading file: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsLoading(null);
      }
    }, [primaryDataLayer, setIsLoading, initializeTime]);

    const onAddDataLayer = useCallback((file: File) => handleAddNpyLayer(file, 'data'), [handleAddNpyLayer]);
    const onAddDteCommsLayer = useCallback((file: File) => handleAddNpyLayer(file, 'dte_comms'), [handleAddNpyLayer]);
    const onAddLpfCommsLayer = useCallback((file: File) => handleAddNpyLayer(file, 'lpf_comms'), [handleAddNpyLayer]);
    
    const onAddBaseMapLayer = useCallback(async (pngFile: File, vrtFile: File) => {
      setIsLoading(`Loading basemap "${pngFile.name}"...`);
      try {
          const vrtContent = await vrtFile.text();
          const vrtData = parseVrt(vrtContent);
          if (!vrtData) throw new Error("Failed to parse VRT file.");

          const image = await dataUrlToImage(URL.createObjectURL(pngFile));

          const newLayer: BaseMapLayer = {
              id: `basemap-${Date.now()}`, name: pngFile.name, type: 'basemap',
              visible: true, opacity: 1.0, image, vrt: vrtData,
              pngFileName: pngFile.name, vrtFileName: vrtFile.name,
          };

          setLayers(prev => [newLayer, ...prev.filter(l => l.type !== 'basemap')]);
          setActiveLayerId(newLayer.id);
      } catch (error) {
          alert(`Error processing base map: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
          setIsLoading(null);
      }
    }, [setIsLoading]);

    const onRemoveLayer = useCallback((id: string) => {
      setLayers(prev => prev.filter(l => l.id !== id));
      if (activeLayerId === id) setActiveLayerId(null);
    }, [activeLayerId]);
    
    const onCalculateNightfallLayer = useCallback(async (sourceLayerId: string) => {
      const sourceLayer = layers.find(l => l.id === sourceLayerId) as DataLayer | undefined;
      if (!sourceLayer) return;
      
      setIsLoading(`Forecasting nightfall for "${sourceLayer.name}"...`);
      try {
        const { dataset, range, maxDuration } = await analysisService.calculateNightfallDataset(sourceLayer);
        
        const transparent = 'rgba(0,0,0,0)';
        const fourteenDaysInHours = 14 * 24;

        const defaultCustomColormap: ColorStop[] = [
          { value: -Infinity, color: transparent },
          { value: -fourteenDaysInHours, color: 'cyan' },
          { value: 0, color: 'yellow' },
          { value: fourteenDaysInHours + 0.001, color: transparent }
        ];

        const defaultClip = Math.min(1000, Math.ceil(maxDuration / 24) * 24 || 24);

        const newLayer: AnalysisLayer = {
            id: `analysis-${Date.now()}`,
            name: `Nightfall Forecast for ${sourceLayer.name}`,
            type: 'analysis', analysisType: 'nightfall',
            visible: true, opacity: 1.0,
            colormap: 'Custom',
            colormapInverted: false,
            dataset, range,
            dimensions: sourceLayer.dimensions, sourceLayerId,
            customColormap: defaultCustomColormap,
            params: { clipValue: defaultClip },
        };

        setLayers(prev => [...prev, newLayer]);
        setActiveLayerId(newLayer.id);
      } catch(e) {
          alert(`Nightfall calculation failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setIsLoading(null);
      }
    }, [layers, setIsLoading]);

    const onCalculateDaylightFractionLayer = useCallback((sourceLayerId: string) => {
      const sourceLayer = layers.find(l => l.id === sourceLayerId) as DataLayer | undefined;
      if (!sourceLayer || !timeRange) return;

      const { slice, range } = analysisService.calculateDaylightFraction(sourceLayer.dataset, timeRange, sourceLayer.dimensions);
      
      const resultDataset: DataSet = Array.from({ length: sourceLayer.dimensions.time }, () => slice);

      const newLayer: AnalysisLayer = {
          id: `analysis-${Date.now()}`,
          name: `Daylight Fraction for ${sourceLayer.name}`,
          type: 'analysis', analysisType: 'daylight_fraction',
          visible: true, opacity: 1.0, colormap: 'Turbo',
          dataset: resultDataset, range,
          dimensions: sourceLayer.dimensions, sourceLayerId,
          params: {},
      };
      setLayers(prev => [...prev, newLayer]);
      setActiveLayerId(newLayer.id);
    }, [layers, timeRange]);

    const onCreateExpressionLayer = useCallback(async (name: string, expression: string) => {
      setIsLoading(`Calculating expression "${name}"...`);
      try {
          const { dataset, range, dimensions } = await analysisService.calculateExpressionLayer(expression, layers);

          const newLayer: AnalysisLayer = {
              id: `analysis-expr-${Date.now()}`, name, type: 'analysis', analysisType: 'expression',
              visible: true, opacity: 1.0, colormap: 'Custom',
              dataset, range, dimensions, sourceLayerId: undefined,
              customColormap: [ { value: -Infinity, color: 'rgba(0,0,0,0)' }, { value: 1, color: '#ffff00' } ],
              params: { expression },
          };
          setLayers(prev => [...prev, newLayer]);
          setActiveLayerId(newLayer.id);
          setIsCreatingExpression(false);
      } catch (e) {
          alert(`Expression Error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
          setIsLoading(null);
      }
    }, [layers, setIsLoading]);

    useEffect(() => {
      if (!timeRange) return;
      setLayers(currentLayers => {
          const fractionLayersToUpdate = currentLayers.filter(l => l.type === 'analysis' && l.analysisType === 'daylight_fraction');
          if (fractionLayersToUpdate.length === 0) return currentLayers;

          let hasChanged = false;
          const newLayers = currentLayers.map(l => {
              if (l.type === 'analysis' && l.analysisType === 'daylight_fraction') {
                  const sourceLayer = currentLayers.find(src => src.id === l.sourceLayerId) as DataLayer | undefined;
                  if (sourceLayer) {
                      const { slice, range } = analysisService.calculateDaylightFraction(sourceLayer.dataset, timeRange, sourceLayer.dimensions);
                      const newDataset = Array.from({ length: sourceLayer.dimensions.time }, () => slice);
                      hasChanged = true;
                      return { ...l, dataset: newDataset, range };
                  }
              }
              return l;
          });
          return hasChanged ? newLayers : currentLayers;
      });
    }, [timeRange]);

    useEffect(() => {
        // This effect handles restoring layer state from a session file
        const restore = async () => {
            if (!sessionDataToRestore) return;
            
            const { fileMap, ...config } = sessionDataToRestore as any;
            setIsLoading("Restoring session layers...");

            try {
                let newLayers: Layer[] = [];
                for (const sLayer of config.layers) {
                    if (sLayer.type === 'basemap') {
                        const pngFile = fileMap.get(sLayer.pngFileName);
                        const vrtFile = fileMap.get(sLayer.vrtFileName);
                        if (!pngFile || !vrtFile) throw new Error(`Missing file for basemap: ${sLayer.name}`);
                        
                        const vrtContent = await vrtFile.text();
                        const vrtData = parseVrt(vrtContent);
                        if (!vrtData) throw new Error(`Failed to parse VRT: ${vrtFile.name}`);
                        const image = await dataUrlToImage(URL.createObjectURL(pngFile));
                        newLayers.push({ ...sLayer, image, vrt: vrtData });
                    } else if (sLayer.type === 'data' || sLayer.type === 'dte_comms' || sLayer.type === 'lpf_comms') {
                        const file = fileMap.get(sLayer.fileName);
                        if (!file) throw new Error(`Missing file: ${sLayer.fileName}`);
                        
                        const arrayBuffer = await file.arrayBuffer();
                        const { data: float32Array, shape, header } = parseNpy(arrayBuffer);
                        const [height, width, time] = shape;
                        const dataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width)));
                        let flatIndex = 0;
                        if (header.fortran_order) { for (let t = 0; t < time; t++) for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) dataset[t][y][x] = float32Array[flatIndex++]; }
                        else { for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let t = 0; t < time; t++) dataset[t][y][x] = float32Array[flatIndex++]; }
                        newLayers.push({ ...sLayer, dataset });
                    }
                }
                
                let finalLayers = [...newLayers];
                for (const sLayer of config.layers) {
                    if (sLayer.type === 'analysis') {
                        let calculatedDataset: DataSet;
                        if (sLayer.analysisType === 'expression' && sLayer.params.expression) {
                            const { dataset } = await analysisService.calculateExpressionLayer(sLayer.params.expression, finalLayers);
                            calculatedDataset = dataset;
                        } else {
                            const sourceLayer = finalLayers.find(l => l.id === sLayer.sourceLayerId) as DataLayer | undefined;
                            if (!sourceLayer) throw new Error(`Source layer missing for ${sLayer.name}`);
                            if (sLayer.analysisType === 'nightfall') {
                                const { dataset } = await analysisService.calculateNightfallDataset(sourceLayer);
                                calculatedDataset = dataset;
                            } else {
                                const calcTimeRange = config.timeRange || { start: 0, end: sourceLayer.dimensions.time - 1};
                                const { slice } = analysisService.calculateDaylightFraction(sourceLayer.dataset, calcTimeRange, sourceLayer.dimensions);
                                calculatedDataset = Array.from({ length: sourceLayer.dimensions.time }, () => slice);
                            }
                        }
                        finalLayers.push({ ...sLayer, dataset: calculatedDataset });
                    }
                }
                
                setLayers(finalLayers);
                setActiveLayerId(config.activeLayerId);
                
                // After setting layers, find the primary one and initialize time state
                const primaryLayerRestored = finalLayers.find(l => l.type === 'data') as DataLayer | undefined;
                if (primaryLayerRestored) {
                    initializeTime(primaryLayerRestored.dimensions.time - 1);
                }
                
                // Signal that this context is done restoring
                setSessionDataToRestore(prev => prev ? ({ ...prev, layersRestored: true } as any) : null);

            } catch(e) {
                alert(`Error restoring session layers: ${e instanceof Error ? e.message : String(e)}`);
                setSessionDataToRestore(null); // Clear on error
            } finally {
                setIsLoading(null);
            }
        };
        restore();
    }, [sessionDataToRestore, setIsLoading, setSessionDataToRestore, initializeTime]);

    useEffect(() => {
        // Clean up the worker when the provider unmounts
        return () => analysisService.terminateWorker();
    }, []);

    const value: LayersContextType = {
        layers, setLayers,
        activeLayerId, setActiveLayerId,
        isCreatingExpression, setIsCreatingExpression,
        flickeringLayerId,
        daylightFractionHoverData,
        baseMapLayer, primaryDataLayer, activeLayer,
        onAddDataLayer, onAddDteCommsLayer, onAddLpfCommsLayer, onAddBaseMapLayer,
        onUpdateLayer, onRemoveLayer,
        onCalculateNightfallLayer, onCalculateDaylightFractionLayer,
        onCreateExpressionLayer, onToggleFlicker
    };

    return <LayersContext.Provider value={value}>{children}</LayersContext.Provider>;
};
