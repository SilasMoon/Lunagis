import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { DataSlice, GeoCoordinates, ViewState, Layer, BaseMapLayer, DataLayer, AnalysisLayer } from '../types';
import { getColorScale } from '../services/colormap';
import { ZoomControls } from './ZoomControls';

declare const d3: any;
declare const proj4: any;

interface DataCanvasProps {
  layers: Layer[];
  timeIndex: number;
  onCellHover: (coords: GeoCoordinates) => void;
  onCellLeave: () => void;
  latRange: [number, number];
  lonRange: [number, number];
  showGraticule: boolean;
  graticuleDensity: number;
  proj: any | null;
  viewState: ViewState | null;
  onViewStateChange: (vs: ViewState | null) => void;
  isDataLoaded: boolean;
}

const LoadingSpinner: React.FC = () => (
    <div className="flex flex-col items-center justify-center text-gray-400">
        <svg className="animate-spin h-10 w-10 text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="mt-4">Rendering...</p>
    </div>
);

export const DataCanvas: React.FC<DataCanvasProps> = ({ 
  layers, timeIndex, onCellHover, onCellLeave, latRange, lonRange, 
  showGraticule, graticuleDensity, proj, viewState, onViewStateChange, isDataLoaded
}) => {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const dataCanvasRef = useRef<HTMLCanvasElement>(null);
  const graticuleCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isRendering, setIsRendering] = useState(false);
  const offscreenCanvasCache = useRef(new Map<string, HTMLCanvasElement>()).current;
  const initialViewCalculated = useRef(false);
  
  const isPanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const [initialViewState, setInitialViewState] = useState<ViewState | null>(null);

  const primaryDataLayer = useMemo(() => layers.find(l => l.type === 'data') as DataLayer | undefined, [layers]);
  const baseMapLayer = useMemo(() => layers.find(l => l.type === 'basemap') as BaseMapLayer | undefined, [layers]);

  const combinedBounds = useMemo(() => {
    if (!primaryDataLayer && !baseMapLayer) return null;
    let dataProjBounds = null;
    if (primaryDataLayer && proj) {
        const [lonMin, lonMax] = lonRange; const [latMin, latMax] = latRange;
        const corners = [[lonMin, latMin], [lonMax, latMin], [lonMax, latMax], [lonMin, latMax]].map(c => proj.forward(c));
        dataProjBounds = {
            minX: Math.min(...corners.map(c => c[0])), maxX: Math.max(...corners.map(c => c[0])),
            minY: Math.min(...corners.map(c => c[1])), maxY: Math.max(...corners.map(c => c[1])),
        };
    }
    
    let baseMapProjBounds = null;
    if (baseMapLayer) {
        const gt = baseMapLayer.vrt.geoTransform;
        baseMapProjBounds = { minX: gt[0], maxX: gt[0] + baseMapLayer.vrt.width * gt[1], minY: gt[3] + baseMapLayer.vrt.height * gt[5], maxY: gt[3] };
    }
    
    if (dataProjBounds && baseMapProjBounds) return {
        minX: Math.min(dataProjBounds.minX, baseMapProjBounds.minX), maxX: Math.max(dataProjBounds.maxX, baseMapProjBounds.maxX),
        minY: Math.min(dataProjBounds.minY, baseMapProjBounds.minY), maxY: Math.max(dataProjBounds.maxY, baseMapProjBounds.maxY),
    };
    return dataProjBounds || baseMapProjBounds;
  }, [primaryDataLayer, baseMapLayer, proj, lonRange, latRange]);

  useEffect(() => {
    const canvas = graticuleCanvasRef.current;
    if (!combinedBounds || !canvas || (viewState && initialViewCalculated.current)) return;
    
    const { clientWidth, clientHeight } = canvas;
    if (clientWidth === 0 || clientHeight === 0) return;

    const projWidth = combinedBounds.maxX - combinedBounds.minX;
    const projHeight = combinedBounds.maxY - combinedBounds.minY;
    const scale = Math.min(clientWidth / projWidth, clientHeight / projHeight) * 0.95;
    const center: [number, number] = [combinedBounds.minX + projWidth / 2, combinedBounds.minY + projHeight / 2];

    const newInitialViewState = { center, scale };
    setInitialViewState(newInitialViewState);
    onViewStateChange(newInitialViewState);
    initialViewCalculated.current = true;
  }, [combinedBounds, onViewStateChange, viewState]);
  
  useEffect(() => { initialViewCalculated.current = false; }, [layers]);

  const canvasToProjCoords = useCallback((canvasX: number, canvasY: number): [number, number] | null => {
    const canvas = graticuleCanvasRef.current;
    if (!canvas || !viewState) return null;
    const dpr = window.devicePixelRatio || 1;
    const { center, scale } = viewState;
    const projX = (canvasX * dpr - canvas.width / 2) / (scale * dpr) + center[0];
    const projY = -(canvasY * dpr - canvas.height / 2) / (scale * dpr) + center[1];
    return [projX, projY];
  }, [viewState]);

  useEffect(() => {
    const canvases = [baseCanvasRef.current, dataCanvasRef.current, graticuleCanvasRef.current];
    if (canvases.some(c => !c) || !viewState) return;
    if (!isDataLoaded) return;

    setIsRendering(true);
    const renderStartTime = performance.now();

    const [baseCanvas, dataCanvas, graticuleCanvas] = canvases as HTMLCanvasElement[];
    const dpr = window.devicePixelRatio || 1;
    
    [baseCanvas, dataCanvas, graticuleCanvas].forEach(canvas => {
      const { clientWidth, clientHeight } = canvas.parentElement!;
      canvas.width = clientWidth * dpr; canvas.height = clientHeight * dpr;
    });

    const baseCtx = baseCanvas.getContext('2d')!;
    const dataCtx = dataCanvas.getContext('2d')!;
    const gratCtx = graticuleCanvas.getContext('2d')!;
    const contexts = [baseCtx, dataCtx, gratCtx];

    const { center, scale } = viewState;
    contexts.forEach(ctx => {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.save();
        ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
        const effectiveScale = scale * dpr; ctx.scale(effectiveScale, -effectiveScale);
        ctx.translate(-center[0], -center[1]); ctx.imageSmoothingEnabled = false;
    });

    // --- Render Layers ---
    layers.forEach(layer => {
      if (!layer.visible) return;
      
      if (layer.type === 'basemap') {
        const gt = layer.vrt.geoTransform;
        baseCtx.save(); baseCtx.globalAlpha = layer.opacity;
        baseCtx.transform(gt[1], gt[4], gt[2], gt[5], gt[0], gt[3]);
        baseCtx.drawImage(layer.image, 0, 0);
        baseCtx.restore();
      } 
      else if ((layer.type === 'data' || layer.type === 'analysis') && proj) {
        const slice = layer.type === 'data' ? layer.dataset[timeIndex] : layer.data;
        if (!slice) return;

        let offscreenCanvas = offscreenCanvasCache.get(layer.id);
        const cacheKey = `${layer.colormap}-${layer.range.min}-${layer.range.max}`;
        const storedCacheKey = offscreenCanvas?.dataset.cacheKey;

        if (!offscreenCanvas || cacheKey !== storedCacheKey) {
            const width = slice[0].length; const height = slice.length;
            offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = width; offscreenCanvas.height = height;
            const offscreenCtx = offscreenCanvas.getContext('2d')!;
            
            const colorScale = getColorScale(layer.colormap, [layer.range.min, layer.range.max]);
            const imageData = offscreenCtx.createImageData(width, height);
            for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) {
                    const color = d3.color(colorScale(slice[y][x])); const index = (y * width + x) * 4;
                    imageData.data[index] = color.r; imageData.data[index + 1] = color.g;
                    imageData.data[index + 2] = color.b; imageData.data[index + 3] = 255;
            }}
            offscreenCtx.putImageData(imageData, 0, 0);
            offscreenCanvas.dataset.cacheKey = cacheKey;
            offscreenCanvasCache.set(layer.id, offscreenCanvas);
        }
        
        dataCtx.save(); dataCtx.globalAlpha = layer.opacity;
        const [lonMin, lonMax] = lonRange; const [latMin, latMax] = latRange;
        const c_tl = proj.forward([lonMin, latMax]); const c_tr = proj.forward([lonMax, latMax]); const c_bl = proj.forward([lonMin, latMin]);
        const a = (c_tr[0] - c_tl[0]) / offscreenCanvas.width; const b = (c_tr[1] - c_tl[1]) / offscreenCanvas.width;
        const c = (c_bl[0] - c_tl[0]) / offscreenCanvas.height; const d = (c_bl[1] - c_tl[1]) / offscreenCanvas.height;
        const e = c_tl[0]; const f = c_tl[1];
        dataCtx.transform(a, b, c, d, e, f);
        dataCtx.drawImage(offscreenCanvas, 0, 0);
        dataCtx.restore();
      }
    });

    if (showGraticule && proj) {
        gratCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; gratCtx.lineWidth = 1 / (scale * dpr);
        const { clientWidth, clientHeight } = graticuleCanvas;
        const samplePoints = [ [0, 0], [clientWidth / 2, 0], [clientWidth, 0], [clientWidth, clientHeight / 2], [clientWidth, clientHeight], [clientWidth / 2, clientHeight], [0, clientHeight], [0, clientHeight / 2] ].map(p => canvasToProjCoords(p[0], p[1]));
        const geoPoints = samplePoints.filter(p => p !== null).map(p => { try { return proj4('EPSG:4326', proj).inverse(p!); } catch (e) { return null; } }).filter((p): p is [number, number] => p !== null);
        
        let lonSpan = 1, latSpan = 1;
        if (geoPoints.length > 0) {
            const viewLonMin = Math.min(...geoPoints.map(p => p[0])), viewLonMax = Math.max(...geoPoints.map(p => p[0]));
            const viewLatMin = Math.min(...geoPoints.map(p => p[1])), viewLatMax = Math.max(...geoPoints.map(p => p[1]));
            lonSpan = Math.abs(viewLonMax - viewLonMin); if (lonSpan > 180) lonSpan = 360 - lonSpan;
            latSpan = Math.abs(viewLatMax - viewLatMin);
        }
        
        const calcStep = (span: number) => { if (span <= 0) return 1; const r = span / (5 * graticuleDensity), p = Math.pow(10, Math.floor(Math.log10(r))), m = r / p; if (m < 1.5) return p; if (m < 3.5) return 2*p; if (m < 7.5) return 5*p; return 10*p; };
        const lonStep = calcStep(lonSpan); const latStep = calcStep(latSpan);
        const p_tl = canvasToProjCoords(0, 0); const p_br = canvasToProjCoords(clientWidth, clientHeight);

        if (p_tl && p_br) {
            const [projXMin, projYMin] = [p_tl[0], p_br[1]], [projXMax, projYMax] = [p_br[0], p_tl[1]];
            const centerGeo = proj4('EPSG:4326', proj).inverse(viewState.center);
            const anchorLon = Math.round(centerGeo[0] / lonStep) * lonStep; const anchorLat = Math.round(centerGeo[1] / latStep) * latStep;

            const drawLabel = (text: string, p: [number, number]) => { gratCtx.save(); gratCtx.translate(p[0], p[1]); const invScale = 1 / (scale * dpr); gratCtx.scale(invScale, -invScale); gratCtx.fillStyle = 'rgba(255, 255, 255, 0.95)'; gratCtx.font = `12px sans-serif`; gratCtx.strokeStyle = 'rgba(0, 0, 0, 0.8)'; gratCtx.lineWidth = 2; gratCtx.textAlign = 'left'; gratCtx.textBaseline = 'top'; gratCtx.strokeText(text, 5, 5); gratCtx.fillText(text, 5, 5); gratCtx.restore(); };
            
            for (let lon = -180; lon <= 180; lon += lonStep) {
                gratCtx.beginPath(); for (let i = 0; i <= 100; i++) { const lat = -90 + (i/100)*40, pt = proj.forward([lon, lat]); if (i === 0) gratCtx.moveTo(pt[0], pt[1]); else gratCtx.lineTo(pt[0], pt[1]); } gratCtx.stroke();
                try { const p = proj.forward([lon, anchorLat]); if (p[0] >= projXMin && p[0] <= projXMax && p[1] >= projYMin && p[1] <= projYMax) drawLabel(`${lon.toFixed(1)}°`, p); } catch(e) {}
            }
            for (let lat = -90; lat <= -50; lat += latStep) {
                gratCtx.beginPath(); for (let i = 0; i <= 200; i++) { const lon = -180 + (i/200)*360, pt = proj.forward([lon, lat]); if (i === 0) gratCtx.moveTo(pt[0], pt[1]); else gratCtx.lineTo(pt[0], pt[1]); } gratCtx.stroke();
                try { const p = proj.forward([anchorLon, lat]); if (p[0] >= projXMin && p[0] <= projXMax && p[1] >= projYMin && p[1] <= projYMax) drawLabel(`${lat.toFixed(1)}°`, p); } catch(e) {}
            }
        }
    }
    contexts.forEach(ctx => ctx.restore());
    if(performance.now() - renderStartTime > 16) requestAnimationFrame(() => setIsRendering(false)); else setIsRendering(false);
  }, [layers, timeIndex, showGraticule, graticuleDensity, proj, viewState, isDataLoaded, latRange, lonRange, canvasToProjCoords]);

  const handleInteractionMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning.current && viewState) {
        const dx = e.clientX - lastMousePos.current.x; const dy = e.clientY - lastMousePos.current.y;
        const dpr = window.devicePixelRatio || 1;
        const newCenter: [number, number] = [ viewState.center[0] - dx / (viewState.scale * dpr), viewState.center[1] + dy / (viewState.scale * dpr) ];
        onViewStateChange({ ...viewState, center: newCenter });
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const projCoords = canvasToProjCoords(e.clientX - rect.left, e.clientY - rect.top);
    if (projCoords && proj) {
        try { const [lon, lat] = proj4('EPSG:4326', proj).inverse(projCoords); onCellHover({ lat, lon }); } catch(e) { onCellLeave(); }
    } else { onCellLeave(); }
  }, [viewState, onViewStateChange, canvasToProjCoords, proj, onCellHover, onCellLeave]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => { isPanning.current = true; lastMousePos.current = { x: e.clientX, y: e.clientY }; e.currentTarget.style.cursor = 'grabbing'; };
  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => { isPanning.current = false; e.currentTarget.style.cursor = 'crosshair'; };
  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => { isPanning.current = false; e.currentTarget.style.cursor = 'crosshair'; onCellLeave(); };
  
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!viewState) return; e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseProjBefore = canvasToProjCoords(e.clientX - rect.left, e.clientY - rect.top);
    if (!mouseProjBefore) return;
    const zoomFactor = 1 - e.deltaY * 0.001; const newScale = viewState.scale * zoomFactor;
    const dpr = window.devicePixelRatio || 1;
    const newCenter: [number, number] = [ mouseProjBefore[0] - ( (e.clientX-rect.left) * dpr - e.currentTarget.offsetWidth * dpr / 2) / (newScale * dpr), mouseProjBefore[1] + ( (e.clientY-rect.top) * dpr - e.currentTarget.offsetHeight * dpr / 2) / (newScale * dpr) ];
    onViewStateChange({ scale: newScale, center: newCenter });
  };
  
  const handleZoomAction = useCallback((factor: number) => { if (!viewState) return; onViewStateChange({ ...viewState, scale: viewState.scale * factor }); }, [viewState, onViewStateChange]);
  const handleResetView = useCallback(() => { if(initialViewState) { onViewStateChange(initialViewState); } }, [initialViewState, onViewStateChange]);

  if (!isDataLoaded) {
    return (<div className="w-full h-full flex items-center justify-center text-center text-gray-400 bg-gray-900/50 rounded-lg"><div><h3 className="text-xl font-semibold">No Data Loaded</h3><p className="mt-2">Use the Layers panel to load a basemap or data file.</p></div></div>);
  }

  return (
    <div className="w-full h-full relative" onMouseMove={handleInteractionMove} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onWheel={handleWheel}>
      {isRendering && <div className="absolute inset-0 flex items-center justify-center bg-gray-800/50 z-50"><LoadingSpinner /></div>}
      <canvas ref={baseCanvasRef} className="pixelated absolute inset-0 w-full h-full z-0" />
      <canvas ref={dataCanvasRef} className="pixelated absolute inset-0 w-full h-full z-10" />
      <canvas ref={graticuleCanvasRef} className="absolute inset-0 w-full h-full z-30 cursor-crosshair" />
      <ZoomControls onZoomIn={() => handleZoomAction(1.5)} onZoomOut={() => handleZoomAction(1 / 1.5)} onResetView={handleResetView} />
    </div>
  );
};
