// Fix: Removed invalid file header which was causing parsing errors.
import type { ColorMapName, ColorStop } from '../types';

// This file assumes `d3` is available on the window object from the CDN script in index.html
declare const d3: any;

export function getColorScale(
  name: ColorMapName,
  domain: [number, number],
  inverted?: boolean,
  customStops?: ColorStop[],
  isThreshold?: boolean
): (value: number) => string {
  if (name === 'Custom' && customStops && customStops.length > 0) {
    const sortedStops = [...customStops].sort((a, b) => a.value - b.value);

    // Threshold scale for discrete color ranges
    if (isThreshold) {
      if (sortedStops.length === 1) {
        return () => sortedStops[0].color;
      }
      // For a threshold scale, the domain is the upper bound of each range (excluding the first)
      // and the range is the color for that range.
      const scaleDomain = sortedStops.map(s => s.value).slice(1);
      const scaleRange = sortedStops.map(s => s.color);
      
      const scale = d3.scaleThreshold().domain(scaleDomain).range(scaleRange);
      return scale;
    }

    // Original linear gradient scale
    const stops = inverted ? [...customStops].reverse() : customStops;
    if (stops.length === 1) {
      return () => stops[0].color;
    }

    const scale = d3.scaleLinear()
      .domain(stops.map(s => s.value))
      .range(stops.map(s => s.color))
      .clamp(true);
      
    return scale;
  }

  const interpolator = (() => {
    switch (name) {
      case 'Viridis': return d3.interpolateViridis;
      case 'Plasma': return d3.interpolatePlasma;
      case 'Inferno': return d3.interpolateInferno;
      case 'Magma': return d3.interpolateMagma;
      case 'Cividis': return d3.interpolateCividis;
      case 'Turbo': return d3.interpolateTurbo;
      case 'Grayscale': return d3.interpolateGreys;
      default: return d3.interpolateViridis;
    }
  })();
  
  const finalInterpolator = inverted ? (t: number) => interpolator(1 - t) : interpolator;
  
  return d3.scaleSequential(domain, finalInterpolator);
}