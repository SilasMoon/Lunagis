// Fix: Removed invalid file header which was causing parsing errors.
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ToolBar } from './components/TopBar';
import { SidePanel } from './components/ControlPanel';
import { DataCanvas } from './components/DataCanvas';
import { TimeSlider } from './components/TimeSlider';
import { TimeSeriesPlot } from './components/TimeSeriesPlot';
import { parseNpy } from './services/npyParser';
import { parseVrt } from './services/vrtParser';
import type { DataSet, DataSlice, GeoCoordinates, VrtData, ViewState, TimeRange, PixelCoords, TimeDomain, Tool, Layer, DataLayer, BaseMapLayer, AnalysisLayer, DaylightFractionHoverData, AppStateConfig, SerializableLayer, Artifact, CircleArtifact, RectangleArtifact, PathArtifact, SerializableArtifact, Waypoint, ColorStop } from './types';
import { indexToDate } from './utils/time';

declare const proj4: any;

// Geographic bounding box for the data
const LAT_RANGE: [number, number] = [-85.505, -85.26];
const LON_RANGE: [number, number] = [28.97, 32.53];

const dataUrlToImage = (dataUrl: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = dataUrl;
    });
};

const calculateDaylightFraction = (dataset: DataSet, timeRange: TimeRange, dimensions: {height: number, width: number}) => {
    const { height, width } = dimensions;
    const resultSlice: DataSlice = Array.from({ length: height }, () => new Array(width).fill(0));
    const totalHours = timeRange.end - timeRange.start + 1;

    if (totalHours <= 0) {
        return { slice: resultSlice, range: { min: 0, max: 100 } };
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let dayHours = 0;
            for (let t = timeRange.start; t <= timeRange.end; t++) {
                if (t >= dataset.length) continue;
                const value = dataset[t][y][x];
                if (value === 1) dayHours++;
            }
            const fraction = (dayHours / totalHours) * 100;
            resultSlice[y][x] = fraction;
        }
    }
    return { slice: resultSlice, range: { min: 0, max: 100 } };
};

const calculateNightfallDataset = async (sourceLayer: DataLayer): Promise<{dataset: DataSet, range: {min: number, max: number}, maxDuration: number}> => {
    const { dataset, dimensions } = sourceLayer;
    const { time, height, width } = dimensions;

    const resultDataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width).fill(0)));
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
    let maxDuration = 0;
    let minDuration = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixelTimeSeries = dataset.map(slice => slice[y][x]);

            // --- Pass 1: Pre-compute all night periods for this pixel ---
            const nightPeriods: { start: number; end: number; duration: number }[] = [];
            let inNight = false;
            let nightStart = -1;

            for (let t = 0; t < time; t++) {
                const isCurrentlyNight = pixelTimeSeries[t] === 0;
                if (isCurrentlyNight && !inNight) {
                    // Sunset: a new night period begins
                    inNight = true;
                    nightStart = t;
                } else if (!isCurrentlyNight && inNight) {
                    // Sunrise: the night period ends
                    inNight = false;
                    const duration = t - nightStart;
                    nightPeriods.push({ start: nightStart, end: t, duration });
                }
            }
            // Handle case where the series ends during a night period
            if (inNight) {
                const duration = time - nightStart;
                nightPeriods.push({ start: nightStart, end: time, duration });
            }
            
            // --- Pass 2: Populate the forecast using the pre-computed list ---
            let nextNightIndex = 0;
            for (let t = 0; t < time; t++) {
                if (pixelTimeSeries[t] === 1) { // It's DAY
                    // Find the next night period that starts after the current time
                    while (nextNightIndex < nightPeriods.length && nightPeriods[nextNightIndex].start <= t) {
                        nextNightIndex++;
                    }

                    if (nextNightIndex < nightPeriods.length) {
                        const nextNight = nightPeriods[nextNightIndex];
                        resultDataset[t][y][x] = nextNight.duration;
                        if (nextNight.duration > maxDuration) maxDuration = nextNight.duration;
                    } else {
                        resultDataset[t][y][x] = 0; // No more night periods
                    }
                } else { // It's NIGHT
                    // Find which night period the current time falls into
                    const currentNight = nightPeriods.find(p => t >= p.start && t < p.end);
                    if (currentNight) {
                        const forecastValue = -currentNight.duration;
                        resultDataset[t][y][x] = forecastValue;
                        if (forecastValue < minDuration) minDuration = forecastValue;
                    } else {
                        // This case should ideally not happen if logic is correct
                        resultDataset[t][y][x] = -1; 
                    }
                }
            }
        }
        if (y % 10 === 0) await yieldToMain();
    }
    return { dataset: resultDataset, range: { min: minDuration, max: maxDuration }, maxDuration };
};


const ImportFilesModal: React.FC<{
    requiredFiles: string[];
    onCancel: () => void;
    onConfirm: (files: FileList) => void;
}> = ({ requiredFiles, onCancel, onConfirm }) => {
    const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg text-gray-200 border border-gray-700">
                <h2 className="text-xl font-bold text-cyan-300 mb-4">Restore Session</h2>
                <p className="text-sm text-gray-400 mb-2">To continue, please provide the following data file(s) from your original session:</p>
                <ul className="list-disc list-inside bg-gray-900/50 p-3 rounded-md mb-4 text-sm font-mono">
                    {requiredFiles.map(name => <li key={name}>{name}</li>)}
                </ul>
                <p className="text-sm text-gray-400 mb-4">Select all required files below.</p>
                <div>
                    <input
                        type="file"
                        multiple
                        accept=".npy,.png,.vrt"
                        onChange={(e) => setSelectedFiles(e.target.files)}
                        className="w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500"
                    />
                </div>
                <div className="flex justify-end gap-4 mt-6">
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-sm font-semibold">Cancel</button>
                    <button
                        onClick={() => selectedFiles && onConfirm(selectedFiles)}
                        disabled={!selectedFiles || selectedFiles.length === 0}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-md text-sm font-semibold"
                    >
                        Load Session
                    </button>
                </div>
            </div>
        </div>
    );
};


const App: React.FC = () => {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [debouncedTimeRange, setDebouncedTimeRange] = useState<TimeRange | null>(timeRange);
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
        if (layer?.type === 'data' || (layer?.type === 'analysis')) {
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
    if (activeLayerId && selectedPixel && debouncedTimeRange) {
      const activeLayer = layers.find(l => l.id === activeLayerId);
      if (activeLayer?.type === 'analysis' && activeLayer.analysisType === 'daylight_fraction') {
        const sourceLayer = layers.find(l => l.id === activeLayer.sourceLayerId) as DataLayer | undefined;
        if (sourceLayer) {
          const { x, y } = selectedPixel;
          const { start, end } = debouncedTimeRange;
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
  }, [selectedPixel, activeLayerId, layers, debouncedTimeRange]);


  const handleAddDataLayer = useCallback(async (file: File) => {
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
      
      const newLayer: DataLayer = {
        id: `data-${Date.now()}`, name: file.name, type: 'data', visible: true, opacity: 1.0,
        fileName: file.name, dataset, range: { min, max }, colormap: 'Viridis',
        colormapInverted: false,
        customColormap: [{ value: min, color: '#000000' }, { value: max, color: '#ffffff' }],
        dimensions: { time, height, width },
      };

      setLayers(prev => [...prev, newLayer]);
      setActiveLayerId(newLayer.id);

      if (!primaryDataLayer) {
        const initialTimeRange = { start: 0, end: time - 1 };
        setTimeRange(initialTimeRange);
        setDebouncedTimeRange(initialTimeRange);
        setTimeZoomDomain([indexToDate(0), indexToDate(time - 1)]);
        setViewState(null);
      }
    } catch (error) {
      alert(`Error loading file: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(null);
    }
  }, [primaryDataLayer]);
  
  const handleAddBaseMapLayer = useCallback(async (pngFile: File, vrtFile: File) => {
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

  const handleUpdateLayer = useCallback((id: string, updates: Partial<Layer>) => {
    setLayers(prevLayers =>
      prevLayers.map(l => (l.id === id ? ({ ...l, ...updates } as Layer) : l))
    );
  }, []);

  const handleRemoveLayer = useCallback((id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (activeLayerId === id) setActiveLayerId(null);
  }, [activeLayerId]);
  
  const handleCalculateNightfallLayer = useCallback(async (sourceLayerId: string) => {
    const sourceLayer = layers.find(l => l.id === sourceLayerId) as DataLayer | undefined;
    if (!sourceLayer) return;

    setIsLoading(`Forecasting nightfall for "${sourceLayer.name}"...`);
    await new Promise(r => setTimeout(r, 50));
    
    const { dataset, range, maxDuration } = await calculateNightfallDataset(sourceLayer);
    
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

  const handleCalculateDaylightFractionLayer = useCallback((sourceLayerId: string) => {
    const sourceLayer = layers.find(l => l.id === sourceLayerId) as DataLayer | undefined;
    if (!sourceLayer || !timeRange) return;

    const { slice, range } = calculateDaylightFraction(sourceLayer.dataset, timeRange, sourceLayer.dimensions);
    
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

  useEffect(() => {
    if (isPlaying) {
        setDebouncedTimeRange(timeRange);
        return;
    }
    const handler = setTimeout(() => { setDebouncedTimeRange(timeRange); }, 250);
    return () => { clearTimeout(handler); };
  }, [timeRange, isPlaying]);

  useEffect(() => {
    if (!debouncedTimeRange) return;
    setLayers(currentLayers => {
        const fractionLayersToUpdate = currentLayers.filter(l => l.type === 'analysis' && l.analysisType === 'daylight_fraction');
        if (fractionLayersToUpdate.length === 0) return currentLayers;

        let hasChanged = false;
        const newLayers = currentLayers.map(l => {
            if (l.type === 'analysis' && l.analysisType === 'daylight_fraction') {
                const sourceLayer = currentLayers.find(src => src.id === l.sourceLayerId) as DataLayer | undefined;
                if (sourceLayer) {
                    const { slice, range } = calculateDaylightFraction(sourceLayer.dataset, debouncedTimeRange, sourceLayer.dimensions);
                    const newDataset = Array.from({ length: sourceLayer.dimensions.time }, () => slice);
                    hasChanged = true;
                    return { ...l, dataset: newDataset, range };
                }
            }
            return l;
        });
        return hasChanged ? newLayers : currentLayers;
    });
  }, [debouncedTimeRange]);

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

  const handleTogglePlay = useCallback(() => {
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

  const handleCellHover = useCallback((coords: GeoCoordinates) => {
    setHoveredCoords(coords);
    if (!coords || !coordinateTransformer) { setSelectedPixel(null); return; }
    const pixel = coordinateTransformer(coords.lat, coords.lon);
    if (pixel) {
        const topDataLayer = [...layers].reverse().find(l => l.visible && (l.type === 'data' || l.type === 'analysis'));
        if (topDataLayer) setSelectedPixel({ ...pixel, layerId: topDataLayer.id }); else setSelectedPixel(null);
    } else {
        setSelectedPixel(null);
    }
  }, [coordinateTransformer, layers]);

  const handleUpdateArtifact = useCallback((id: string, updates: Partial<Artifact>) => {
    setArtifacts(prev => prev.map(a => (a.id === id ? { ...a, ...updates } as Artifact : a)));
  }, []);

  const handleFinishArtifactCreation = useCallback(() => {
    setArtifactCreationMode(null);
    setIsAppendingWaypoints(false);
  }, []);
  
  const handleStartAppendWaypoints = useCallback(() => {
    setIsAppendingWaypoints(true);
  }, []);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            handleFinishArtifactCreation();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFinishArtifactCreation]);

  const handleMapClick = useCallback((coords: GeoCoordinates, projCoords: [number, number]) => {
    if (isAppendingWaypoints) {
        const activeArtifact = artifacts.find(a => a.id === activeArtifactId);
        if (activeArtifact && activeArtifact.type === 'path' && coords) {
            const newWaypoint: Waypoint = {
                id: `wp-${Date.now()}`,
                geoPosition: [coords.lon, coords.lat],
                label: `WP ${activeArtifact.waypoints.length + 1}`,
            };
            handleUpdateArtifact(activeArtifactId!, { waypoints: [...activeArtifact.waypoints, newWaypoint] });
        }
        return;
    }
    
    if (artifactCreationMode) {
        if (artifactCreationMode === 'path') {
            if (!proj || !coords) return;
            const activeArtifact = artifacts.find(a => a.id === activeArtifactId);
            if (activeArtifact && activeArtifact.type === 'path') {
                const newWaypoint: Waypoint = {
                    id: `wp-${Date.now()}`,
                    geoPosition: [coords.lon, coords.lat],
                    label: `WP ${activeArtifact.waypoints.length + 1}`,
                };
                handleUpdateArtifact(activeArtifactId!, { waypoints: [...activeArtifact.waypoints, newWaypoint] });
            } else {
                const newWaypoint: Waypoint = {
                    id: `wp-${Date.now()}`,
                    geoPosition: [coords.lon, coords.lat],
                    label: 'WP 1',
                };
                const newPath: PathArtifact = {
                    id: `path-${Date.now()}`, type: 'path', visible: true, color: '#ff33ff', thickness: 2,
                    name: `Path ${artifacts.filter(a => a.type === 'path').length + 1}`,
                    waypoints: [newWaypoint],
                };
                setArtifacts(prev => [...prev, newPath]);
                setActiveArtifactId(newPath.id);
            }
            return;
        }

        const newArtifactBase = {
            id: `${artifactCreationMode}-${Date.now()}`,
            visible: true, color: '#ff33ff', thickness: 2,
        };
        if (artifactCreationMode === 'circle') {
            const newCircle: CircleArtifact = {
                ...newArtifactBase, type: 'circle',
                name: `Circle ${artifacts.filter(a => a.type === 'circle').length + 1}`,
                center: projCoords, radius: 1000,
            };
            setArtifacts(prev => [...prev, newCircle]); setActiveArtifactId(newCircle.id);
        } else if (artifactCreationMode === 'rectangle') {
            const newRect: RectangleArtifact = {
                ...newArtifactBase, type: 'rectangle',
                name: `Rectangle ${artifacts.filter(a => a.type === 'rectangle').length + 1}`,
                center: projCoords, width: 1000, height: 1000, rotation: 0,
            };
            setArtifacts(prev => [...prev, newRect]); setActiveArtifactId(newRect.id);
        }
        setArtifactCreationMode(null);
        setActiveTool('artifacts');
        return;
    }
    
    if (activeTool !== 'measurement' || !coords || !coordinateTransformer) return;
    const pixel = coordinateTransformer(coords.lat, coords.lon);
    if (pixel) {
      setSelectedCells(prev => {
        const existingIndex = prev.findIndex(c => c.x === pixel.x && c.y === pixel.y);
        if (existingIndex > -1) return prev.filter((_, i) => i !== existingIndex);
        else return [...prev, pixel];
      });
    }
  }, [activeTool, coordinateTransformer, artifactCreationMode, artifacts, activeArtifactId, handleUpdateArtifact, proj, isAppendingWaypoints]);

  const handleArtifactDragStart = useCallback((info: { artifactId: string; waypointId?: string }, projCoords: [number, number]) => {
    if (isAppendingWaypoints) return;
    const artifact = artifacts.find(a => a.id === info.artifactId);
    if (!artifact || !proj) return;
    
    if (info.waypointId) {
        setDraggedInfo({
            artifactId: info.artifactId,
            waypointId: info.waypointId,
            initialMousePos: projCoords,
        });
    } else {
        if (artifact.type === 'circle' || artifact.type === 'rectangle') {
            setDraggedInfo({ artifactId: info.artifactId, initialMousePos: projCoords, initialCenter: artifact.center });
        } else if (artifact.type === 'path') {
            const initialWaypointProjPositions = artifact.waypoints.map(wp => proj.forward(wp.geoPosition));
            setDraggedInfo({ artifactId: info.artifactId, initialMousePos: projCoords, initialWaypointProjPositions });
        }
    }
    setActiveArtifactId(info.artifactId);
  }, [artifacts, proj, isAppendingWaypoints]);

  const handleArtifactDrag = useCallback((projCoords: [number, number]) => {
    if (!draggedInfo || !proj) return;

    if (draggedInfo.waypointId) {
        setArtifacts(prev => prev.map(a => {
            if (a.id === draggedInfo.artifactId && a.type === 'path') {
                try {
                    const newGeoPos = proj.inverse(projCoords);
                    const newWaypoints = a.waypoints.map(wp =>
                        wp.id === draggedInfo.waypointId ? { ...wp, geoPosition: newGeoPos as [number, number] } : wp
                    );
                    return { ...a, waypoints: newWaypoints };
                } catch (e) {
                    return a;
                }
            }
            return a;
        }));
    } else {
        const dx = projCoords[0] - draggedInfo.initialMousePos[0];
        const dy = projCoords[1] - draggedInfo.initialMousePos[1];

        setArtifacts(prev => prev.map(a => {
            if (a.id === draggedInfo.artifactId) {
                if ((a.type === 'circle' || a.type === 'rectangle') && draggedInfo.initialCenter) {
                    return { ...a, center: [draggedInfo.initialCenter[0] + dx, draggedInfo.initialCenter[1] + dy] };
                } else if (a.type === 'path' && draggedInfo.initialWaypointProjPositions) {
                    const newWaypoints = a.waypoints.map((wp, i) => {
                        const initialProjPos = draggedInfo.initialWaypointProjPositions![i];
                        const newProjPos: [number, number] = [initialProjPos[0] + dx, initialProjPos[1] + dy];
                        try {
                            const newGeoPos = proj.inverse(newProjPos);
                            return { ...wp, geoPosition: newGeoPos };
                        } catch (e) {
                            return wp;
                        }
                    });
                    return { ...a, waypoints: newWaypoints };
                }
            }
            return a;
        }));
    }
  }, [draggedInfo, proj]);

  const handleArtifactDragEnd = useCallback(() => {
    setDraggedInfo(null);
  }, []);

  const handleRemoveArtifact = useCallback((id: string) => {
    setArtifacts(prev => prev.filter(a => a.id !== id));
    if (activeArtifactId === id) setActiveArtifactId(null);
  }, [activeArtifactId]);

  const handleClearSelection = useCallback(() => { setSelectedCells([]); }, []);

  const handleZoomToSelection = useCallback(() => {
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

  const handleResetTimeZoom = useCallback(() => { if (fullTimeDomain) setTimeZoomDomain(fullTimeDomain); }, [fullTimeDomain]);

  const handleToggleFlicker = useCallback((layerId: string) => {
    const currentlyFlickeringId = flickeringLayerId;
    if (flickerIntervalRef.current) { clearInterval(flickerIntervalRef.current); flickerIntervalRef.current = null; }
    if (currentlyFlickeringId && originalVisibilityRef.current !== null) { handleUpdateLayer(currentlyFlickeringId, { visible: originalVisibilityRef.current }); }
    if (currentlyFlickeringId === layerId) { setFlickeringLayerId(null); originalVisibilityRef.current = null; }
    else {
        const layerToFlicker = layers.find(l => l.id === layerId);
        if (layerToFlicker) { originalVisibilityRef.current = layerToFlicker.visible; setFlickeringLayerId(layerId); }
    }
  }, [layers, flickeringLayerId, handleUpdateLayer]);

  useEffect(() => {
    if (flickeringLayerId) {
        flickerIntervalRef.current = window.setInterval(() => {
            setLayers(prevLayers => prevLayers.map(l => l.id === flickeringLayerId ? { ...l, visible: !l.visible } : l));
        }, 400);
    }
    return () => { if (flickerIntervalRef.current) { clearInterval(flickerIntervalRef.current); flickerIntervalRef.current = null; } };
  }, [flickeringLayerId]);
  
  const handleExportConfig = useCallback(async () => {
    if (layers.length === 0) { alert("Cannot export an empty session."); return; }
    setIsLoading("Exporting session...");
    try {
        const serializableLayers: SerializableLayer[] = layers.map((l): SerializableLayer => {
            if (l.type === 'basemap') {
                const { image, ...rest } = l; // Omit non-serializable image element
                return rest;
            } else { // data or analysis
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

  const handleImportConfig = useCallback((file: File) => {
    setIsLoading("Reading config file...");
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const config = JSON.parse(event.target?.result as string) as AppStateConfig;
            if (config.version !== 1) { throw new Error("Unsupported config version."); }
            
            const requiredFiles: string[] = [];
            for (const l of config.layers) {
                if (l.type === 'data') {
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

            } else if (sLayer.type === 'data') {
                const file = fileMap.get(sLayer.fileName);
                if (!file) throw new Error(`Required file "${sLayer.fileName}" was not provided.`);
                
                const arrayBuffer = await file.arrayBuffer();
                const { data: float32Array, shape, header } = parseNpy(arrayBuffer);
                const [height, width, time] = shape;
                const dataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width)));
                let flatIndex = 0;
                if (header.fortran_order) { for (let t = 0; t < time; t++) for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) dataset[t][y][x] = float32Array[flatIndex++]; }
                else { for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let t = 0; t < time; t++) dataset[t][y][x] = float32Array[flatIndex++]; }

                const layer: DataLayer = { ...sLayer, dataset };
                newLayers.push(layer);
            }
        }
        setLayers(newLayers); // Set base layers so analysis layers can find their source

        // 2. Re-calculate Analysis layers
        let finalLayers = [...newLayers];
        for (const sLayer of config.layers) {
            if (sLayer.type === 'analysis') {
                const sourceLayer = newLayers.find(l => l.id === sLayer.sourceLayerId) as DataLayer | undefined;
                if (!sourceLayer) throw new Error(`Source layer with ID ${sLayer.sourceLayerId} not found for analysis layer "${sLayer.name}".`);
                
                let calculatedDataset: DataSet;
                if (sLayer.analysisType === 'nightfall') {
                    const { dataset } = await calculateNightfallDataset(sourceLayer);
                    calculatedDataset = dataset;
                } else { // daylight_fraction
                    const calcTimeRange = config.timeRange || { start: 0, end: sourceLayer.dimensions.time - 1};
                    const { slice } = calculateDaylightFraction(sourceLayer.dataset, calcTimeRange, sourceLayer.dimensions);
                    calculatedDataset = Array.from({ length: sourceLayer.dimensions.time }, () => slice);
                }
                const analysisLayer: AnalysisLayer = { ...sLayer, dataset: calculatedDataset };
                finalLayers.push(analysisLayer);
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

  return (
    <div className="h-screen bg-gray-900 text-gray-200 flex flex-row font-sans overflow-hidden">
      {importRequest && <ImportFilesModal requiredFiles={importRequest.requiredFiles} onCancel={() => setImportRequest(null)} onConfirm={(files) => handleRestoreSession(importRequest.config, files)} />}
      <ToolBar activeTool={activeTool} onToolSelect={setActiveTool} />
      
      <SidePanel
        activeTool={activeTool}
        layers={layers}
        activeLayer={activeLayer}
        activeLayerId={activeLayerId}
        onActiveLayerChange={setActiveLayerId}
        onAddDataLayer={handleAddDataLayer}
        onAddBaseMapLayer={handleAddBaseMapLayer}
        onUpdateLayer={handleUpdateLayer}
        onRemoveLayer={handleRemoveLayer}
        onCalculateNightfallLayer={handleCalculateNightfallLayer}
        onCalculateDaylightFractionLayer={handleCalculateDaylightFractionLayer}
        isLoading={isLoading}
        isDataLoaded={!!primaryDataLayer || !!baseMapLayer}
        hoveredCoords={hoveredCoords}
        selectedPixel={selectedPixel}
        timeRange={timeRange}
        showGraticule={showGraticule}
        onShowGraticuleChange={setShowGraticule}
        graticuleDensity={graticuleDensity}
        onGraticuleDensityChange={setGraticuleDensity}
        daylightFractionHoverData={daylightFractionHoverData}
        flickeringLayerId={flickeringLayerId}
        onToggleFlicker={handleToggleFlicker}
        showGrid={showGrid}
        onShowGridChange={setShowGrid}
        gridSpacing={gridSpacing}
        onGridSpacingChange={setGridSpacing}
        gridColor={gridColor}
        onGridColorChange={setGridColor}
        selectedCells={selectedCells}
        selectionColor={selectionColor}
        onSelectionColorChange={setSelectionColor}
        onClearSelection={handleClearSelection}
        isPlaying={isPlaying}
        isPaused={isPaused}
        playbackSpeed={playbackSpeed}
        onTogglePlay={handleTogglePlay}
        onPlaybackSpeedChange={setPlaybackSpeed}
        onImportConfig={handleImportConfig}
        onExportConfig={handleExportConfig}
        artifacts={artifacts}
        activeArtifactId={activeArtifactId}
        onActiveArtifactChange={setActiveArtifactId}
        onUpdateArtifact={handleUpdateArtifact}
        onRemoveArtifact={handleRemoveArtifact}
        artifactCreationMode={artifactCreationMode}
        onSetArtifactCreationMode={setArtifactCreationMode}
        onFinishArtifactCreation={handleFinishArtifactCreation}
        artifactDisplayOptions={artifactDisplayOptions}
        onSetArtifactDisplayOptions={setArtifactDisplayOptions}
        isAppendingWaypoints={isAppendingWaypoints}
        onStartAppendWaypoints={handleStartAppendWaypoints}
        nightfallPlotYAxisRange={nightfallPlotYAxisRange}
        onNightfallPlotYAxisRangeChange={setNightfallPlotYAxisRange}
      />
      
      <main className="flex-grow flex flex-col min-w-0">
        <section className="flex-grow flex items-center justify-center bg-black/20 p-4 sm:p-6 lg:p-8 min-h-0">
          <DataCanvas
            layers={layers}
            timeIndex={isPlaying ? (timeRange?.start ?? 0) : (debouncedTimeRange?.start ?? timeRange?.start ?? 0)}
            debouncedTimeRange={debouncedTimeRange}
            onCellHover={handleCellHover}
            onMapClick={handleMapClick}
            onCellLeave={clearHoverState}
            latRange={LAT_RANGE}
            lonRange={LON_RANGE}
            showGraticule={showGraticule}
            graticuleDensity={graticuleDensity}
            proj={proj}
            viewState={viewState}
            onViewStateChange={setViewState}
            isDataLoaded={!!primaryDataLayer || !!baseMapLayer}
            showGrid={showGrid}
            gridSpacing={gridSpacing}
            gridColor={gridColor}
            activeTool={activeTool}
            selectedCells={selectedCells}
            selectionColor={selectionColor}
            artifacts={artifacts}
            artifactCreationMode={artifactCreationMode}
            onArtifactDragStart={handleArtifactDragStart}
            onArtifactDrag={handleArtifactDrag}
            onArtifactDragEnd={handleArtifactDragEnd}
            isDragging={!!draggedInfo}
            artifactDisplayOptions={artifactDisplayOptions}
            isAppendingWaypoints={isAppendingWaypoints}
          />
        </section>
        
        <TimeSeriesPlot
          isDataLoaded={!!primaryDataLayer}
          timeSeriesData={timeSeriesData?.data ?? null}
          dataRange={timeSeriesData?.range ?? null}
          timeRange={timeRange}
          fullTimeDomain={fullTimeDomain}
          timeZoomDomain={timeZoomDomain}
          onZoomToSelection={handleZoomToSelection}
          onResetZoom={handleResetTimeZoom}
          yAxisUnit={activeLayer?.type === 'analysis' && activeLayer.analysisType === 'nightfall' ? 'days' : undefined}
          yAxisRange={activeLayer?.type === 'analysis' && activeLayer.analysisType === 'nightfall' ? nightfallPlotYAxisRange : undefined}
          colormapThresholds={
            activeLayer?.type === 'analysis' && activeLayer.analysisType === 'nightfall' && activeLayer.colormap === 'Custom'
            ? activeLayer.customColormap
            : undefined
          }
        />

        <TimeSlider
          isDataLoaded={!!primaryDataLayer}
          timeRange={timeRange}
          maxTimeIndex={primaryDataLayer?.dimensions.time ? primaryDataLayer.dimensions.time - 1 : 0}
          onTimeRangeChange={handleManualTimeRangeChange}
          timeZoomDomain={timeZoomDomain}
        />
      </main>
    </div>
  );
};

export default App;
