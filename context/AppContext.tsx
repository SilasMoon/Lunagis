import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { parseNpy } from '../services/npyParser';
import { parseVrt } from '../services/vrtParser';
import type { DataSet, DataSlice, GeoCoordinates, VrtData, ViewState, TimeRange, PixelCoords, TimeDomain, Tool, Layer, DataLayer, BaseMapLayer, AnalysisLayer, DaylightFractionHoverData, AppStateConfig, SerializableLayer, Artifact, CircleArtifact, RectangleArtifact, PathArtifact, SerializableArtifact, Waypoint, ColorStop, DteCommsLayer, LpfCommsLayer } from '../types';
import { indexToDate } from '../utils/time';
import * as analysisService from '../services/analysisService';

// Geographic bounding box for the data
const LAT_RANGE: [number, number] = [-85.505, -85.26];
const LON_RANGE: [number, number] = [28.97, 32.53];

declare const proj4: any;

const dataUrlToImage = (dataUrl: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = dataUrl;
    });
};

interface AppContextType {
    // State
    layers: Layer[];
    activeLayerId: string | null;
    isLoading: string | null;
    timeRange: TimeRange | null;
    hoveredCoords: GeoCoordinates;
    showGraticule: boolean;
    viewState: ViewState | null;
    graticuleDensity: number;
    activeTool: Tool;
    selectedPixel: (PixelCoords & { layerId: string; }) | null;
    timeSeriesData: { data: number[]; range: { min: number; max: number; }; } | null;
    timeZoomDomain: TimeDomain | null;
    daylightFractionHoverData: DaylightFractionHoverData | null;
    flickeringLayerId: string | null;
    showGrid: boolean;
    gridSpacing: number;
    gridColor: string;
    selectedCells: { x: number; y: number; }[];
    selectionColor: string;
    isPlaying: boolean;
    isPaused: boolean;
    playbackSpeed: number;
    importRequest: { config: AppStateConfig; requiredFiles: string[]; } | null;
    artifacts: Artifact[];
    activeArtifactId: string | null;
    artifactCreationMode: "circle" | "rectangle" | "path" | null;
    isAppendingWaypoints: boolean;
    draggedInfo: { artifactId: string; waypointId?: string; initialMousePos: [number, number]; initialCenter?: [number, number]; initialWaypointProjPositions?: [number, number][]; } | null;
    artifactDisplayOptions: { waypointDotSize: number; showSegmentLengths: boolean; labelFontSize: number; };
    nightfallPlotYAxisRange: { min: number; max: number; };
    isCreatingExpression: boolean;
    
    // Derived State
    baseMapLayer: BaseMapLayer | undefined;
    primaryDataLayer: DataLayer | undefined;
    activeLayer: Layer | undefined;
    proj: any;
    fullTimeDomain: TimeDomain | null;
    coordinateTransformer: ((lat: number, lon: number) => PixelCoords) | null;

    // Setters & Handlers
    setLayers: React.Dispatch<React.SetStateAction<Layer[]>>;
    setActiveLayerId: React.Dispatch<React.SetStateAction<string | null>>;
    setIsLoading: React.Dispatch<React.SetStateAction<string | null>>;
    setTimeRange: React.Dispatch<React.SetStateAction<TimeRange | null>>;
    setHoveredCoords: React.Dispatch<React.SetStateAction<GeoCoordinates>>;
    setShowGraticule: React.Dispatch<React.SetStateAction<boolean>>;
    setViewState: React.Dispatch<React.SetStateAction<ViewState | null>>;
    setGraticuleDensity: React.Dispatch<React.SetStateAction<number>>;
    onToolSelect: (tool: Tool) => void;
    setSelectedPixel: React.Dispatch<React.SetStateAction<(PixelCoords & { layerId: string; }) | null>>;
    setTimeZoomDomain: React.Dispatch<React.SetStateAction<TimeDomain | null>>;
    onToggleFlicker: (layerId: string) => void;
    setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
    setGridSpacing: React.Dispatch<React.SetStateAction<number>>;
    setGridColor: React.Dispatch<React.SetStateAction<string>>;
    setSelectedCells: React.Dispatch<React.SetStateAction<{ x: number; y: number; }[]>>;
    setSelectionColor: React.Dispatch<React.SetStateAction<string>>;
    setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
    setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
    onPlaybackSpeedChange: (speed: number) => void;
    setImportRequest: React.Dispatch<React.SetStateAction<{ config: AppStateConfig; requiredFiles: string[]; } | null>>;
    setArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>;
    setActiveArtifactId: React.Dispatch<React.SetStateAction<string | null>>;
    setArtifactCreationMode: React.Dispatch<React.SetStateAction<"circle" | "rectangle" | "path" | null>>;
    setIsAppendingWaypoints: React.Dispatch<React.SetStateAction<boolean>>;
    setDraggedInfo: React.Dispatch<React.SetStateAction<{ artifactId: string; waypointId?: string; initialMousePos: [number, number]; initialCenter?: [number, number]; initialWaypointProjPositions?: [number, number][]; } | null>>;
    setArtifactDisplayOptions: React.Dispatch<React.SetStateAction<{ waypointDotSize: number; showSegmentLengths: boolean; labelFontSize: number; }>>;
    onNightfallPlotYAxisRangeChange: (range: { min: number; max: number; }) => void;
    setIsCreatingExpression: React.Dispatch<React.SetStateAction<boolean>>;

    clearHoverState: () => void;
    onAddDataLayer: (file: File) => void;
    onAddDteCommsLayer: (file: File) => void;
    onAddLpfCommsLayer: (file: File) => void;
    onAddBaseMapLayer: (pngFile: File, vrtFile: File) => void;
    onUpdateLayer: (id: string, updates: Partial<Layer>) => void;
    onRemoveLayer: (id: string) => void;
    onCalculateNightfallLayer: (sourceLayerId: string) => void;
    onCalculateDaylightFractionLayer: (sourceLayerId: string) => void;
    onCreateExpressionLayer: (name: string, expression: string) => Promise<void>;
    onRecalculateExpressionLayer: (layerId: string, newExpression: string) => Promise<void>;
    handleManualTimeRangeChange: (newRange: TimeRange) => void;
    onTogglePlay: () => void;
    onUpdateArtifact: (id: string, updates: Partial<Artifact>) => void;
    onRemoveArtifact: (id: string) => void;
    onFinishArtifactCreation: () => void;
    onStartAppendWaypoints: () => void;
    onClearSelection: () => void;
    onZoomToSelection: () => void;
    onResetZoom: () => void;
    onExportConfig: () => Promise<void>;
    onImportConfig: (file: File) => void;
    handleRestoreSession: (config: AppStateConfig, files: FileList | File[]) => Promise<void>;

    latRange: [number, number];
    lonRange: [number, number];
}

const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error("useAppContext must be used within an AppProvider");
    }
    return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [layers, setLayers] = useState<Layer[]>([]);
    const [activeLayerId, setActiveLayerId] = useState<string | null>(null);

    const [isLoading, setIsLoading] = useState<string | null>(null);
    const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
    const [hoveredCoords, setHoveredCoords] = useState<GeoCoordinates>(null);
    const [showGraticule, setShowGraticule] = useState<boolean>(true);
    const [viewState, setViewState] = useState<ViewState | null>(null);
    const [graticuleDensity, setGraticuleDensity] = useState(1.0);
    const [activeTool, setActiveTool] = useState<Tool>('layers');
    
    const [selectedPixel, setSelectedPixel] = useState<PixelCoords & { layerId: string } | null>(null);
    const [timeSeriesData, setTimeSeriesData] = useState<{data: number[], range: {min: number, max: number}} | null>(null);
    const [timeZoomDomain, setTimeZoomDomain] = useState<TimeDomain | null>(null);
    const [daylightFractionHoverData, setDaylightFractionHoverData] = useState<DaylightFractionHoverData | null>(null);
    
    const [flickeringLayerId, setFlickeringLayerId] = useState<string | null>(null);
    const flickerIntervalRef = useRef<number | null>(null);
    const originalVisibilityRef = useRef<boolean | null>(null);

    const [showGrid, setShowGrid] = useState<boolean>(false);
    const [gridSpacing, setGridSpacing] = useState<number>(200);
    const [gridColor, setGridColor] = useState<string>('#ffffff80');
    
    const [selectedCells, setSelectedCells] = useState<{x: number, y: number}[]>([]);
    const [selectionColor, setSelectionColor] = useState<string>('#ffff00');

    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isPaused, setIsPaused] = useState<boolean>(false);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(10);
    const animationFrameId = useRef<number | null>(null);
    const lastFrameTime = useRef<number>(0);
    const playbackRange = useRef<{start: number, end: number} | null>(null);

    const [importRequest, setImportRequest] = useState<{ config: AppStateConfig, requiredFiles: string[] } | null>(null);

    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
    const [artifactCreationMode, setArtifactCreationMode] = useState<Artifact['type'] | null>(null);
    const [isAppendingWaypoints, setIsAppendingWaypoints] = useState<boolean>(false);
    const [draggedInfo, setDraggedInfo] = useState<{
      artifactId: string;
      waypointId?: string;
      initialMousePos: [number, number];
      initialCenter?: [number, number];
      initialWaypointProjPositions?: [number, number][];
    } | null>(null);
    const [artifactDisplayOptions, setArtifactDisplayOptions] = useState({
      waypointDotSize: 8,
      showSegmentLengths: true,
      labelFontSize: 14,
    });
    const [nightfallPlotYAxisRange, setNightfallPlotYAxisRange] = useState<{ min: number; max: number; }>({ min: -15, max: 15 });

    const [isCreatingExpression, setIsCreatingExpression] = useState(false);

    const baseMapLayer = useMemo(() => layers.find(l => l.type === 'basemap') as BaseMapLayer | undefined, [layers]);
    const primaryDataLayer = useMemo(() => layers.find(l => l.type === 'data') as DataLayer | undefined, [layers]);
    const activeLayer = useMemo(() => layers.find(l => l.id === activeLayerId), [layers, activeLayerId]);
    
    const proj = useMemo(() => (baseMapLayer ? proj4(baseMapLayer.vrt.srs) : null), [baseMapLayer]);

    const clearHoverState = () => {
      setHoveredCoords(null);
      setSelectedPixel(null);
    };

    const fullTimeDomain: TimeDomain | null = useMemo(() => {
      if (!primaryDataLayer) return null;
      return [indexToDate(0), indexToDate(primaryDataLayer.dimensions.time - 1)];
    }, [primaryDataLayer]);

    const coordinateTransformer = useMemo(() => {
      if (!primaryDataLayer) return null;
      const { width, height } = primaryDataLayer.dimensions;
      const [lonMin, lonMax] = LON_RANGE;
      const [latMin, latMax] = LAT_RANGE;

      if (proj) {
        const c_tl = proj.forward([lonMin, latMax]); const c_tr = proj.forward([lonMax, latMax]);
        const c_bl = proj.forward([lonMin, latMin]);
        const a = (c_tr[0] - c_tl[0]) / width; const b = (c_tr[1] - c_tl[1]) / width;
        const c = (c_bl[0] - c_tl[0]) / height; const d = (c_bl[1] - c_tl[1]) / height;
        const e = c_tl[0]; const f = c_tl[1];
        const determinant = a * d - b * c;
        if (Math.abs(determinant) < 1e-9) return null;

        return (lat: number, lon: number): PixelCoords => {
          try {
            const [projX, projY] = proj.forward([lon, lat]);
            const u = (d * (projX - e) - c * (projY - f)) / determinant;
            const v = (a * (projY - f) - b * (projX - e)) / determinant;
            const pixelX = Math.round(u); const pixelY = Math.round(v);
            if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
              return { x: pixelX, y: pixelY };
            }
            return null;
          } catch (error) { return null; }
        };
      }
      return null;
    }, [proj, primaryDataLayer]);
    
    useEffect(() => {
      if (selectedPixel) {
          const layer = layers.find(l => l.id === selectedPixel.layerId);
          if (layer?.type === 'data' || (layer?.type === 'analysis') || layer?.type === 'dte_comms' || layer?.type === 'lpf_comms') {
              const series = layer.dataset.map(slice => slice[selectedPixel.y][selectedPixel.x]);
              setTimeSeriesData({data: series, range: layer.range});
          } else {
              setTimeSeriesData(null);
          }
      } else {
          setTimeSeriesData(null);
      }
    }, [selectedPixel, layers]);

    useEffect(() => {
      if (activeLayerId && selectedPixel && timeRange) {
        const activeLayer = layers.find(l => l.id === activeLayerId);
        if (activeLayer?.type === 'analysis' && activeLayer.analysisType === 'daylight_fraction') {
          const sourceLayer = layers.find(l => l.id === activeLayer.sourceLayerId) as DataLayer | undefined;
          if (sourceLayer) {
            const { x, y } = selectedPixel;
            const { start, end } = timeRange;
            const totalHours = end - start + 1;
            let dayHours = 0;
            
            let longestDay = 0, shortestDay = Infinity, dayPeriods = 0;
            let longestNight = 0, shortestNight = Infinity, nightPeriods = 0;
            let currentPeriodType: 'day' | 'night' | null = null;
            let currentPeriodLength = 0;

            for (let t = start; t <= end; t++) {
              if (t >= sourceLayer.dataset.length) continue;
              const value = sourceLayer.dataset[t][y][x];
              if (value === 1) dayHours++;

              const currentType = value === 1 ? 'day' : 'night';
              if (currentPeriodType !== currentType) {
                if (currentPeriodType === 'day') {
                  dayPeriods++;
                  if (currentPeriodLength > longestDay) longestDay = currentPeriodLength;
                  if (currentPeriodLength < shortestDay) shortestDay = currentPeriodLength;
                } else if (currentPeriodType === 'night') {
                  nightPeriods++;
                  if (currentPeriodLength > longestNight) longestNight = currentPeriodLength;
                  if (currentPeriodLength < shortestNight) shortestNight = currentPeriodLength;
                }
                currentPeriodType = currentType;
                currentPeriodLength = 1;
              } else {
                currentPeriodLength++;
              }
            }
            
            if (currentPeriodType === 'day') {
               dayPeriods++;
               if (currentPeriodLength > longestDay) longestDay = currentPeriodLength;
               if (currentPeriodLength < shortestDay) shortestDay = currentPeriodLength;
            } else if (currentPeriodType === 'night') {
               nightPeriods++;
               if (currentPeriodLength > longestNight) longestNight = currentPeriodLength;
               if (currentPeriodLength < shortestNight) shortestNight = currentPeriodLength;
            }

            const nightHours = totalHours - dayHours;
            const fraction = totalHours > 0 ? (dayHours / totalHours) * 100 : 0;
            
            setDaylightFractionHoverData({
              fraction, dayHours, nightHours,
              longestDayPeriod: longestDay,
              shortestDayPeriod: shortestDay === Infinity ? 0 : shortestDay,
              dayPeriods,
              longestNightPeriod: longestNight,
              shortestNightPeriod: shortestNight === Infinity ? 0 : shortestNight,
              nightPeriods
            });
            return;
          }
        }
      }
      setDaylightFractionHoverData(null);
    }, [selectedPixel, activeLayerId, layers, timeRange]);

    const handleAddNpyLayer = useCallback(async (file: File, layerType: 'data' | 'dte_comms' | 'lpf_comms') => {
      if (!file) return;
      setIsLoading(`Parsing "${file.name}"...`);
      const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
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
          for (let t = 0; t < time; t++) { for (let x = 0; x < width; x++) { for (let y = 0; y < height; y++) { dataset[t][y][x] = float32Array[flatIndex++]; } } if (t % 100 === 0) await yieldToMain(); }
        } else {
          for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) { for (let t = 0; t < time; t++) { dataset[t][y][x] = float32Array[flatIndex++]; } } if (y % 10 === 0) await yieldToMain(); }
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
          const initialTimeRange = { start: 0, end: time - 1 };
          setTimeRange(initialTimeRange);
          setTimeZoomDomain([indexToDate(0), indexToDate(time - 1)]);
          setViewState(null);
        }
      } catch (error) {
        alert(`Error loading file: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsLoading(null);
      }
    }, [primaryDataLayer]);

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
          setViewState(null);
      } catch (error) {
          alert(`Error processing base map: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
          setIsLoading(null);
      }
    }, []);

    const onUpdateLayer = useCallback((id: string, updates: Partial<Layer>) => {
      setLayers(prevLayers =>
        prevLayers.map(l => (l.id === id ? ({ ...l, ...updates } as Layer) : l))
      );
    }, []);

    const onRemoveLayer = useCallback((id: string) => {
      setLayers(prev => prev.filter(l => l.id !== id));
      if (activeLayerId === id) setActiveLayerId(null);
    }, [activeLayerId]);
    
    const onCalculateNightfallLayer = useCallback(async (sourceLayerId: string) => {
      const sourceLayer = layers.find(l => l.id === sourceLayerId) as DataLayer | undefined;
      if (!sourceLayer) return;

      setIsLoading(`Forecasting nightfall for "${sourceLayer.name}"...`);
      await new Promise(r => setTimeout(r, 50));
      
      const { dataset, range, maxDuration } = await analysisService.calculateNightfallDataset(sourceLayer);
      
      const transparent = 'rgba(0,0,0,0)';
      const fourteenDaysInHours = 14 * 24; // 336

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
      setIsLoading(null);
    }, [layers]);

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
      await new Promise(r => setTimeout(r, 50));
      try {
          const { dataset, range, dimensions } = await analysisService.calculateExpressionLayer(
              expression,
              layers,
              (progressMsg) => setIsLoading(progressMsg) // Pass progress callback
          );

          const newLayer: AnalysisLayer = {
              id: `analysis-expr-${Date.now()}`,
              name: name,
              type: 'analysis',
              analysisType: 'expression',
              visible: true,
              opacity: 1.0,
              colormap: 'Custom',
              dataset, range, dimensions,
              sourceLayerId: undefined, // Expression layers don't have a single source
              customColormap: [
                  { value: -Infinity, color: 'rgba(0,0,0,0)' },
                  { value: 1, color: '#ffff00' }
              ],
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
    }, [layers]);

    const onRecalculateExpressionLayer = useCallback(async (layerId: string, newExpression: string) => {
      const layer = layers.find(l => l.id === layerId);
      if (!layer || layer.type !== 'analysis' || layer.analysisType !== 'expression') {
          alert('Invalid layer for expression recalculation');
          return;
      }

      setIsLoading(`Recalculating expression "${layer.name}"...`);
      await new Promise(r => setTimeout(r, 50));
      try {
          const { dataset, range, dimensions } = await analysisService.calculateExpressionLayer(
              newExpression,
              layers,
              (progressMsg) => setIsLoading(progressMsg)
          );

          // Update the existing layer with new dataset and expression
          setLayers(prev => prev.map(l => {
              if (l.id === layerId) {
                  return {
                      ...l,
                      dataset,
                      range,
                      dimensions,
                      params: { ...l.params, expression: newExpression }
                  } as AnalysisLayer;
              }
              return l;
          }));
      } catch (e) {
          alert(`Expression Error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
          setIsLoading(null);
      }
    }, [layers]);

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
      if (!isPlaying) {
          if (animationFrameId.current) { cancelAnimationFrame(animationFrameId.current); animationFrameId.current = null; }
          return;
      }
      const animate = (timestamp: number) => {
          if (lastFrameTime.current === 0) lastFrameTime.current = timestamp;
          const elapsed = timestamp - lastFrameTime.current;
          const frameDuration = 1000 / playbackSpeed;
          if (elapsed >= frameDuration) {
              lastFrameTime.current = timestamp;
              setTimeRange(currentRange => {
                  if (!currentRange || !playbackRange.current) return currentRange;
                  let newTime = currentRange.start + 1;
                  if (newTime > playbackRange.current.end) newTime = playbackRange.current.start;
                  return { start: newTime, end: newTime };
              });
          }
          animationFrameId.current = requestAnimationFrame(animate);
      };
      animationFrameId.current = requestAnimationFrame(animate);
      return () => { if (animationFrameId.current) { cancelAnimationFrame(animationFrameId.current); animationFrameId.current = null; lastFrameTime.current = 0; } };
    }, [isPlaying, playbackSpeed]);

    const onTogglePlay = useCallback(() => {
      const aboutToPlay = !isPlaying;
      if (aboutToPlay) {
          if (!isPaused) { 
              if (!timeRange || timeRange.start >= timeRange.end) return;
              playbackRange.current = { ...timeRange };
              setTimeRange({ start: timeRange.start, end: timeRange.start });
          }
          setIsPaused(false);
          setIsPlaying(true);
      } else {
          setIsPaused(true);
          setIsPlaying(false);
      }
    }, [isPlaying, isPaused, timeRange]);

    const handleManualTimeRangeChange = (newRange: TimeRange) => {
      if (isPlaying) setIsPlaying(false);
      setIsPaused(false);
      playbackRange.current = null;
      setTimeRange(newRange);
    };

    const onUpdateArtifact = useCallback((id: string, updates: Partial<Artifact>) => {
      setArtifacts(prev => prev.map(a => (a.id === id ? { ...a, ...updates } as Artifact : a)));
    }, []);

    const onFinishArtifactCreation = useCallback(() => {
      setArtifactCreationMode(null);
      setIsAppendingWaypoints(false);
    }, []);
    
    const onStartAppendWaypoints = useCallback(() => {
      setIsAppendingWaypoints(true);
    }, []);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
              onFinishArtifactCreation();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onFinishArtifactCreation]);

    const onRemoveArtifact = useCallback((id: string) => {
      setArtifacts(prev => prev.filter(a => a.id !== id));
      if (activeArtifactId === id) setActiveArtifactId(null);
    }, [activeArtifactId]);

    const onClearSelection = useCallback(() => { setSelectedCells([]); }, []);

    const onZoomToSelection = useCallback(() => {
      if (!timeRange || !fullTimeDomain) return;
      let newDomain: TimeDomain;
      if (timeRange.start === timeRange.end) {
          const centerDate = indexToDate(timeRange.start);
          const twelveHours = 12 * 60 * 60 * 1000;
          newDomain = [ new Date(Math.max(fullTimeDomain[0].getTime(), centerDate.getTime() - twelveHours)), new Date(Math.min(fullTimeDomain[1].getTime(), centerDate.getTime() + twelveHours)) ];
      } else {
          newDomain = [indexToDate(timeRange.start), indexToDate(timeRange.end)];
      }
      setTimeZoomDomain(newDomain);
    }, [timeRange, fullTimeDomain]);

    const onResetZoom = useCallback(() => { if (fullTimeDomain) setTimeZoomDomain(fullTimeDomain); }, [fullTimeDomain]);

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
    
    const onExportConfig = useCallback(async () => {
      if (layers.length === 0) { alert("Cannot export an empty session."); return; }
      setIsLoading("Exporting session...");
      try {
          const serializableLayers: SerializableLayer[] = layers.map((l): SerializableLayer => {
              if (l.type === 'basemap') {
                  const { image, ...rest } = l; // Omit non-serializable image element
                  return rest;
              } else { // data, analysis, or comms
                  const { dataset, ...rest } = l; // Omit large dataset
                  return rest;
              }
          });

          const config: AppStateConfig = {
              version: 1,
              layers: serializableLayers,
              activeLayerId,
              timeRange,
              timeZoomDomain: timeZoomDomain ? [timeZoomDomain[0].toISOString(), timeZoomDomain[1].toISOString()] : null,
              viewState,
              showGraticule,
              graticuleDensity,
              showGrid,
              gridSpacing,
              gridColor,
              selectedCells,
              selectionColor,
              activeTool,
              artifacts: artifacts.map(a => ({...a})),
              artifactDisplayOptions,
              nightfallPlotYAxisRange,
          };
          
          const jsonString = JSON.stringify(config, null, 2);
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `session_${new Date().toISOString()}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (e) {
          alert(`Error exporting session: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
          setIsLoading(null);
      }
    }, [layers, activeLayerId, timeRange, timeZoomDomain, viewState, showGraticule, graticuleDensity, showGrid, gridSpacing, gridColor, selectedCells, selectionColor, activeTool, artifacts, artifactDisplayOptions, nightfallPlotYAxisRange]);

    const onImportConfig = useCallback((file: File) => {
      setIsLoading("Reading config file...");
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const config = JSON.parse(event.target?.result as string) as AppStateConfig;
              if (config.version !== 1) { throw new Error("Unsupported config version."); }
              
              const requiredFiles: string[] = [];
              for (const l of config.layers) {
                  if (l.type === 'data' || l.type === 'dte_comms' || l.type === 'lpf_comms') {
                      requiredFiles.push(l.fileName);
                  } else if (l.type === 'basemap') {
                      requiredFiles.push(l.pngFileName);
                      requiredFiles.push(l.vrtFileName);
                  }
              }

              if (requiredFiles.length > 0) {
                  setImportRequest({ config, requiredFiles });
              } else {
                  handleRestoreSession(config, []); // No files required
              }
          } catch (e) {
              alert(`Error reading config file: ${e instanceof Error ? e.message : String(e)}`);
          } finally {
              setIsLoading(null);
          }
      };
      reader.onerror = () => {
          alert("Failed to read the file.");
          setIsLoading(null);
      };
      reader.readAsText(file);
    }, []);
    
    const handleRestoreSession = useCallback(async (config: AppStateConfig, files: FileList | File[]) => {
      setImportRequest(null);
      setIsLoading("Restoring session...");

      try {
          const fileMap = new Map<string, File>();
          Array.from(files).forEach(f => fileMap.set(f.name, f));

          // Reset state
          setLayers([]); setTimeRange(null); setTimeZoomDomain(null); setViewState(null); setSelectedCells([]); setArtifacts([]);

          let newLayers: Layer[] = [];

          // 1. Load BaseMap and Data layers
          for (const sLayer of config.layers) {
              if (sLayer.type === 'basemap') {
                  const pngFile = fileMap.get(sLayer.pngFileName);
                  const vrtFile = fileMap.get(sLayer.vrtFileName);
                  if (!pngFile) throw new Error(`Required file "${sLayer.pngFileName}" was not provided.`);
                  if (!vrtFile) throw new Error(`Required file "${sLayer.vrtFileName}" was not provided.`);
                  
                  const vrtContent = await vrtFile.text();
                  const vrtData = parseVrt(vrtContent);
                  if (!vrtData) throw new Error(`Failed to parse VRT file: ${vrtFile.name}`);

                  const image = await dataUrlToImage(URL.createObjectURL(pngFile));

                  const layer: BaseMapLayer = { ...sLayer, image, vrt: vrtData };
                  newLayers.push(layer);

              } else if (sLayer.type === 'data' || sLayer.type === 'dte_comms' || sLayer.type === 'lpf_comms') {
                  const file = fileMap.get(sLayer.fileName);
                  if (!file) throw new Error(`Required file "${sLayer.fileName}" was not provided.`);
                  
                  const arrayBuffer = await file.arrayBuffer();
                  const { data: float32Array, shape, header } = parseNpy(arrayBuffer);
                  const [height, width, time] = shape;
                  const dataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width)));
                  let flatIndex = 0;
                  if (header.fortran_order) { for (let t = 0; t < time; t++) for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) dataset[t][y][x] = float32Array[flatIndex++]; }
                  else { for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let t = 0; t < time; t++) dataset[t][y][x] = float32Array[flatIndex++]; }

                  const layer: DataLayer | DteCommsLayer | LpfCommsLayer = { ...sLayer, dataset };
                  newLayers.push(layer);
              }
          }
          
          // 2. Re-calculate Analysis layers in a second pass
          let finalLayers = [...newLayers];
          for (const sLayer of config.layers) {
              if (sLayer.type === 'analysis') {
                  let calculatedDataset: DataSet;
                  let finalAnalysisLayer: AnalysisLayer;
                  
                  if (sLayer.analysisType === 'expression' && sLayer.params.expression) {
                      const { dataset } = await analysisService.calculateExpressionLayer(
                          sLayer.params.expression,
                          finalLayers,
                          (progressMsg) => setIsLoading(progressMsg)
                      );
                      calculatedDataset = dataset;
                      finalAnalysisLayer = { ...sLayer, dataset: calculatedDataset };
                  } else {
                      const sourceLayer = finalLayers.find(l => l.id === sLayer.sourceLayerId) as DataLayer | undefined;
                      if (!sourceLayer) throw new Error(`Source layer with ID ${sLayer.sourceLayerId} not found for analysis layer "${sLayer.name}".`);
                      
                      if (sLayer.analysisType === 'nightfall') {
                          const { dataset } = await analysisService.calculateNightfallDataset(sourceLayer);
                          calculatedDataset = dataset;
                      } else { // daylight_fraction
                          const calcTimeRange = config.timeRange || { start: 0, end: sourceLayer.dimensions.time - 1};
                          const { slice } = analysisService.calculateDaylightFraction(sourceLayer.dataset, calcTimeRange, sourceLayer.dimensions);
                          calculatedDataset = Array.from({ length: sourceLayer.dimensions.time }, () => slice);
                      }
                      finalAnalysisLayer = { ...sLayer, dataset: calculatedDataset };
                  }
                  finalLayers.push(finalAnalysisLayer);
              }
          }
          
          // 3. Set final state
          setLayers(finalLayers);
          setActiveLayerId(config.activeLayerId);
          setTimeRange(config.timeRange);
          setViewState(config.viewState);
          setShowGraticule(config.showGraticule);
          setGraticuleDensity(config.graticuleDensity);
          setShowGrid(config.showGrid);
          setGridSpacing(config.gridSpacing);
          setGridColor(config.gridColor);
          setSelectedCells(config.selectedCells);
          setSelectionColor(config.selectionColor);
          setActiveTool(config.activeTool);
          setArtifacts(config.artifacts || []);
          if (config.timeZoomDomain) {
              setTimeZoomDomain([new Date(config.timeZoomDomain[0]), new Date(config.timeZoomDomain[1])]);
          }
          setArtifactDisplayOptions(config.artifactDisplayOptions || { waypointDotSize: 8, showSegmentLengths: true, labelFontSize: 14 });
          setNightfallPlotYAxisRange(config.nightfallPlotYAxisRange || { min: -15, max: 15 });

      } catch (e) {
          alert(`Error restoring session: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
          setIsLoading(null);
      }
    }, []);


    const value: AppContextType = {
        layers,
        activeLayerId,
        isLoading,
        timeRange,
        hoveredCoords,
        showGraticule,
        viewState,
        graticuleDensity,
        activeTool,
        selectedPixel,
        timeSeriesData,
        timeZoomDomain,
        daylightFractionHoverData,
        flickeringLayerId,
        showGrid,
        gridSpacing,
        gridColor,
        selectedCells,
        selectionColor,
        isPlaying,
        isPaused,
        playbackSpeed,
        importRequest,
        artifacts,
        activeArtifactId,
        artifactCreationMode,
        isAppendingWaypoints,
        draggedInfo,
        artifactDisplayOptions,
        nightfallPlotYAxisRange,
        isCreatingExpression,
        baseMapLayer,
        primaryDataLayer,
        activeLayer,
        proj,
        fullTimeDomain,
        coordinateTransformer,
        setLayers,
        setActiveLayerId,
        setIsLoading,
        setTimeRange,
        setHoveredCoords,
        setShowGraticule,
        setViewState,
        setGraticuleDensity,
        onToolSelect: setActiveTool,
        setSelectedPixel,
        setTimeZoomDomain,
        onToggleFlicker,
        setShowGrid,
        setGridSpacing,
        setGridColor,
        setSelectedCells,
        setSelectionColor,
        setIsPlaying,
        setIsPaused,
        onPlaybackSpeedChange: setPlaybackSpeed,
        setImportRequest,
        setArtifacts,
        setActiveArtifactId,
        setArtifactCreationMode,
        setIsAppendingWaypoints,
        setDraggedInfo,
        setArtifactDisplayOptions,
        onNightfallPlotYAxisRangeChange: setNightfallPlotYAxisRange,
        setIsCreatingExpression,
        clearHoverState,
        onAddDataLayer,
        onAddDteCommsLayer,
        onAddLpfCommsLayer,
        onAddBaseMapLayer,
        onUpdateLayer,
        onRemoveLayer,
        onCalculateNightfallLayer,
        onCalculateDaylightFractionLayer,
        onCreateExpressionLayer,
        onRecalculateExpressionLayer,
        handleManualTimeRangeChange,
        onTogglePlay,
        onUpdateArtifact,
        onRemoveArtifact,
        onFinishArtifactCreation,
        onStartAppendWaypoints,
        onClearSelection,
        onZoomToSelection,
        onResetZoom,
        onExportConfig,
        onImportConfig,
        handleRestoreSession,
        latRange: LAT_RANGE,
        lonRange: LON_RANGE
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};