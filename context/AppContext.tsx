import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { DataSet, DataSlice, GeoCoordinates, VrtData, ViewState, TimeRange, PixelCoords, TimeDomain, Tool, Layer, DataLayer, BaseMapLayer, AnalysisLayer, DaylightFractionHoverData, AppStateConfig, SerializableLayer, Artifact, CircleArtifact, RectangleArtifact, PathArtifact, SerializableArtifact, Waypoint, ColorStop, DteCommsLayer, LpfCommsLayer } from '../types';
import { useLayersContext } from './LayersContext';
import { useGlobalContext } from './GlobalContext';
import { useTimeContext } from './TimeContext';

// Geographic bounding box for the data
const LAT_RANGE: [number, number] = [-85.505, -85.26];
const LON_RANGE: [number, number] = [28.97, 32.53];

declare const proj4: any;

interface MapContextType {
    // State
    hoveredCoords: GeoCoordinates;
    viewState: ViewState | null;
    selectedPixel: (PixelCoords & { layerId: string; }) | null;
    timeSeriesData: { data: number[]; range: { min: number; max: number; }; } | null;
    daylightFractionHoverData: DaylightFractionHoverData | null;
    showGrid: boolean;
    gridSpacing: number;
    gridColor: string;
    showGraticule: boolean;
    graticuleDensity: number;
    selectedCells: { x: number; y: number; }[];
    selectionColor: string;
    artifacts: Artifact[];
    activeArtifactId: string | null;
    artifactCreationMode: "circle" | "rectangle" | "path" | null;
    isAppendingWaypoints: boolean;
    draggedInfo: { artifactId: string; waypointId?: string; initialMousePos: [number, number]; initialCenter?: [number, number]; initialWaypointProjPositions?: [number, number][]; } | null;
    artifactDisplayOptions: { waypointDotSize: number; showSegmentLengths: boolean; labelFontSize: number; };
    nightfallPlotYAxisRange: { min: number; max: number; };
    
    // Derived State
    proj: any;
    coordinateTransformer: ((lat: number, lon: number) => PixelCoords) | null;

    // Setters & Handlers
    setHoveredCoords: React.Dispatch<React.SetStateAction<GeoCoordinates>>;
    setViewState: React.Dispatch<React.SetStateAction<ViewState | null>>;
    setSelectedPixel: React.Dispatch<React.SetStateAction<(PixelCoords & { layerId: string; }) | null>>;
    setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
    setGridSpacing: React.Dispatch<React.SetStateAction<number>>;
    setGridColor: React.Dispatch<React.SetStateAction<string>>;
    setShowGraticule: React.Dispatch<React.SetStateAction<boolean>>;
    setGraticuleDensity: React.Dispatch<React.SetStateAction<number>>;
    setSelectedCells: React.Dispatch<React.SetStateAction<{ x: number; y: number; }[]>>;
    setSelectionColor: React.Dispatch<React.SetStateAction<string>>;
    setArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>;
    setActiveArtifactId: React.Dispatch<React.SetStateAction<string | null>>;
    setArtifactCreationMode: React.Dispatch<React.SetStateAction<"circle" | "rectangle" | "path" | null>>;
    setIsAppendingWaypoints: React.Dispatch<React.SetStateAction<boolean>>;
    setDraggedInfo: React.Dispatch<React.SetStateAction<{ artifactId: string; waypointId?: string; initialMousePos: [number, number]; initialCenter?: [number, number]; initialWaypointProjPositions?: [number, number][]; } | null>>;
    setArtifactDisplayOptions: React.Dispatch<React.SetStateAction<{ waypointDotSize: number; showSegmentLengths: boolean; labelFontSize: number; }>>;
    onNightfallPlotYAxisRangeChange: (range: { min: number; max: number; }) => void;
    
    clearHoverState: () => void;
    onUpdateArtifact: (id: string, updates: Partial<Artifact>) => void;
    onRemoveArtifact: (id: string) => void;
    onFinishArtifactCreation: () => void;
    onStartAppendWaypoints: () => void;
    onClearSelection: () => void;

    latRange: [number, number];
    lonRange: [number, number];
}

const MapContext = createContext<MapContextType | null>(null);

export const useMapContext = () => {
    const context = useContext(MapContext);
    if (!context) {
        throw new Error("useMapContext must be used within a MapProvider");
    }
    return context;
};

export const MapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { layers, activeLayerId, primaryDataLayer, baseMapLayer } = useLayersContext();
    const { timeRange } = useTimeContext();
    const { sessionDataToRestore } = useGlobalContext();

    const [hoveredCoords, setHoveredCoords] = useState<GeoCoordinates>(null);
    const [viewState, setViewState] = useState<ViewState | null>(null);
    const [selectedPixel, setSelectedPixel] = useState<PixelCoords & { layerId: string } | null>(null);
    const [timeSeriesData, setTimeSeriesData] = useState<{data: number[], range: {min: number, max: number}} | null>(null);
    const [daylightFractionHoverData, setDaylightFractionHoverData] = useState<DaylightFractionHoverData | null>(null);
    
    const [showGrid, setShowGrid] = useState<boolean>(false);
    const [gridSpacing, setGridSpacing] = useState<number>(200);
    const [gridColor, setGridColor] = useState<string>('#ffffff80');
    const [showGraticule, setShowGraticule] = useState<boolean>(true);
    const [graticuleDensity, setGraticuleDensity] = useState(1.0);
    
    const [selectedCells, setSelectedCells] = useState<{x: number, y: number}[]>([]);
    const [selectionColor, setSelectionColor] = useState<string>('#ffff00');

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
    
    const proj = useMemo(() => (baseMapLayer ? proj4(baseMapLayer.vrt.srs) : null), [baseMapLayer]);

    const clearHoverState = () => {
      setHoveredCoords(null);
      setSelectedPixel(null);
    };

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
    
    // Restore state from session
    useEffect(() => {
        if (sessionDataToRestore) {
            setViewState(sessionDataToRestore.viewState);
            setShowGraticule(sessionDataToRestore.showGraticule);
            setGraticuleDensity(sessionDataToRestore.graticuleDensity);
            setShowGrid(sessionDataToRestore.showGrid);
            setGridSpacing(sessionDataToRestore.gridSpacing);
            setGridColor(sessionDataToRestore.gridColor);
            setSelectedCells(sessionDataToRestore.selectedCells);
            setSelectionColor(sessionDataToRestore.selectionColor);
            setArtifacts(sessionDataToRestore.artifacts || []);
            setArtifactDisplayOptions(sessionDataToRestore.artifactDisplayOptions || { waypointDotSize: 8, showSegmentLengths: true, labelFontSize: 14 });
            setNightfallPlotYAxisRange(sessionDataToRestore.nightfallPlotYAxisRange || { min: -15, max: 15 });
        }
    }, [sessionDataToRestore]);

    const value: MapContextType = {
        hoveredCoords,
        viewState,
        selectedPixel,
        timeSeriesData,
        daylightFractionHoverData,
        showGrid,
        gridSpacing,
        gridColor,
        showGraticule,
        graticuleDensity,
        selectedCells,
        selectionColor,
        artifacts,
        activeArtifactId,
        artifactCreationMode,
        isAppendingWaypoints,
        draggedInfo,
        artifactDisplayOptions,
        nightfallPlotYAxisRange,
        proj,
        coordinateTransformer,
        setHoveredCoords,
        setViewState,
        setSelectedPixel,
        setShowGrid,
        setGridSpacing,
        setGridColor,
        setShowGraticule,
        setGraticuleDensity,
        setSelectedCells,
        setSelectionColor,
        setArtifacts,
        setActiveArtifactId,
        setArtifactCreationMode,
        setIsAppendingWaypoints,
        setDraggedInfo,
        setArtifactDisplayOptions,
        onNightfallPlotYAxisRangeChange: setNightfallPlotYAxisRange,
        clearHoverState,
        onUpdateArtifact,
        onRemoveArtifact,
        onFinishArtifactCreation,
        onStartAppendWaypoints,
        onClearSelection,
        latRange: LAT_RANGE,
        lonRange: LON_RANGE
    };

    return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
};