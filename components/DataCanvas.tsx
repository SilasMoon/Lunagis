// Fix: Removed invalid file header which was causing parsing errors.
import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { DataSlice, GeoCoordinates, ViewState, Layer, BaseMapLayer, DataLayer, AnalysisLayer, ImageLayer, TimeRange, Tool, Artifact, DteCommsLayer, LpfCommsLayer, Waypoint, PathArtifact, CircleArtifact, RectangleArtifact } from '../types';
import { getColorScale } from '../services/colormap';
import { ZoomControls } from './ZoomControls';
import { useAppContext } from '../context/AppContext';
import { OptimizedCanvasLRUCache } from '../utils/OptimizedLRUCache';
import { useDebounce } from '../hooks/useDebounce';

declare const d3: any;
declare const proj4: any;

/**
 * Fast hash function for custom colormap
 * Replaces expensive JSON.stringify for cache key generation
 */
const hashColormap = (colormap: Array<{ value: number; color: string }> | undefined): string => {
  if (!colormap || colormap.length === 0) return '';
  return colormap.map(s => `${s.value}:${s.color}`).join('|');
};

/**
 * Create a pre-computed color lookup table
 * This replaces 1M+ d3.color() calls with 256 calls + fast array lookups
 * @param colorScale - D3 color scale function
 * @param colorDomain - [min, max] value range
 * @param steps - Number of lookup table entries (default 256)
 * @returns Uint8ClampedArray with RGBA values (4 bytes per color)
 */
const createColorLookupTable = (
  colorScale: any,
  colorDomain: [number, number],
  steps: number = 256
): Uint8ClampedArray => {
  const table = new Uint8ClampedArray(steps * 4);
  const [minVal, maxVal] = colorDomain;
  const range = maxVal - minVal;

  for (let i = 0; i < steps; i++) {
    // Map lookup index to actual data value
    const value = minVal + (range * i) / (steps - 1);
    const color = d3.color(colorScale(value));

    if (color) {
      const baseIdx = i * 4;
      table[baseIdx] = color.r;
      table[baseIdx + 1] = color.g;
      table[baseIdx + 2] = color.b;
      table[baseIdx + 3] = color.opacity * 255;
    }
  }

  return table;
};

/**
 * Calculate the Haversine distance between two geographic coordinates
 * @param coord1 - [lon, lat] in degrees
 * @param coord2 - [lon, lat] in degrees
 * @returns Distance in meters
 */
const calculateGeoDistance = (coord1: [number, number], coord2: [number, number]): number => {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

const LoadingSpinner: React.FC = () => (
    <div className="flex flex-col items-center justify-center text-gray-400">
        <svg className="animate-spin h-10 w-10 text-cyan-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="mt-4">Rendering...</p>
    </div>
);

export const DataCanvas: React.FC = () => {
  const {
    layers, timeRange, currentDateIndex, setHoveredCoords, setSelectedPixel, onFinishArtifactCreation, onUpdateArtifact,
    clearHoverState, latRange, lonRange, showGraticule, graticuleDensity, proj, viewState,
    setViewState, primaryDataLayer, baseMapLayer, showGrid, gridSpacing, gridColor, activeTool, selectedCells,
    selectionColor, artifacts, artifactCreationMode, draggedInfo, setDraggedInfo, artifactDisplayOptions,
    isAppendingWaypoints, coordinateTransformer, snapToCellCorner, calculateRectangleFromCellCorners,
    setActiveArtifactId, setArtifacts, setSelectedCells, activeLayerId, onUpdateLayer, pathCreationOptions,
    activeArtifactId, setSelectedCellForPlot, selectedCellForPlot
  } = useAppContext();

  const timeIndex = currentDateIndex ?? 0;
  const debouncedTimeRange = timeRange;
  const isDataLoaded = !!primaryDataLayer || !!baseMapLayer;

  // Debounce non-critical rendering dependencies to reduce re-render frequency
  // Use short delay for pan/zoom (smooth interaction), longer for less critical changes
  const debouncedGraticuleDensity = useDebounce(graticuleDensity, 100);
  const debouncedShowGrid = useDebounce(showGrid, 50);
  const debouncedGridSpacing = useDebounce(gridSpacing, 100);

  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const dataCanvasRef = useRef<HTMLCanvasElement>(null);
  const artifactCanvasRef = useRef<HTMLCanvasElement>(null);
  const graticuleCanvasRef = useRef<HTMLCanvasElement>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isRendering, setIsRendering] = useState(false);
  // LRU cache: max 50 canvases or 500MB, whichever is hit first
  // Using optimized doubly-linked list implementation for O(1) operations
  const offscreenCanvasCache = useRef(new OptimizedCanvasLRUCache(50, 500)).current;

  // Calculate combined bounds for all layers - defined before graticule cache to avoid initialization issues
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

  // Cache graticule projected points - only recalculates when layers/projection/density change
  const graticuleLinesCache = useMemo(() => {
    if (!proj || !combinedBounds || !debouncedGraticuleDensity || debouncedGraticuleDensity <= 0) return null;

    try {
      const { minX, maxX, minY, maxY } = combinedBounds;

      // Sample bounds to determine appropriate step size
      const samplePoints = [
        [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]
      ];
      const geoPoints = samplePoints.map(p => {
        try { return proj4('EPSG:4326', proj).inverse(p); }
        catch (e) { return null; }
      }).filter((p): p is [number, number] => p !== null);

      let lonSpan = 360, latSpan = 180;
      if (geoPoints.length > 0) {
        const viewLonMin = Math.min(...geoPoints.map(p => p[0]));
        const viewLonMax = Math.max(...geoPoints.map(p => p[0]));
        const viewLatMin = Math.min(...geoPoints.map(p => p[1]));
        const viewLatMax = Math.max(...geoPoints.map(p => p[1]));
        lonSpan = Math.abs(viewLonMax - viewLonMin);
        if (lonSpan > 180) lonSpan = 360 - lonSpan;
        latSpan = Math.abs(viewLatMax - viewLatMin);
      }

      const calcStep = (span: number) => {
        if (span <= 0) return 1;
        const r = span / (5 * debouncedGraticuleDensity);
        if (r <= 0) return 1;
        const p = Math.pow(10, Math.floor(Math.log10(r)));
        const m = r / p;
        if (m < 1.5) return p;
        if (m < 3.5) return 2 * p;
        if (m < 7.5) return 5 * p;
        return 10 * p;
      };

      const lonStep = calcStep(lonSpan);
      const latStep = calcStep(latSpan);

      // Pre-calculate all graticule lines as arrays of projected points
      const lonLines: Array<{ lon: number; points: Array<[number, number]> }> = [];
      const latLines: Array<{ lat: number; points: Array<[number, number]> }> = [];

      // Calculate longitude lines (meridians)
      for (let lon = -180; lon <= 180; lon += lonStep) {
        const points: Array<[number, number]> = [];
        for (let i = 0; i <= 100; i++) {
          const lat = -90 + (i / 100) * 180;
          try {
            const pt = proj.forward([lon, lat]);
            if (isFinite(pt[0]) && isFinite(pt[1])) {
              points.push([pt[0], pt[1]]);
            }
          } catch (err) {
            // Skip invalid points
          }
        }
        if (points.length >= 2) {
          lonLines.push({ lon, points });
        }
      }

      // Calculate latitude lines (parallels)
      for (let lat = -90; lat <= 90; lat += latStep) {
        const points: Array<[number, number]> = [];
        for (let i = 0; i <= 200; i++) {
          const lon = -180 + (i / 200) * 360;
          try {
            const pt = proj.forward([lon, lat]);
            if (isFinite(pt[0]) && isFinite(pt[1])) {
              points.push([pt[0], pt[1]]);
            }
          } catch (err) {
            // Skip invalid points
          }
        }
        if (points.length >= 2) {
          latLines.push({ lat, points });
        }
      }

      return { lonLines, latLines, lonStep, latStep };
    } catch (error) {
      console.error('Error calculating graticule cache:', error);
      return null;
    }
  }, [proj, combinedBounds, debouncedGraticuleDensity]);

  const initialViewCalculated = useRef(false);
  
  const isPanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const [initialViewState, setInitialViewState] = useState<ViewState | null>(null);
  const [hoveredArtifactId, setHoveredArtifactId] = useState<string | null>(null);
  const [hoveredWaypointInfo, setHoveredWaypointInfo] = useState<{ artifactId: string; waypointId: string } | null>(null);
  const [rectangleFirstCorner, setRectangleFirstCorner] = useState<[number, number] | null>(null);
  const [currentMouseProjCoords, setCurrentMouseProjCoords] = useState<[number, number] | null>(null);

  // Image layer transformation state
  const [imageLayerDragInfo, setImageLayerDragInfo] = useState<{
    layerId: string;
    handleType: 'center' | 'corner' | 'edge';
    handleIndex?: number; // 0-3 for corners or edges
    initialMouseProj: [number, number];
    initialPosition: [number, number];
    initialScaleX: number;
    initialScaleY: number;
    initialRotation: number;
  } | null>(null);

  // Clear rectangle first corner when exiting rectangle creation mode
  useEffect(() => {
    if (artifactCreationMode !== 'rectangle') {
      setRectangleFirstCorner(null);
    }
  }, [artifactCreationMode]);

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
    setViewState(newInitialViewState);
    initialViewCalculated.current = true;
  }, [combinedBounds, setViewState, viewState]);
  
  useEffect(() => { initialViewCalculated.current = false; }, [layers]);

  const canvasToProjCoords = useCallback((canvasX: number, canvasY: number): [number, number] | null => {
    const canvas = graticuleCanvasRef.current;
    if (!canvas || !viewState) return null;
    // Validate canvas has been properly sized before using dimensions
    if (canvas.width === 0 || canvas.height === 0) return null;
    const dpr = window.devicePixelRatio || 1;
    const { center, scale } = viewState;
    const projX = (canvasX * dpr - canvas.width / 2) / (scale * dpr) + center[0];
    const projY = -(canvasY * dpr - canvas.height / 2) / (scale * dpr) + center[1];
    return [projX, projY];
  }, [viewState]);

  // Helper function to check if clicking on an image layer handle
  const getImageLayerHandle = useCallback((projCoords: [number, number]): { layerId: string; handleType: 'center' | 'corner' | 'edge'; handleIndex?: number } | null => {
    try {
      if (!viewState || !activeLayerId || !projCoords) return null;
      const activeImageLayer = layers.find(l => l.id === activeLayerId && l.type === 'image');
      if (!activeImageLayer || activeImageLayer.type !== 'image') return null;

      const layer = activeImageLayer;
      if (!layer.originalWidth || !layer.originalHeight || !layer.scaleX || !layer.scaleY || !layer.position) return null;

      const displayWidth = layer.originalWidth * layer.scaleX;
      const displayHeight = layer.originalHeight * layer.scaleY;
      const handleSize = 12 / viewState.scale;

    // Transform point to layer's local coordinates
    const dx = projCoords[0] - layer.position[0];
    const dy = projCoords[1] - layer.position[1];
    const rotationRad = (layer.rotation * Math.PI) / 180;
    const cosR = Math.cos(-rotationRad);
    const sinR = Math.sin(-rotationRad);
    const localX = dx * cosR - dy * sinR;
    const localY = dx * sinR + dy * cosR;

    // Check center handle
    if (Math.abs(localX) < handleSize && Math.abs(localY) < handleSize) {
      return { layerId: layer.id, handleType: 'center' };
    }

    // Check corner handles
    const corners = [
      [-displayWidth / 2, -displayHeight / 2],
      [displayWidth / 2, -displayHeight / 2],
      [displayWidth / 2, displayHeight / 2],
      [-displayWidth / 2, displayHeight / 2]
    ];
    for (let i = 0; i < corners.length; i++) {
      const [cx, cy] = corners[i];
      if (Math.abs(localX - cx) < handleSize && Math.abs(localY - cy) < handleSize) {
        return { layerId: layer.id, handleType: 'corner', handleIndex: i };
      }
    }

    // Check edge handles
    const edges = [
      [0, -displayHeight / 2],
      [displayWidth / 2, 0],
      [0, displayHeight / 2],
      [-displayWidth / 2, 0]
    ];
    for (let i = 0; i < edges.length; i++) {
      const [ex, ey] = edges[i];
      if (Math.abs(localX - ex) < handleSize && Math.abs(localY - ey) < handleSize) {
        return { layerId: layer.id, handleType: 'edge', handleIndex: i };
      }
    }

    return null;
    } catch (error) {
      console.error('Error in getImageLayerHandle:', error);
      return null;
    }
  }, [viewState, layers, activeLayerId]);

  // Attach wheel event listener with passive: false to allow preventDefault()
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!viewState) return;

      // Prevent default scrolling behavior
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;

      const mouseProjBefore = canvasToProjCoords(offsetX, offsetY);
      if (!mouseProjBefore) return;

      const zoomFactor = 1 - e.deltaY * 0.001;
      const newScale = viewState.scale * zoomFactor;
      const dpr = window.devicePixelRatio || 1;
      const newCenter: [number, number] = [
        mouseProjBefore[0] - ((offsetX) * dpr - container.offsetWidth * dpr / 2) / (newScale * dpr),
        mouseProjBefore[1] + ((offsetY) * dpr - container.offsetHeight * dpr / 2) / (newScale * dpr)
      ];
      setViewState({ scale: newScale, center: newCenter });
    };

    // Register with passive: false to allow preventDefault()
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [viewState, canvasToProjCoords, setViewState]);

  useEffect(() => {
    const canvases = [baseCanvasRef.current, dataCanvasRef.current, graticuleCanvasRef.current];
    if (canvases.some(c => !c) || !viewState) return;
    if (!isDataLoaded) return;

    setIsRendering(true);
    const renderStartTime = performance.now();

    const [baseCanvas, dataCanvas, graticuleCanvas] = canvases as HTMLCanvasElement[];
    const dpr = window.devicePixelRatio || 1;
    
    [baseCanvas, dataCanvas, graticuleCanvas].forEach(canvas => {
      if (!canvas.parentElement) return; // Guard against null parentElement
      const { clientWidth, clientHeight } = canvas.parentElement;
      canvas.width = clientWidth * dpr; canvas.height = clientHeight * dpr;
    });

    const baseCtx = baseCanvas.getContext('2d');
    const dataCtx = dataCanvas.getContext('2d');
    const gratCtx = graticuleCanvas.getContext('2d');
    if (!baseCtx || !dataCtx || !gratCtx) return; // Guard against null contexts
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
      else if (layer.type === 'image') {
        // Render image layer with transformation
        baseCtx.save();
        baseCtx.globalAlpha = layer.opacity;

        // Move to the image position
        baseCtx.translate(layer.position[0], layer.position[1]);

        // Apply rotation
        const rotationRad = (layer.rotation * Math.PI) / 180;
        baseCtx.rotate(rotationRad);

        // Flip Y-axis back since the global context has inverted Y
        baseCtx.scale(1, -1);

        // Apply scaling
        const displayWidth = layer.originalWidth * layer.scaleX;
        const displayHeight = layer.originalHeight * layer.scaleY;

        // Draw image centered at position
        baseCtx.drawImage(
          layer.image,
          -displayWidth / 2,
          -displayHeight / 2,
          displayWidth,
          displayHeight
        );

        baseCtx.restore();
      }
      else if ((layer.type === 'data' || layer.type === 'analysis' || layer.type === 'dte_comms' || layer.type === 'lpf_comms') && proj) {
        let cacheKey: string;
        const invertedStr = !!layer.colormapInverted;
        let baseKey: string;

        if (layer.type === 'analysis' && layer.analysisType === 'daylight_fraction' && debouncedTimeRange) {
          baseKey = `${layer.id}-${debouncedTimeRange.start}-${debouncedTimeRange.end}-${layer.colormap}-${invertedStr}`;
        } else {
          baseKey = `${layer.id}-${timeIndex}-${layer.colormap}-${invertedStr}-${layer.range.min}-${layer.range.max}`;
          if (layer.type === 'analysis' && layer.analysisType === 'nightfall') {
            baseKey += `-${layer.params.clipValue}`;
          }
        }
        if (layer.colormap === 'Custom') {
            baseKey += `-${hashColormap(layer.customColormap)}`;
        }
        // Include transparency thresholds in cache key
        if (layer.transparencyLowerThreshold !== undefined) {
            baseKey += `-lt${layer.transparencyLowerThreshold}`;
        }
        if (layer.transparencyUpperThreshold !== undefined) {
            baseKey += `-ut${layer.transparencyUpperThreshold}`;
        }
        cacheKey = baseKey;
        
        let offscreenCanvas = offscreenCanvasCache.get(cacheKey);

        if (!offscreenCanvas) {
          const slice = layer.dataset[layer.type === 'analysis' && layer.analysisType === 'daylight_fraction' ? 0 : timeIndex];
          if (!slice) return;

          const { width, height } = layer.dimensions;
          offscreenCanvas = document.createElement('canvas');
          offscreenCanvas.width = width; offscreenCanvas.height = height;
          const offscreenCtx = offscreenCanvas.getContext('2d')!;
          
          let colorDomain: [number, number];
          const isThreshold = layer.colormap === 'Custom';

          if (layer.type === 'analysis' && layer.analysisType === 'nightfall') {
             colorDomain = [layer.range.min, layer.params.clipValue ?? layer.range.max];
          } else {
            colorDomain = [layer.range.min, layer.range.max];
          }
          
          const colorScale = getColorScale(layer.colormap, colorDomain, layer.colormapInverted, layer.customColormap, isThreshold);
          const imageData = offscreenCtx.createImageData(width, height);

          // Pre-compute color lookup table (256 colors instead of 1M+ d3.color() calls)
          const colorLUT = createColorLookupTable(colorScale, colorDomain, 256);
          const [minVal, maxVal] = colorDomain;
          const valueRange = maxVal - minVal;

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const value = slice[y][x];
              const pixelIdx = (y * width + x) * 4;

              // Map value to lookup table index (0-255)
              let normalized = (value - minVal) / valueRange;
              normalized = Math.max(0, Math.min(1, normalized)); // Clamp to [0, 1]
              const lutIdx = Math.floor(normalized * 255) * 4;

              // Fast lookup instead of d3.color() call
              imageData.data[pixelIdx] = colorLUT[lutIdx];
              imageData.data[pixelIdx + 1] = colorLUT[lutIdx + 1];
              imageData.data[pixelIdx + 2] = colorLUT[lutIdx + 2];
              imageData.data[pixelIdx + 3] = colorLUT[lutIdx + 3];

              // Apply transparency thresholds
              if (layer.transparencyLowerThreshold !== undefined && value <= layer.transparencyLowerThreshold) {
                imageData.data[pixelIdx + 3] = 0; // Set alpha to transparent
              }
              if (layer.transparencyUpperThreshold !== undefined && value >= layer.transparencyUpperThreshold) {
                imageData.data[pixelIdx + 3] = 0; // Set alpha to transparent
              }
            }
          }
          offscreenCtx.putImageData(imageData, 0, 0);
          offscreenCanvasCache.set(cacheKey, offscreenCanvas);
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
    
    const { clientWidth, clientHeight } = graticuleCanvas;
    const p_tl = canvasToProjCoords(0, 0);
    const p_br = canvasToProjCoords(clientWidth * (window.devicePixelRatio || 1), clientHeight * (window.devicePixelRatio || 1));

    if (p_tl && p_br) {
        const [projXMin, projYMin] = [p_tl[0], p_br[1]];
        const [projXMax, projYMax] = [p_br[0], p_tl[1]];

        // --- Render Grid Overlay ---
        if (debouncedShowGrid) {
            gratCtx.strokeStyle = gridColor;
            gratCtx.lineWidth = 0.8 / (scale * dpr);

            const startX = Math.ceil(projXMin / debouncedGridSpacing) * debouncedGridSpacing;
            const startY = Math.ceil(projYMin / debouncedGridSpacing) * debouncedGridSpacing;

            gratCtx.beginPath();
            for (let x = startX; x <= projXMax; x += debouncedGridSpacing) {
                gratCtx.moveTo(x, projYMin);
                gratCtx.lineTo(x, projYMax);
            }
            for (let y = startY; y <= projYMax; y += debouncedGridSpacing) {
                gratCtx.moveTo(projXMin, y);
                gratCtx.lineTo(projXMax, y);
            }
            gratCtx.stroke();
        }

        // --- Render Graticule from cached points ---
        if (showGraticule && proj && graticuleLinesCache) {
            gratCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            gratCtx.lineWidth = 1 / (scale * dpr);

            const drawLabel = (text: string, p: [number, number]) => { gratCtx.save(); gratCtx.translate(p[0], p[1]); const invScale = 1 / (scale * dpr); gratCtx.scale(invScale, -invScale); gratCtx.fillStyle = 'rgba(255, 255, 255, 0.95)'; gratCtx.font = `12px sans-serif`; gratCtx.strokeStyle = 'rgba(0, 0, 0, 0.8)'; gratCtx.lineWidth = 2; gratCtx.textAlign = 'left'; gratCtx.textBaseline = 'top'; gratCtx.strokeText(text, 5, 5); gratCtx.fillText(text, 5, 5); gratCtx.restore(); };

            // Use cached graticule lines (avoids expensive proj4 calculations during pan/zoom)
            const { lonLines, latLines, lonStep, latStep } = graticuleLinesCache;

            // Calculate anchor position for labels
            let anchorLon = 0, anchorLat = 0;
            try {
                const centerGeo = proj4('EPSG:4326', proj).inverse(viewState.center);
                anchorLon = Math.round(centerGeo[0] / lonStep) * lonStep;
                anchorLat = Math.round(centerGeo[1] / latStep) * latStep;
            } catch(e) {
                anchorLon = 0;
                anchorLat = 0;
            }

            // Draw longitude lines (meridians) from cached points
            for (const { lon, points } of lonLines) {
                gratCtx.beginPath();
                for (let i = 0; i < points.length; i++) {
                    const [x, y] = points[i];
                    if (i === 0) gratCtx.moveTo(x, y);
                    else gratCtx.lineTo(x, y);
                }
                gratCtx.stroke();

                // Draw label
                try {
                    const p = proj.forward([lon, anchorLat]);
                    if (isFinite(p[0]) && isFinite(p[1]) && p[0] >= projXMin && p[0] <= projXMax && p[1] >= projYMin && p[1] <= projYMax) {
                        drawLabel(`${lon.toFixed(1)}°`, p);
                    }
                } catch(e) {}
            }

            // Draw latitude lines (parallels) from cached points
            for (const { lat, points } of latLines) {
                gratCtx.beginPath();
                for (let i = 0; i < points.length; i++) {
                    const [x, y] = points[i];
                    if (i === 0) gratCtx.moveTo(x, y);
                    else gratCtx.lineTo(x, y);
                }
                gratCtx.stroke();

                // Draw label
                try {
                    const p = proj.forward([anchorLon, lat]);
                    if (isFinite(p[0]) && isFinite(p[1]) && p[0] >= projXMin && p[0] <= projXMax && p[1] >= projYMin && p[1] <= projYMax) {
                        drawLabel(`${lat.toFixed(1)}°`, p);
                    }
                } catch(e) {}
            }
        }
    }
    contexts.forEach(ctx => ctx.restore());
    if(performance.now() - renderStartTime > 16) requestAnimationFrame(() => setIsRendering(false)); else setIsRendering(false);
  }, [layers, timeIndex, showGraticule, proj, viewState, isDataLoaded, latRange, lonRange, canvasToProjCoords, debouncedTimeRange, debouncedShowGrid, debouncedGridSpacing, gridColor, graticuleLinesCache]);

  // Helper function to get the 4 corners of a rectangle artifact in projected coordinates
  const getRectangleCorners = useCallback((artifact: RectangleArtifact): [number, number][] | null => {
    if (!primaryDataLayer || !proj) return null;

    const { width, height } = primaryDataLayer.dimensions;
    const [lonMin, lonMax] = lonRange;
    const [latMin, latMax] = latRange;

    const c_tl = proj.forward([lonMin, latMax]);
    const c_tr = proj.forward([lonMax, latMax]);
    const c_bl = proj.forward([lonMin, latMin]);
    const a = (c_tr[0] - c_tl[0]) / width;
    const b = (c_tr[1] - c_tl[1]) / width;
    const c = (c_bl[0] - c_tl[0]) / height;
    const d = (c_bl[1] - c_tl[1]) / height;
    const e = c_tl[0];
    const f = c_tl[1];
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < 1e-9) return null;

    try {
      // Convert center back to cell coordinates
      const centerCellX = (d * (artifact.center[0] - e) - c * (artifact.center[1] - f)) / determinant;
      const centerCellY = (a * (artifact.center[1] - f) - b * (artifact.center[0] - e)) / determinant;

      // Calculate dimensions in cell units
      // The stored width/height are in projected units, convert to cell units
      const cellWidth = artifact.width / Math.sqrt(a * a + b * b);
      const cellHeight = artifact.height / Math.sqrt(c * c + d * d);

      // Calculate 4 corners in cell coordinates
      const halfCellWidth = cellWidth / 2;
      const halfCellHeight = cellHeight / 2;

      // Round to integer cell coordinates to align with actual cell corners
      const minCellX = Math.round(centerCellX - halfCellWidth);
      const maxCellX = Math.round(centerCellX + halfCellWidth);
      const minCellY = Math.round(centerCellY - halfCellHeight);
      const maxCellY = Math.round(centerCellY + halfCellHeight);

      const corners: [number, number][] = [
        [minCellX, minCellY], // bottom-left
        [maxCellX, minCellY], // bottom-right
        [maxCellX, maxCellY], // top-right
        [minCellX, maxCellY], // top-left
      ];

      // Convert corners to projected coordinates
      return corners.map(([cx, cy]) => [
        a * cx + c * cy + e,
        b * cx + d * cy + f
      ]);
    } catch (error) {
      return null;
    }
  }, [primaryDataLayer, proj, lonRange, latRange]);

  // Effect for drawing artifacts
  useEffect(() => {
    const canvas = artifactCanvasRef.current;
    if (!canvas || !viewState || !proj) {
        canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        return;
    };

    const dpr = window.devicePixelRatio || 1;
    if (!canvas.parentElement) return; // Guard against null parentElement
    const { clientWidth, clientHeight } = canvas.parentElement;
    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // Guard against null context
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const { center, scale } = viewState;
    ctx.save();
    ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
    const effectiveScale = scale * dpr;
    ctx.scale(effectiveScale, -effectiveScale);
    ctx.translate(-center[0], -center[1]);

    artifacts.forEach(artifact => {
        if (!artifact.visible) return;

        ctx.strokeStyle = artifact.color;
        ctx.fillStyle = artifact.color;

        if (artifact.type === 'circle') {
            const radiusInProjUnits = artifact.radius;
            ctx.lineWidth = artifact.thickness / effectiveScale;
            ctx.beginPath();
            ctx.arc(artifact.center[0], artifact.center[1], radiusInProjUnits, 0, 2 * Math.PI);
            ctx.stroke();
        } else if (artifact.type === 'rectangle') {
            const corners = getRectangleCorners(artifact);
            if (corners && corners.length === 4) {
                ctx.lineWidth = artifact.thickness / effectiveScale;
                ctx.beginPath();
                ctx.moveTo(corners[0][0], corners[0][1]);
                ctx.lineTo(corners[1][0], corners[1][1]);
                ctx.lineTo(corners[2][0], corners[2][1]);
                ctx.lineTo(corners[3][0], corners[3][1]);
                ctx.closePath();
                ctx.stroke();
            }
        } else if (artifact.type === 'path') {
            if (artifact.waypoints.length === 0) return;
            
            const projectedWaypoints = artifact.waypoints.map(wp => {
                try {
                    return { ...wp, projPos: proj.forward(wp.geoPosition) as [number, number] };
                } catch(e) {
                    return { ...wp, projPos: null };
                }
            }).filter(p => p.projPos !== null);
            
            // Draw segments
            if (projectedWaypoints.length > 1) {
                ctx.lineWidth = artifact.thickness / effectiveScale;
                ctx.beginPath();
                ctx.moveTo(projectedWaypoints[0].projPos![0], projectedWaypoints[0].projPos![1]);
                for (let i = 1; i < projectedWaypoints.length; i++) {
                    ctx.lineTo(projectedWaypoints[i].projPos![0], projectedWaypoints[i].projPos![1]);
                }
                ctx.stroke();
            }
            
            // Draw dots and labels
            projectedWaypoints.forEach((pwp) => {
                // Draw dot
                ctx.beginPath();
                const dotRadius = (artifactDisplayOptions.waypointDotSize / 2) / effectiveScale;
                ctx.arc(pwp.projPos![0], pwp.projPos![1], dotRadius, 0, 2 * Math.PI);
                ctx.fill();

                // Draw label
                ctx.save();
                ctx.translate(pwp.projPos![0], pwp.projPos![1]);
                ctx.scale(1 / effectiveScale, -1 / effectiveScale);
                ctx.fillStyle = '#ffffff'; // White label for contrast
                ctx.font = `bold ${artifactDisplayOptions.labelFontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                ctx.lineWidth = 2.5;
                ctx.strokeText(pwp.label, 0, - (artifactDisplayOptions.waypointDotSize / 2 + 2));
                ctx.fillText(pwp.label, 0, - (artifactDisplayOptions.waypointDotSize / 2 + 2));
                ctx.restore();
            });

            // Draw segment lengths
            if (artifactDisplayOptions.showSegmentLengths && projectedWaypoints.length > 1) {
                for (let i = 0; i < projectedWaypoints.length - 1; i++) {
                    const pwp1 = projectedWaypoints[i];
                    const pwp2 = projectedWaypoints[i+1];
                    
                    const dx = pwp2.projPos![0] - pwp1.projPos![0];
                    const dy = pwp2.projPos![1] - pwp1.projPos![1];
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    const midPointProj: [number, number] = [(pwp1.projPos![0] + pwp2.projPos![0]) / 2, (pwp1.projPos![1] + pwp2.projPos![1]) / 2];
                    const label = `${distance.toFixed(0)} m`;

                    ctx.save();
                    ctx.translate(midPointProj[0], midPointProj[1]);

                    let angle = Math.atan2(pwp2.projPos![1] - pwp1.projPos![1], pwp2.projPos![0] - pwp1.projPos![0]);
                    if (angle < -Math.PI / 2 || angle > Math.PI / 2) {
                        angle += Math.PI;
                    }

                    ctx.rotate(angle);
                    ctx.scale(1 / effectiveScale, -1 / effectiveScale);
                    
                    ctx.font = `${artifactDisplayOptions.labelFontSize}px sans-serif`;
                    const textMetrics = ctx.measureText(label);
                    const padding = 4;
                    const textHeight = artifactDisplayOptions.labelFontSize;
                    const rectHeight = textHeight + padding;
                    const rectWidth = textMetrics.width + padding * 2;
                    
                    const verticalOffset = -(textHeight / 2 + 5); 
                    
                    ctx.fillStyle = 'rgba(26, 32, 44, 0.7)';
                    ctx.fillRect(-rectWidth / 2, verticalOffset - rectHeight / 2, rectWidth, rectHeight);
                    
                    ctx.fillStyle = '#fafafa';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, 0, verticalOffset);
                    ctx.restore();
                }
            }
        }
        
        ctx.save();
        const centerPos = artifact.type === 'path' ? (artifact.waypoints.length > 0 ? proj.forward(artifact.waypoints[0].geoPosition) : null) : artifact.center;
        if (centerPos) {
            ctx.translate(centerPos[0], centerPos[1]);
            ctx.scale(1 / effectiveScale, -1 / effectiveScale);
            ctx.fillStyle = artifact.color;
            ctx.font = `bold ${artifactDisplayOptions.labelFontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 3;
            ctx.strokeText(artifact.name, 0, -10);
            ctx.fillText(artifact.name, 0, -10);
        }
        ctx.restore();
    });

    // Draw preview rectangle if in rectangle creation mode with first corner set
    if (rectangleFirstCorner && currentMouseProjCoords && artifactCreationMode === 'rectangle' && snapToCellCorner && calculateRectangleFromCellCorners && primaryDataLayer) {
        const snappedSecondCorner = snapToCellCorner(currentMouseProjCoords);
        if (snappedSecondCorner) {
            // Calculate rectangle parameters with correct orientation
            const rectParams = calculateRectangleFromCellCorners(rectangleFirstCorner, snappedSecondCorner);

            if (rectParams) {
                // Create a temporary artifact to get its corners
                const tempArtifact: RectangleArtifact = {
                    id: 'preview',
                    type: 'rectangle',
                    name: 'Preview',
                    visible: true,
                    color: '#ff00ff',
                    thickness: 2,
                    center: rectParams.center,
                    width: rectParams.width,
                    height: rectParams.height,
                    rotation: rectParams.rotation
                };

                const corners = getRectangleCorners(tempArtifact);

                if (corners && corners.length === 4) {
                    ctx.save();
                    ctx.strokeStyle = '#ff00ff';
                    ctx.setLineDash([5 / effectiveScale, 5 / effectiveScale]);
                    ctx.lineWidth = 2 / effectiveScale;

                    // Draw preview rectangle as quadrilateral
                    ctx.beginPath();
                    ctx.moveTo(corners[0][0], corners[0][1]);
                    ctx.lineTo(corners[1][0], corners[1][1]);
                    ctx.lineTo(corners[2][0], corners[2][1]);
                    ctx.lineTo(corners[3][0], corners[3][1]);
                    ctx.closePath();
                    ctx.stroke();
                    ctx.restore();

                    // Draw corner markers at snapped positions
                    ctx.save();
                    ctx.fillStyle = '#ff00ff';
                    const markerSize = 10 / effectiveScale;
                    [rectangleFirstCorner, snappedSecondCorner].forEach(corner => {
                        ctx.fillRect(corner[0] - markerSize/2, corner[1] - markerSize/2, markerSize, markerSize);
                    });
                    ctx.restore();
                }
            }
        }
    }

    // Draw path creation preview (dashed circle and preview line)
    if ((artifactCreationMode === 'path' || isAppendingWaypoints) && currentMouseProjCoords && proj && activeArtifactId) {
        const pathBeingDrawn = artifacts.find(a => a.id === activeArtifactId && a.type === 'path') as PathArtifact | undefined;

        if (pathBeingDrawn && pathBeingDrawn.waypoints.length > 0) {
            const lastWaypoint = pathBeingDrawn.waypoints[pathBeingDrawn.waypoints.length - 1];
            const lastWaypointProj = proj.forward(lastWaypoint.geoPosition);
            const maxLength = pathCreationOptions.defaultMaxSegmentLength;

            let previewEndProj = currentMouseProjCoords; // Default: preview to cursor
            let radiusProj: number | null = null;
            let distance = 0;
            let isOverLimit = false;

            // Calculate radius and bounded preview point if max length is set
            if (maxLength) {
                try {
                    const lastWaypointGeo = lastWaypoint.geoPosition;

                    // Use maxLength directly as radius in projected units (meters)
                    // This matches how circle artifacts work - the projected coordinate system is in meters
                    radiusProj = maxLength;

                    // Calculate distance in projected space from last waypoint to cursor
                    const dx = currentMouseProjCoords[0] - lastWaypointProj[0];
                    const dy = currentMouseProjCoords[1] - lastWaypointProj[1];
                    const distProj = Math.sqrt(dx * dx + dy * dy);

                    // Check if cursor is beyond circle boundary in projected space
                    isOverLimit = distProj > radiusProj;

                    // Calculate geodesic distance for display
                    const cursorGeo = proj4('EPSG:4326', proj).inverse(currentMouseProjCoords);
                    distance = calculateGeoDistance(lastWaypointGeo, [cursorGeo[0], cursorGeo[1]]);

                    // Always clamp preview to circle boundary if cursor is beyond it
                    if (distProj > radiusProj) {
                        // Clamp to circle boundary in direction of cursor
                        const ratio = radiusProj / distProj;
                        previewEndProj = [
                            lastWaypointProj[0] + dx * ratio,
                            lastWaypointProj[1] + dy * ratio
                        ];
                    }
                } catch (e) {
                    // Ignore calculation errors, keep preview at cursor
                }
            }

            // Draw dashed preview line from last waypoint to preview end point
            ctx.save();
            ctx.strokeStyle = pathBeingDrawn.color;
            ctx.setLineDash([10 / effectiveScale, 10 / effectiveScale]);
            ctx.lineWidth = pathBeingDrawn.thickness / effectiveScale;
            ctx.beginPath();
            ctx.moveTo(lastWaypointProj[0], lastWaypointProj[1]);
            ctx.lineTo(previewEndProj[0], previewEndProj[1]);
            ctx.stroke();
            ctx.restore();

            // Draw preview waypoint dot at the end of the preview line
            ctx.save();
            ctx.fillStyle = pathBeingDrawn.color;
            ctx.globalAlpha = 0.6;
            const dotRadius = (artifactDisplayOptions.waypointDotSize / 2) / effectiveScale;
            ctx.beginPath();
            ctx.arc(previewEndProj[0], previewEndProj[1], dotRadius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();

            // Draw dashed circle around last waypoint if max segment length is set
            if (maxLength && radiusProj) {
                ctx.save();
                ctx.strokeStyle = pathBeingDrawn.color;
                ctx.setLineDash([15 / effectiveScale, 10 / effectiveScale]);
                ctx.lineWidth = 1 / effectiveScale;
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.arc(lastWaypointProj[0], lastWaypointProj[1], radiusProj, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.restore();

                // Display distance from last waypoint to cursor (at cursor, not at preview end)
                try {
                    ctx.save();
                    ctx.translate(currentMouseProjCoords[0], currentMouseProjCoords[1]);
                    ctx.scale(1 / effectiveScale, -1 / effectiveScale);

                    const label = `${distance.toFixed(0)} m`;
                    ctx.fillStyle = isOverLimit ? '#ff5555' : '#ffffff';
                    ctx.font = 'bold 14px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'bottom';
                    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
                    ctx.lineWidth = 2.5;
                    ctx.strokeText(label, 10, -10);
                    ctx.fillText(label, 10, -10);
                    ctx.restore();
                } catch (e) {
                    // Ignore projection errors
                }
            }
        }
    }

    // Draw interactive handles for active image layer
    if (activeLayerId) {
      const activeImageLayer = layers.find(l => l.id === activeLayerId && l.type === 'image');
      if (activeImageLayer && activeImageLayer.type === 'image') {
        const layer = activeImageLayer;
        const displayWidth = layer.originalWidth * layer.scaleX;
        const displayHeight = layer.originalHeight * layer.scaleY;

        ctx.save();
        ctx.translate(layer.position[0], layer.position[1]);
        const rotationRad = (layer.rotation * Math.PI) / 180;
        ctx.rotate(rotationRad);

        // Draw bounding box
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2 / effectiveScale;
        ctx.strokeRect(-displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);

        // Draw corner handles for scaling
        const handleSize = 12 / effectiveScale;
        ctx.fillStyle = '#00ffff';
        const corners = [
          [-displayWidth / 2, -displayHeight / 2], // Top-left
          [displayWidth / 2, -displayHeight / 2],  // Top-right
          [displayWidth / 2, displayHeight / 2],   // Bottom-right
          [-displayWidth / 2, displayHeight / 2]   // Bottom-left
        ];
        corners.forEach(corner => {
          ctx.fillRect(corner[0] - handleSize / 2, corner[1] - handleSize / 2, handleSize, handleSize);
        });

        // Draw edge handles for rotation
        ctx.fillStyle = '#ffff00';
        const edges = [
          [0, -displayHeight / 2],  // Top
          [displayWidth / 2, 0],    // Right
          [0, displayHeight / 2],   // Bottom
          [-displayWidth / 2, 0]    // Left
        ];
        edges.forEach(edge => {
          ctx.beginPath();
          ctx.arc(edge[0], edge[1], handleSize / 2, 0, 2 * Math.PI);
          ctx.fill();
        });

        // Draw center handle for moving
        ctx.fillStyle = '#ff00ff';
        ctx.beginPath();
        ctx.arc(0, 0, handleSize / 2, 0, 2 * Math.PI);
        ctx.fill();

        ctx.restore();
      }
    }

    ctx.restore();
  }, [artifacts, viewState, proj, artifactDisplayOptions, rectangleFirstCorner, currentMouseProjCoords, artifactCreationMode, snapToCellCorner, calculateRectangleFromCellCorners, getRectangleCorners, primaryDataLayer, layers, activeLayerId, isAppendingWaypoints, activeArtifactId, pathCreationOptions]);


  useEffect(() => {
    const canvas = selectionCanvasRef.current;
    if (!canvas || !viewState || !primaryDataLayer || !proj) return;

    const dpr = window.devicePixelRatio || 1;
    if (!canvas.parentElement) return; // Guard against null parentElement
    const { clientWidth, clientHeight } = canvas.parentElement;
    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return; // Guard against null context
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (selectedCells.length === 0 && !selectedCellForPlot) return;

    ctx.save();
    const { center, scale } = viewState;
    ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
    const effectiveScale = scale * dpr;
    ctx.scale(effectiveScale, -effectiveScale);
    ctx.translate(-center[0], -center[1]);

    const [lonMin, lonMax] = lonRange;
    const [latMin, latMax] = latRange;
    const c_tl = proj.forward([lonMin, latMax]); const c_tr = proj.forward([lonMax, latMax]); const c_bl = proj.forward([lonMin, latMin]);
    const { width, height } = primaryDataLayer.dimensions;
    const a = (c_tr[0] - c_tl[0]) / width; const b = (c_tr[1] - c_tl[1]) / width;
    const c = (c_bl[0] - c_tl[0]) / height; const d = (c_bl[1] - c_tl[1]) / height;
    const e = c_tl[0]; const f = c_tl[1];

    // Draw selectedCellForPlot (layer management mode) with cyan color and thicker border
    if (selectedCellForPlot) {
      ctx.strokeStyle = '#00ffff'; // Cyan color
      ctx.lineWidth = 3 / (scale * dpr); // Thicker border
      ctx.beginPath();

      const u = selectedCellForPlot.x;
      const v = selectedCellForPlot.y;

      const p0 = [a * u + c * v + e, b * u + d * v + f];
      const p1 = [a * (u + 1) + c * v + e, b * (u + 1) + d * v + f];
      const p2 = [a * (u + 1) + c * (v + 1) + e, b * (u + 1) + d * (v + 1) + f];
      const p3 = [a * u + c * (v + 1) + e, b * u + d * (v + 1) + f];

      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.closePath();

      ctx.stroke();
    }

    // Draw selectedCells (measurement tool) with configured color
    if (selectedCells.length > 0) {
      ctx.strokeStyle = selectionColor;
      ctx.lineWidth = 2 / (scale * dpr);
      ctx.beginPath();

      for (const cell of selectedCells) {
        const u = cell.x;
        const v = cell.y;

        const p0 = [a * u + c * v + e, b * u + d * v + f];
        const p1 = [a * (u + 1) + c * v + e, b * (u + 1) + d * v + f];
        const p2 = [a * (u + 1) + c * (v + 1) + e, b * (u + 1) + d * (v + 1) + f];
        const p3 = [a * u + c * (v + 1) + e, b * u + d * (v + 1) + f];

        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.lineTo(p3[0], p3[1]);
        ctx.closePath();
      }

      ctx.stroke();
    }

    ctx.restore();

  }, [selectedCells, selectionColor, selectedCellForPlot, viewState, primaryDataLayer, proj, lonRange, latRange]);

  const onCellHover = useCallback((coords: GeoCoordinates) => {
    setHoveredCoords(coords);
    if (!coords || !coordinateTransformer) { setSelectedPixel(null); return; }
    const pixel = coordinateTransformer(coords.lat, coords.lon);
    if (pixel) {
        const topDataLayer = [...layers].reverse().find(l => l.visible && (l.type === 'data' || l.type === 'analysis' || l.type === 'dte_comms' || l.type === 'lpf_comms'));
        if (topDataLayer) setSelectedPixel({ ...pixel, layerId: topDataLayer.id }); else setSelectedPixel(null);
    } else {
        setSelectedPixel(null);
    }
  }, [coordinateTransformer, layers, setHoveredCoords, setSelectedPixel]);

  const onMapClick = useCallback((coords: GeoCoordinates, projCoords: [number, number]) => {
    if (!coords) return;

    if (artifactCreationMode === 'path') {
        const pathBeingDrawn = artifacts.find(a => a.id === activeArtifactId && a.type === 'path') as PathArtifact | undefined;
        if (pathBeingDrawn) {
            // Add waypoint to existing path-in-progress
            let waypointGeoPosition: [number, number] = [coords.lon, coords.lat];

            // Clamp to max distance if configured
            const maxLength = pathCreationOptions.defaultMaxSegmentLength;
            if (maxLength && pathBeingDrawn.waypoints.length > 0) {
                const lastWaypoint = pathBeingDrawn.waypoints[pathBeingDrawn.waypoints.length - 1];
                const lastWaypointProj = proj.forward(lastWaypoint.geoPosition);

                // Calculate distance in projected space
                const dx = projCoords[0] - lastWaypointProj[0];
                const dy = projCoords[1] - lastWaypointProj[1];
                const distProj = Math.sqrt(dx * dx + dy * dy);

                // If beyond max distance, clamp to circle boundary
                if (distProj > maxLength) {
                    const ratio = maxLength / distProj;
                    const clampedProjCoords: [number, number] = [
                        lastWaypointProj[0] + dx * ratio,
                        lastWaypointProj[1] + dy * ratio
                    ];
                    // Convert back to geographic coordinates
                    const clampedGeo = proj4('EPSG:4326', proj).inverse(clampedProjCoords);
                    waypointGeoPosition = [clampedGeo[0], clampedGeo[1]];
                }
            }

            const newWaypoint: Waypoint = { id: `wp-${Date.now()}`, geoPosition: waypointGeoPosition, label: `WP${pathBeingDrawn.waypoints.length + 1}` };
            onUpdateArtifact(activeArtifactId, { waypoints: [...pathBeingDrawn.waypoints, newWaypoint] });
        } else {
            // First click: create the path
            const newId = `path-${Date.now()}`;
            const newWaypoint: Waypoint = { id: `wp-${Date.now()}`, geoPosition: [coords.lon, coords.lat], label: 'WP1' };
            const newArtifact: PathArtifact = { id: newId, type: 'path', name: `Path ${artifacts.length + 1}`, visible: true, color: '#ffff00', thickness: 2, waypoints: [newWaypoint] };
            setArtifacts(prev => [...prev, newArtifact]);
            setActiveArtifactId(newId);
        }
    } else if (artifactCreationMode) { // Circle or Rectangle
      const newId = `${artifactCreationMode}-${Date.now()}`;
      if (artifactCreationMode === 'circle') {
        const newArtifact: CircleArtifact = { id: newId, type: 'circle', name: `Circle ${artifacts.length + 1}`, visible: true, color: '#00ffff', thickness: 2, center: projCoords, radius: 500 };
        setArtifacts(prev => [...prev, newArtifact]);
        setActiveArtifactId(newId);
        onFinishArtifactCreation();
      } else if (artifactCreationMode === 'rectangle') {
        if (!rectangleFirstCorner) {
          // First click: Store the snapped first corner
          const snappedCorner = snapToCellCorner ? snapToCellCorner(projCoords) : projCoords;
          setRectangleFirstCorner(snappedCorner);
        } else {
          // Second click: Create rectangle from first corner to snapped second corner
          const snappedSecondCorner = snapToCellCorner ? snapToCellCorner(projCoords) : projCoords;

          // Calculate rectangle dimensions following cell grid orientation
          if (calculateRectangleFromCellCorners) {
            const rectParams = calculateRectangleFromCellCorners(rectangleFirstCorner, snappedSecondCorner);

            // Only create rectangle if it has non-zero dimensions
            if (rectParams && rectParams.width > 0 && rectParams.height > 0) {
              const newArtifact: RectangleArtifact = {
                id: newId, type: 'rectangle', name: `Rectangle ${artifacts.length + 1}`,
                visible: true, color: '#ff00ff', thickness: 2,
                center: rectParams.center,
                width: rectParams.width,
                height: rectParams.height,
                rotation: rectParams.rotation
              };
              setArtifacts(prev => [...prev, newArtifact]);
              setActiveArtifactId(newId);
            }
          }

          setRectangleFirstCorner(null);
          onFinishArtifactCreation();
        }
      }
    } else if (isAppendingWaypoints) {
      const activeArtifact = artifacts.find(a => a.id === activeArtifactId) as PathArtifact | undefined;
      if (activeArtifact && activeArtifact.type === 'path') {
          let waypointGeoPosition: [number, number] = [coords.lon, coords.lat];

          // Clamp to max distance if configured
          const maxLength = pathCreationOptions.defaultMaxSegmentLength;
          if (maxLength && activeArtifact.waypoints.length > 0) {
              const lastWaypoint = activeArtifact.waypoints[activeArtifact.waypoints.length - 1];
              const lastWaypointProj = proj.forward(lastWaypoint.geoPosition);

              // Calculate distance in projected space
              const dx = projCoords[0] - lastWaypointProj[0];
              const dy = projCoords[1] - lastWaypointProj[1];
              const distProj = Math.sqrt(dx * dx + dy * dy);

              // If beyond max distance, clamp to circle boundary
              if (distProj > maxLength) {
                  const ratio = maxLength / distProj;
                  const clampedProjCoords: [number, number] = [
                      lastWaypointProj[0] + dx * ratio,
                      lastWaypointProj[1] + dy * ratio
                  ];
                  // Convert back to geographic coordinates
                  const clampedGeo = proj4('EPSG:4326', proj).inverse(clampedProjCoords);
                  waypointGeoPosition = [clampedGeo[0], clampedGeo[1]];
              }
          }

          const newWaypoint: Waypoint = { id: `wp-${Date.now()}`, geoPosition: waypointGeoPosition, label: `WP${activeArtifact.waypoints.length + 1}` };
          onUpdateArtifact(activeArtifactId, { waypoints: [...activeArtifact.waypoints, newWaypoint] });
      }
    } else if (activeTool === 'measurement') {
      const pixel = coordinateTransformer ? coordinateTransformer(coords.lat, coords.lon) : null;
      if (pixel) {
        setSelectedCells(prev => {
          const index = prev.findIndex(p => p.x === pixel.x && p.y === pixel.y);
          if (index > -1) {
            return [...prev.slice(0, index), ...prev.slice(index + 1)]; // Deselect
          } else {
            return [...prev, pixel]; // Select
          }
        });
      }
    } else if (activeTool === 'layers') {
      // Cell selection for layer management mode
      const pixel = coordinateTransformer ? coordinateTransformer(coords.lat, coords.lon) : null;
      if (pixel) {
        setSelectedCellForPlot(prev => {
          // Toggle selection: if clicking the same cell, deselect it
          if (prev && prev.x === pixel.x && prev.y === pixel.y) {
            return null; // Deselect
          } else {
            return pixel; // Select
          }
        });
      }
    } else {
      // Logic for selecting an artifact by clicking on it
      if (hoveredArtifactId) {
          setActiveArtifactId(hoveredArtifactId);
      } else if (!hoveredWaypointInfo) { // Don't deselect if clicking a waypoint
          setActiveArtifactId(null);
      }
    }
  }, [
      artifactCreationMode, isAppendingWaypoints, activeTool, artifacts, activeArtifactId, onFinishArtifactCreation, setArtifacts,
      setActiveArtifactId, onUpdateArtifact, coordinateTransformer, setSelectedCells, hoveredArtifactId, hoveredWaypointInfo,
      rectangleFirstCorner, snapToCellCorner, calculateRectangleFromCellCorners, pathCreationOptions, proj, setSelectedCellForPlot
  ]);

  const onArtifactDragStart = useCallback((info: { artifactId: string; waypointId?: string }, projCoords: [number, number]) => {
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
  }, [artifacts, proj, isAppendingWaypoints, setDraggedInfo, setActiveArtifactId]);

  const onArtifactDrag = useCallback((projCoords: [number, number]) => {
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
                    const newCenter: [number, number] = [draggedInfo.initialCenter[0] + dx, draggedInfo.initialCenter[1] + dy];

                    // Apply snapping for rectangles to maintain cell grid alignment
                    if (a.type === 'rectangle' && snapToCellCorner && calculateRectangleFromCellCorners) {
                        // Calculate the corners based on current center, width, height, and rotation
                        const rotRad = a.rotation * Math.PI / 180;
                        const cosR = Math.cos(rotRad);
                        const sinR = Math.sin(rotRad);

                        // Top-left corner in local coordinates
                        const localTL = [-a.width / 2, -a.height / 2];
                        // Rotate and translate to get projected coordinates
                        const topLeftProj: [number, number] = [
                            newCenter[0] + localTL[0] * cosR - localTL[1] * sinR,
                            newCenter[1] + localTL[0] * sinR + localTL[1] * cosR
                        ];

                        // Snap top-left corner
                        const snappedTopLeft = snapToCellCorner(topLeftProj);

                        if (snappedTopLeft) {
                            // Calculate bottom-right corner from the dimensions
                            const localBR = [a.width / 2, a.height / 2];
                            const bottomRightProj: [number, number] = [
                                newCenter[0] + localBR[0] * cosR - localBR[1] * sinR,
                                newCenter[1] + localBR[0] * sinR + localBR[1] * cosR
                            ];

                            // Snap bottom-right corner
                            const snappedBottomRight = snapToCellCorner(bottomRightProj);

                            if (snappedBottomRight) {
                                // Recalculate rectangle with both corners snapped
                                const rectParams = calculateRectangleFromCellCorners(snappedTopLeft, snappedBottomRight);
                                if (rectParams) {
                                    return {
                                        ...a,
                                        center: rectParams.center,
                                        width: rectParams.width,
                                        height: rectParams.height,
                                        rotation: rectParams.rotation
                                    };
                                }
                            }
                        }
                    }

                    return { ...a, center: newCenter };
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
  }, [draggedInfo, proj, setArtifacts, snapToCellCorner, calculateRectangleFromCellCorners]);

  const onArtifactDragEnd = useCallback(() => {
    setDraggedInfo(null);
  }, [setDraggedInfo]);


  const handleInteractionMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const projCoords = canvasToProjCoords(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    setCurrentMouseProjCoords(projCoords);

    // Handle image layer transformation
    try {
      if (imageLayerDragInfo && projCoords) {
          const dragInfo = imageLayerDragInfo;
          const layer = layers.find(l => l.id === dragInfo.layerId && l.type === 'image');
          if (layer && layer.type === 'image') {
              if (dragInfo.handleType === 'center') {
                  // Move the image
                  const dx = projCoords[0] - dragInfo.initialMouseProj[0];
                  const dy = projCoords[1] - dragInfo.initialMouseProj[1];
                  onUpdateLayer(dragInfo.layerId, {
                      position: [dragInfo.initialPosition[0] + dx, dragInfo.initialPosition[1] + dy]
                  });
              } else if (dragInfo.handleType === 'corner' && dragInfo.handleIndex !== undefined) {
                // Scale the image
                const rotationRad = (dragInfo.initialRotation * Math.PI) / 180;
                const cosR = Math.cos(-rotationRad);
                const sinR = Math.sin(-rotationRad);

                // Transform current and initial mouse positions to local coordinates
                const dx0 = dragInfo.initialMouseProj[0] - dragInfo.initialPosition[0];
                const dy0 = dragInfo.initialMouseProj[1] - dragInfo.initialPosition[1];
                const initialLocal = [dx0 * cosR - dy0 * sinR, dx0 * sinR + dy0 * cosR];

                const dx1 = projCoords[0] - dragInfo.initialPosition[0];
                const dy1 = projCoords[1] - dragInfo.initialPosition[1];
                const currentLocal = [dx1 * cosR - dy1 * sinR, dx1 * sinR + dy1 * cosR];

                // Calculate scale change
                const cornerIndex = dragInfo.handleIndex;
                const initialDisplayWidth = layer.originalWidth * dragInfo.initialScaleX;
                const initialDisplayHeight = layer.originalHeight * dragInfo.initialScaleY;

                // Determine which dimension(s) to scale based on corner
                let newScaleX = dragInfo.initialScaleX;
                let newScaleY = dragInfo.initialScaleY;

                if (cornerIndex === 0 || cornerIndex === 3) { // Left corners
                    newScaleX = dragInfo.initialScaleX * (1 - 2 * (currentLocal[0] - initialLocal[0]) / initialDisplayWidth);
                } else { // Right corners
                    newScaleX = dragInfo.initialScaleX * (1 + 2 * (currentLocal[0] - initialLocal[0]) / initialDisplayWidth);
                }

                if (cornerIndex === 0 || cornerIndex === 1) { // Top corners
                    newScaleY = dragInfo.initialScaleY * (1 - 2 * (currentLocal[1] - initialLocal[1]) / initialDisplayHeight);
                } else { // Bottom corners
                    newScaleY = dragInfo.initialScaleY * (1 + 2 * (currentLocal[1] - initialLocal[1]) / initialDisplayHeight);
                }

                // Clamp scales to reasonable values
                newScaleX = Math.max(0.1, Math.min(10, newScaleX));
                newScaleY = Math.max(0.1, Math.min(10, newScaleY));

                onUpdateLayer(dragInfo.layerId, { scaleX: newScaleX, scaleY: newScaleY });
            } else if (dragInfo.handleType === 'edge' && dragInfo.handleIndex !== undefined) {
                // Rotate the image
                const dx = projCoords[0] - dragInfo.initialPosition[0];
                const dy = projCoords[1] - dragInfo.initialPosition[1];
                const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;

                const dx0 = dragInfo.initialMouseProj[0] - dragInfo.initialPosition[0];
                const dy0 = dragInfo.initialMouseProj[1] - dragInfo.initialPosition[1];
                const initialAngle = Math.atan2(dy0, dx0) * 180 / Math.PI;

                let newRotation = dragInfo.initialRotation + (currentAngle - initialAngle);
                // Normalize to [-180, 180]
                while (newRotation > 180) newRotation -= 360;
                while (newRotation < -180) newRotation += 360;

                onUpdateLayer(dragInfo.layerId, { rotation: newRotation });
            }
        }
        return;
      }
    } catch (error) {
      console.error('Error in image layer transformation:', error);
    }

    if (!!draggedInfo && projCoords) {
        onArtifactDrag(projCoords);
        return;
    }

    if (isPanning.current && viewState) {
        const dx = e.clientX - lastMousePos.current.x; const dy = e.clientY - lastMousePos.current.y;
        const dpr = window.devicePixelRatio || 1;
        const newCenter: [number, number] = [ viewState.center[0] - dx / (viewState.scale * dpr), viewState.center[1] + dy / (viewState.scale * dpr) ];
        setViewState({ ...viewState, center: newCenter });
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
    
    if (projCoords && proj && viewState) {
        let newHoveredWaypointInfo = null;
        let newHoveredArtifactId = null;

        if (artifactCreationMode === null && !isAppendingWaypoints) {
            const dpr = window.devicePixelRatio || 1;
            const effectiveScale = viewState.scale * dpr;
            const hitRadiusPx = artifactDisplayOptions.waypointDotSize * 0.75;
            const hitRadiusProj = hitRadiusPx / effectiveScale;

            for (let i = artifacts.length - 1; i >= 0; i--) {
                const artifact = artifacts[i];
                if (!artifact.visible) continue;
                
                let waypointHit = false;
                if (artifact.type === 'path') {
                    for (const waypoint of artifact.waypoints) {
                        try {
                            const wpProjPos = proj.forward(waypoint.geoPosition);
                            const dist = Math.sqrt(Math.pow(projCoords[0] - wpProjPos[0], 2) + Math.pow(projCoords[1] - wpProjPos[1], 2));
                            if (dist < hitRadiusProj) {
                                newHoveredWaypointInfo = { artifactId: artifact.id, waypointId: waypoint.id };
                                waypointHit = true;
                                break;
                            }
                        } catch (err) { /* ignore */ }
                    }
                }
                if (waypointHit) break;

                let artifactHit = false;
                if (artifact.type === 'circle') {
                    const dist = Math.sqrt(Math.pow(projCoords[0] - artifact.center[0], 2) + Math.pow(projCoords[1] - artifact.center[1], 2));
                    if (dist <= artifact.radius) artifactHit = true;
                } else if (artifact.type === 'rectangle') {
                    const w = artifact.width; const h = artifact.height;
                    const angle = -artifact.rotation * Math.PI / 180;
                    const dx = projCoords[0] - artifact.center[0]; const dy = projCoords[1] - artifact.center[1];
                    const rotatedX = dx * Math.cos(angle) - dy * Math.sin(angle);
                    const rotatedY = dx * Math.sin(angle) + dy * Math.cos(angle);
                    if (Math.abs(rotatedX) <= w / 2 && Math.abs(rotatedY) <= h / 2) artifactHit = true;
                } else if (artifact.type === 'path') {}
                if (artifactHit) {
                    newHoveredArtifactId = artifact.id;
                    break;
                }
            }
        }
        
        setHoveredWaypointInfo(newHoveredWaypointInfo);
        setHoveredArtifactId(newHoveredWaypointInfo ? null : newHoveredArtifactId);
        
        try { const [lon, lat] = proj4('EPSG:4326', proj).inverse(projCoords); onCellHover({ lat, lon }); } catch(e) { clearHoverState(); }
    } else { clearHoverState(); setHoveredArtifactId(null); setHoveredWaypointInfo(null); }
  }, [viewState, setViewState, canvasToProjCoords, proj, onCellHover, clearHoverState, draggedInfo, onArtifactDrag, artifacts, artifactCreationMode, artifactDisplayOptions, isAppendingWaypoints, imageLayerDragInfo, layers, onUpdateLayer]);
  
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    const projCoords = canvasToProjCoords(e.nativeEvent.offsetX, e.nativeEvent.offsetY);

    if (!projCoords) return;

    if (e.button === 0) { // Left mouse button
        // Check for image layer handle click
        try {
          const handleInfo = getImageLayerHandle(projCoords);
          if (handleInfo) {
              const layer = layers.find(l => l.id === handleInfo.layerId && l.type === 'image');
              if (layer && layer.type === 'image') {
                  setImageLayerDragInfo({
                      layerId: handleInfo.layerId,
                      handleType: handleInfo.handleType,
                      handleIndex: handleInfo.handleIndex,
                      initialMouseProj: projCoords,
                      initialPosition: layer.position,
                      initialScaleX: layer.scaleX,
                      initialScaleY: layer.scaleY,
                      initialRotation: layer.rotation
                  });
                  return;
              }
          }
        } catch (error) {
          console.error('Error checking image layer handle:', error);
        }

        // Only allow artifact dragging when in artifact mode
        if (activeTool === 'artifacts') {
            if (hoveredWaypointInfo) {
                onArtifactDragStart({ artifactId: hoveredWaypointInfo.artifactId, waypointId: hoveredWaypointInfo.waypointId }, projCoords);
            } else if (hoveredArtifactId) {
                onArtifactDragStart({ artifactId: hoveredArtifactId }, projCoords);
            } else {
                isPanning.current = true;
            }
        } else {
            isPanning.current = true;
        }
    }
  };
  
  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    const wasClick = isPanning.current && (Math.abs(e.clientX - lastMousePos.current.x) < 2) && (Math.abs(e.clientY - lastMousePos.current.y) < 2);

    const wasPanning = isPanning.current;
    isPanning.current = false;

    // Clear image layer drag info
    if (imageLayerDragInfo) {
      setImageLayerDragInfo(null);
      return;
    }

    if (!!draggedInfo) {
      onArtifactDragEnd();
      return;
    }

    if (wasPanning && wasClick) {
        const projCoords = canvasToProjCoords(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        const geoCoords = proj && projCoords ? (() => { try { const [lon, lat] = proj4('EPSG:4326', proj).inverse(projCoords); return { lat, lon }; } catch(e) { return null; } })() : null;

        if (projCoords && geoCoords) {
            onMapClick(geoCoords, projCoords);
        }
    }
  };
  const handleMouseLeave = () => {
    isPanning.current = false;
    clearHoverState();
    if (imageLayerDragInfo) setImageLayerDragInfo(null);
    if (!!draggedInfo) onArtifactDragEnd();
  };

  const handleZoomAction = useCallback((factor: number) => { if (!viewState) return; setViewState({ ...viewState, scale: viewState.scale * factor }); }, [viewState, setViewState]);
  const handleResetView = useCallback(() => { if(initialViewState) { setViewState(initialViewState); } }, [initialViewState, setViewState]);

  const cursorStyle = useMemo(() => {
    if (artifactCreationMode || isAppendingWaypoints) return 'crosshair';
    if (imageLayerDragInfo) {
      if (imageLayerDragInfo.handleType === 'center') return 'move';
      if (imageLayerDragInfo.handleType === 'corner') return 'nwse-resize';
      if (imageLayerDragInfo.handleType === 'edge') return 'grab';
    }
    if (!!draggedInfo) return 'grabbing';
    if (hoveredWaypointInfo || hoveredArtifactId) return 'grab';
    if (activeTool === 'measurement') return 'copy';
    if (isPanning.current) return 'grabbing';
    return 'default';
  }, [artifactCreationMode, isAppendingWaypoints, draggedInfo, hoveredWaypointInfo, hoveredArtifactId, activeTool, isPanning.current, imageLayerDragInfo]);

  if (!isDataLoaded) {
    return (<div className="w-full h-full flex items-center justify-center text-center text-gray-400 bg-gray-900/50 rounded-lg"><div><h3 className="text-xl font-semibold">No Data Loaded</h3><p className="mt-2">Use the Layers panel to load a basemap or data file.</p></div></div>);
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      onMouseDown={handleMouseDown}
      onMouseMove={handleInteractionMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: cursorStyle }}
    >
      {isRendering && <div className="absolute inset-0 flex items-center justify-center bg-gray-800/50 z-50"><LoadingSpinner /></div>}
      <canvas ref={baseCanvasRef} className="pixelated absolute inset-0 w-full h-full z-0" />
      <canvas ref={dataCanvasRef} className="pixelated absolute inset-0 w-full h-full z-10" />
      <canvas ref={artifactCanvasRef} className="absolute inset-0 w-full h-full z-20 pointer-events-none" />
      <canvas ref={graticuleCanvasRef} className="absolute inset-0 w-full h-full z-30 pointer-events-none" />
      <canvas ref={selectionCanvasRef} className="absolute inset-0 w-full h-full z-40 pointer-events-none" />
      <ZoomControls onZoomIn={() => handleZoomAction(1.5)} onZoomOut={() => handleZoomAction(1 / 1.5)} onResetView={handleResetView} />
    </div>
  );
};