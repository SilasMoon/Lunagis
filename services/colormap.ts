
import type { ColorMapName } from '../types';

// This file assumes `d3` is available on the window object from the CDN script in index.html
declare const d3: any;

export function getColorScale(name: ColorMapName, domain: [number, number]): (value: number) => string {
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
  
  return d3.scaleSequential(domain, interpolator);
}
