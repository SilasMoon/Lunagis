import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ToolBar } from './components/TopBar';
import { SidePanel } from './components/ControlPanel';
import { DataCanvas } from './components/DataCanvas';
import { TimeSlider } from './components/TimeSlider';
import { TimeSeriesPlot } from './components/TimeSeriesPlot';
import { parseNpy } from './services/npyParser';
import { parseVrt } from './services/vrtParser';
import type { DataSet, DataSlice, ColorMapName, GeoCoordinates, VrtData, ViewState, TimeRange, PixelCoords, TimeDomain, Tool, Layer, DataLayer, BaseMapLayer, AnalysisLayer, DaylightFractionHoverData } from './types';
import { indexToDate } from './utils/time';

declare const proj4: any;

// Geographic bounding box for the data
const LAT_RANGE: [number, number] = [-85.505, -85.26];
const LON_RANGE: [number, number] = [28.97, 32.53];

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

const App: React.FC = () => {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<string | null>(null); // Now stores loading message
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [debouncedTimeRange, setDebouncedTimeRange] = useState<TimeRange | null>(timeRange);
  const [hoveredCoords, setHoveredCoords] = useState<GeoCoordinates>(null);
  const [showGraticule, setShowGraticule] = useState<boolean>(true);
  const [viewState, setViewState] = useState<ViewState | null>(null);
  const [graticuleDensity, setGraticuleDensity] = useState(1.0);
  const [activeTool, setActiveTool] = useState<Tool>('layers');
  
  const [selectedPixel, setSelectedPixel] = useState<PixelCoords & { layerId: string } | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<{data: number[], range: {min: number, max: number}, clipValue?: number} | null>(null);
  const [timeZoomDomain, setTimeZoomDomain] = useState<TimeDomain | null>(null);
  const [daylightFractionHoverData, setDaylightFractionHoverData] = useState<DaylightFractionHoverData | null>(null);
  
  const [flickeringLayerId, setFlickeringLayerId] = useState<string | null>(null);
  const flickerIntervalRef = useRef<number | null>(null);
  const originalVisibilityRef = useRef<boolean | null>(null);

  // New state for Grid Overlay
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [gridSpacing, setGridSpacing] = useState<number>(200); // in meters
  const [gridColor, setGridColor] = useState<string>('#ffffff80'); // White with 50% alpha
  
  // New state for cell selection
  const [selectedCells, setSelectedCells] = useState<{x: number, y: number}[]>([]);
  const [selectionColor, setSelectionColor] = useState<string>('#ffff00'); // Default: yellow

  // State for time animation
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(10); // FPS
  const animationFrameId = useRef<number | null>(null);
  const lastFrameTime = useRef<number>(0);
  const playbackRange = useRef<{start: number, end: number} | null>(null);

  const baseMapLayer = useMemo(() => layers.find(l => l.type === 'basemap') as BaseMapLayer | undefined, [layers]);
  const primaryDataLayer = useMemo(() => layers.find(l => l.type === 'data') as DataLayer | undefined, [layers]);
  
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
    return null; // For now, require a basemap for coordinate transformation
  }, [proj, primaryDataLayer]);
  
  useEffect(() => {
    if (selectedPixel) {
        const layer = layers.find(l => l.id === selectedPixel.layerId);
        if (layer?.type === 'data') {
            const series = layer.dataset.map(slice => slice[selectedPixel.y][selectedPixel.x]);
            setTimeSeriesData({data: series, range: layer.range});
        } else if (layer?.type === 'analysis' && layer.analysisType === 'nightfall') {
            const series = layer.dataset.map(slice => slice[selectedPixel.y][selectedPixel.x]);
            setTimeSeriesData({data: series, range: layer.range, clipValue: layer.params.clipValue});
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
          
          // Account for the last period
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
          return; // Exit early
        }
      }
    }
    // If any condition fails, reset the data
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
        dataset, range: { min, max }, colormap: 'Viridis',
        colormapInverted: false,
        customColormap: [{ value: min, color: '#000000' }, { value: max, color: '#ffffff' }],
        dimensions: { time, height, width },
      };

      setLayers(prev => [...prev, newLayer]);
      setActiveLayerId(newLayer.id);

      // Initialize time controls if this is the first data layer
      if (!primaryDataLayer) {
        const initialTimeRange = { start: 0, end: time - 1 };
        setTimeRange(initialTimeRange);
        setDebouncedTimeRange(initialTimeRange);
        setTimeZoomDomain([indexToDate(0), indexToDate(time - 1)]);
        setViewState(null); // Reset view to re-center on new data
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

        const image = new Image();
        const imagePromise = new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = URL.createObjectURL(pngFile);
        });
        await imagePromise;

        const newLayer: BaseMapLayer = {
            id: `basemap-${Date.now()}`, name: pngFile.name, type: 'basemap',
            visible: true, opacity: 1.0, image, vrt: vrtData,
        };

        setLayers(prev => [newLayer, ...prev.filter(l => l.type !== 'basemap')]); // Replace existing basemap
        setActiveLayerId(newLayer.id);
        setViewState(null); // Reset view to re-center
    } catch (error) {
        alert(`Error processing base map: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setIsLoading(null);
    }
  }, []);

  const handleUpdateLayer = useCallback((id: string, updates: Partial<Layer>) => {
    setLayers(prevLayers =>
      // Fix: Cast the updated layer object to `Layer` to satisfy TypeScript's discriminated union type checking.
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
    
    const { dataset, dimensions } = sourceLayer;
    const { time, height, width } = dimensions;

    const resultDataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width).fill(0)));
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

    let maxDuration = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            for (let t = 0; t < time; t++) {
                if (dataset[t][y][x] === 0) { // Current is Night
                    resultDataset[t][y][x] = -1;
                } else { // Current is Day
                    // Find start of the next night period
                    let nightStart = -1;
                    for (let k = t + 1; k < time; k++) {
                        if (dataset[k][y][x] === 0) {
                            nightStart = k;
                            break;
                        }
                    }

                    if (nightStart !== -1) {
                        // Find end of that night period
                        let nightEnd = time;
                        for (let k = nightStart; k < time; k++) {
                            if (dataset[k][y][x] === 1) {
                                nightEnd = k;
                                break;
                            }
                        }
                        const duration = nightEnd - nightStart;
                        resultDataset[t][y][x] = duration;
                        if (duration > maxDuration) maxDuration = duration;
                    } else {
                        resultDataset[t][y][x] = 0; // No following night found
                    }
                }
            }
        }
        if (y % 10 === 0) await yieldToMain();
    }
    
    const finalRange = { min: -1, max: maxDuration };
    const defaultClip = Math.min(1000, Math.ceil(maxDuration / 24) * 24 || 24);

    const newLayer: AnalysisLayer = {
        id: `analysis-${Date.now()}`,
        name: `Nightfall Forecast for ${sourceLayer.name}`,
        type: 'analysis',
        analysisType: 'nightfall',
        visible: true,
        opacity: 1.0,
        colormap: 'Plasma',
        colormapInverted: true,
        dataset: resultDataset,
        range: finalRange,
        dimensions,
        sourceLayerId,
        customColormap: [{ value: 0, color: '#000000' }, { value: maxDuration, color: '#ffffff' }],
        params: {
            clipValue: defaultClip,
        },
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
        type: 'analysis',
        analysisType: 'daylight_fraction',
        visible: true,
        opacity: 1.0,
        colormap: 'Turbo',
        dataset: resultDataset,
        range: range,
        dimensions: sourceLayer.dimensions,
        sourceLayerId,
        params: {},
    };

    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newLayer.id);
  }, [layers, timeRange]);

  // Debounce the time range for expensive calculations
  useEffect(() => {
    // During playback, we don't want to debounce
    if (isPlaying) {
        setDebouncedTimeRange(timeRange);
        return;
    }

    const handler = setTimeout(() => {
        setDebouncedTimeRange(timeRange);
    }, 250);

    return () => {
        clearTimeout(handler);
    };
  }, [timeRange, isPlaying]);

  // Effect to dynamically update daylight fraction layers when the debounced time range changes
  useEffect(() => {
    if (!debouncedTimeRange) return;

    setLayers(currentLayers => {
        const fractionLayersToUpdate = currentLayers.filter(l => l.type === 'analysis' && l.analysisType === 'daylight_fraction');
        if (fractionLayersToUpdate.length === 0) {
            return currentLayers;
        }

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

  // Animation loop
  useEffect(() => {
    if (!isPlaying) {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        }
        return;
    }

    const animate = (timestamp: number) => {
        if (lastFrameTime.current === 0) {
            lastFrameTime.current = timestamp;
        }

        const elapsed = timestamp - lastFrameTime.current;
        const frameDuration = 1000 / playbackSpeed;

        if (elapsed >= frameDuration) {
            lastFrameTime.current = timestamp;
            setTimeRange(currentRange => {
                if (!currentRange || !playbackRange.current) {
                    return currentRange;
                }
                let newTime = currentRange.start + 1;
                if (newTime > playbackRange.current.end) {
                    newTime = playbackRange.current.start;
                }
                // Animate a single point in time
                return { start: newTime, end: newTime };
            });
        }
        animationFrameId.current = requestAnimationFrame(animate);
    };

    animationFrameId.current = requestAnimationFrame(animate);

    return () => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
            lastFrameTime.current = 0;
        }
    };
  }, [isPlaying, playbackSpeed]);

  const handleTogglePlay = useCallback(() => {
    const aboutToPlay = !isPlaying;
    
    if (aboutToPlay) { // Starting or resuming
        // If it's a fresh start (not resuming from a pause)
        if (!isPaused) { 
            if (!timeRange || timeRange.start >= timeRange.end) return;
            playbackRange.current = { ...timeRange };
            setTimeRange({ start: timeRange.start, end: timeRange.start });
        }
        setIsPaused(false);
        setIsPlaying(true);
    } else { // Stopping
        setIsPaused(true);
        setIsPlaying(false);
    }
  }, [isPlaying, isPaused, timeRange]);

  const handleManualTimeRangeChange = (newRange: TimeRange) => {
    if (isPlaying) {
      setIsPlaying(false);
    }
    setIsPaused(false); // Manual interaction always resets the paused state
    playbackRange.current = null; // And the playback context
    setTimeRange(newRange);
  };

  const handleCellHover = useCallback((coords: GeoCoordinates) => {
    setHoveredCoords(coords);
    if (!coords || !coordinateTransformer) {
        setSelectedPixel(null);
        return;
    }
    const pixel = coordinateTransformer(coords.lat, coords.lon);
    if (pixel) {
        // Find topmost visible data/analysis layer for hover
        const topDataLayer = [...layers].reverse().find(l => l.visible && (l.type === 'data' || l.type === 'analysis'));
        if (topDataLayer) {
            setSelectedPixel({ ...pixel, layerId: topDataLayer.id });
        } else {
            setSelectedPixel(null);
        }
    } else {
        setSelectedPixel(null);
    }
  }, [coordinateTransformer, layers]);

  const handleMapClick = useCallback((coords: GeoCoordinates) => {
    if (activeTool !== 'measurement' || !coords || !coordinateTransformer) return;
    
    const pixel = coordinateTransformer(coords.lat, coords.lon);
    if (pixel) {
      setSelectedCells(prev => {
        const existingIndex = prev.findIndex(c => c.x === pixel.x && c.y === pixel.y);
        if (existingIndex > -1) {
          return prev.filter((_, i) => i !== existingIndex); // Deselect
        } else {
          return [...prev, pixel]; // Select
        }
      });
    }
  }, [activeTool, coordinateTransformer]);

  const handleClearSelection = useCallback(() => {
    setSelectedCells([]);
  }, []);

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

  const handleResetTimeZoom = useCallback(() => {
    if (fullTimeDomain) setTimeZoomDomain(fullTimeDomain);
  }, [fullTimeDomain]);

  const handleToggleFlicker = useCallback((layerId: string) => {
    const currentlyFlickeringId = flickeringLayerId;

    if (flickerIntervalRef.current) {
        clearInterval(flickerIntervalRef.current);
        flickerIntervalRef.current = null;
    }

    if (currentlyFlickeringId && originalVisibilityRef.current !== null) {
        handleUpdateLayer(currentlyFlickeringId, { visible: originalVisibilityRef.current });
    }

    if (currentlyFlickeringId === layerId) {
        setFlickeringLayerId(null);
        originalVisibilityRef.current = null;
    } else {
        const layerToFlicker = layers.find(l => l.id === layerId);
        if (layerToFlicker) {
            originalVisibilityRef.current = layerToFlicker.visible;
            setFlickeringLayerId(layerId);
        }
    }
  }, [layers, flickeringLayerId, handleUpdateLayer]);

  useEffect(() => {
    if (flickeringLayerId) {
        flickerIntervalRef.current = window.setInterval(() => {
            setLayers(prevLayers =>
                prevLayers.map(l =>
                    l.id === flickeringLayerId ? { ...l, visible: !l.visible } : l
                )
            );
        }, 400);
    }
    return () => {
        if (flickerIntervalRef.current) {
            clearInterval(flickerIntervalRef.current);
            flickerIntervalRef.current = null;
        }
    };
  }, [flickeringLayerId]);

  return (
    <div className="h-screen bg-gray-900 text-gray-200 flex flex-row font-sans overflow-hidden">
      <ToolBar activeTool={activeTool} onToolSelect={setActiveTool} />
      
      <SidePanel
        activeTool={activeTool}
        layers={layers}
        activeLayerId={activeLayerId}
        onActiveLayerChange={setActiveLayerId}
        onAddDataLayer={handleAddDataLayer}
        onAddBaseMapLayer={handleAddBaseMapLayer}
        onUpdateLayer={handleUpdateLayer}
        onRemoveLayer={handleRemoveLayer}
        onCalculateNightfallLayer={handleCalculateNightfallLayer}
        onCalculateDaylightFractionLayer={handleCalculateDaylightFractionLayer}
        isLoading={isLoading}
        isDataLoaded={!!primaryDataLayer}
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
            isDataLoaded={!!primaryDataLayer}
            showGrid={showGrid}
            gridSpacing={gridSpacing}
            gridColor={gridColor}
            activeTool={activeTool}
            selectedCells={selectedCells}
            selectionColor={selectionColor}
          />
        </section>
        
        <TimeSeriesPlot
          isDataLoaded={!!primaryDataLayer}
          timeSeriesData={timeSeriesData?.data ?? null}
          dataRange={timeSeriesData?.range ?? null}
          clipValue={timeSeriesData?.clipValue}
          timeRange={timeRange}
          fullTimeDomain={fullTimeDomain}
          timeZoomDomain={timeZoomDomain}
          onZoomToSelection={handleZoomToSelection}
          onResetZoom={handleResetTimeZoom}
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