import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { ToolBar } from './components/TopBar';
import { SidePanel } from './components/ControlPanel';
import { DataCanvas } from './components/DataCanvas';
import { TimeSlider } from './components/TimeSlider';
import { TimeSeriesPlot } from './components/TimeSeriesPlot';
import { parseNpy } from './services/npyParser';
import { parseVrt } from './services/vrtParser';
import type { DataSet, DataSlice, ColorMapName, GeoCoordinates, VrtData, ViewState, TimeRange, PixelCoords, TimeDomain, Tool, Layer, DataLayer, BaseMapLayer, AnalysisLayer } from './types';
import { indexToDate } from './utils/time';

declare const proj4: any;

// Geographic bounding box for the data
const LAT_RANGE: [number, number] = [-85.505, -85.26];
const LON_RANGE: [number, number] = [28.97, 32.53];

const App: React.FC = () => {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<string | null>(null); // Now stores loading message
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
  const [hoveredCoords, setHoveredCoords] = useState<GeoCoordinates>(null);
  const [showGraticule, setShowGraticule] = useState<boolean>(true);
  const [viewState, setViewState] = useState<ViewState | null>(null);
  const [graticuleDensity, setGraticuleDensity] = useState(1.0);
  const [activeTool, setActiveTool] = useState<Tool>('layers');
  
  const [selectedPixel, setSelectedPixel] = useState<PixelCoords & { layerId: string } | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<{data: number[], range: {min: number, max: number}} | null>(null);
  const [timeZoomDomain, setTimeZoomDomain] = useState<TimeDomain | null>(null);

  const baseMapLayer = useMemo(() => layers.find(l => l.type === 'basemap') as BaseMapLayer | undefined, [layers]);
  const dataLayers = useMemo(() => layers.filter(l => l.type === 'data' || l.type === 'analysis'), [layers]);
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
        } else {
            setTimeSeriesData(null);
        }
    } else {
        setTimeSeriesData(null);
    }
  }, [selectedPixel, layers]);

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
        dimensions: { time, height, width },
      };

      setLayers(prev => [...prev, newLayer]);
      setActiveLayerId(newLayer.id);

      // Initialize time controls if this is the first data layer
      if (!primaryDataLayer) {
        setTimeRange({ start: 0, end: time - 1 });
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
    setLayers(prevLayers => prevLayers.map(l => l.id === id ? { ...l, ...updates } : l));
  }, []);

  const handleRemoveLayer = useCallback((id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    if (activeLayerId === id) setActiveLayerId(null);
  }, [activeLayerId]);
  
  const handleCalculateAnalysisLayer = useCallback(async (sourceLayerId: string, params: AnalysisLayer['params']) => {
    const sourceLayer = layers.find(l => l.id === sourceLayerId) as DataLayer | undefined;
    if (!sourceLayer || !timeRange) return;

    setIsLoading(`Analyzing "${sourceLayer.name}"...`);
    await new Promise(r => setTimeout(r, 50));
    
    const { dataset } = sourceLayer;
    const { start, end } = timeRange;
    const { height, width } = sourceLayer.dimensions;
    const result: DataSlice = Array.from({ length: height }, () => new Array(width).fill(0));
    let trueMaxDuration = 0;
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let longestStreak = 0, currentStreak = 0;
            for (let t = start; t <= end; t++) {
                if (dataset[t][y][x] < params.computationThreshold) currentStreak++;
                else { if (currentStreak > longestStreak) longestStreak = currentStreak; currentStreak = 0; }
            }
            if (currentStreak > longestStreak) longestStreak = currentStreak;
            result[y][x] = Math.min(longestStreak, params.clippingThreshold);
            if (longestStreak > trueMaxDuration) trueMaxDuration = longestStreak;
        }
        if (y % 10 === 0) await yieldToMain();
    }
    const rangeMax = Math.min(trueMaxDuration, params.clippingThreshold);

    const newLayer: AnalysisLayer = {
        id: `analysis-${Date.now()}`, name: `Analysis of ${sourceLayer.name}`, type: 'analysis',
        visible: true, opacity: 0.75, colormap: 'Plasma',
        data: result, range: { min: 0, max: rangeMax > 0 ? rangeMax : 1 },
        sourceLayerId, params,
    };

    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newLayer.id);
    setIsLoading(null);
  }, [layers, timeRange]);

  const handleCellHover = useCallback((coords: GeoCoordinates) => {
    setHoveredCoords(coords);
    if (!coords || !coordinateTransformer) {
        setSelectedPixel(null);
        return;
    }
    const pixel = coordinateTransformer(coords.lat, coords.lon);
    if (pixel) {
        // Find topmost visible data layer for hover
        const topDataLayer = [...layers].reverse().find(l => l.visible && (l.type === 'data'));
        if (topDataLayer) {
            setSelectedPixel({ ...pixel, layerId: topDataLayer.id });
        } else {
            setSelectedPixel(null);
        }
    } else {
        setSelectedPixel(null);
    }
  }, [coordinateTransformer, layers]);

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
        onCalculateAnalysisLayer={handleCalculateAnalysisLayer}
        isLoading={isLoading}
        isDataLoaded={!!primaryDataLayer}
        hoveredCoords={hoveredCoords}
        selectedPixel={selectedPixel}
        timeRange={timeRange}
        showGraticule={showGraticule}
        onShowGraticuleChange={setShowGraticule}
        graticuleDensity={graticuleDensity}
        onGraticuleDensityChange={setGraticuleDensity}
      />
      
      <main className="flex-grow flex flex-col min-w-0">
        <section className="flex-grow flex items-center justify-center bg-black/20 p-4 sm:p-6 lg:p-8 min-h-0">
          <DataCanvas
            layers={layers}
            timeIndex={timeRange?.start ?? 0}
            onCellHover={handleCellHover}
            onCellLeave={clearHoverState}
            latRange={LAT_RANGE}
            lonRange={LON_RANGE}
            showGraticule={showGraticule}
            graticuleDensity={graticuleDensity}
            proj={proj}
            viewState={viewState}
            onViewStateChange={setViewState}
            isDataLoaded={!!primaryDataLayer}
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
        />

        <TimeSlider
          isDataLoaded={!!primaryDataLayer}
          timeRange={timeRange}
          maxTimeIndex={primaryDataLayer?.dimensions.time ? primaryDataLayer.dimensions.time - 1 : 0}
          onTimeRangeChange={setTimeRange}
          timeZoomDomain={timeZoomDomain}
        />
      </main>
    </div>
  );
};

export default App;
