// Fix: Removed invalid file header which was causing parsing errors.
import React, { useRef, useEffect } from 'react';
import type { ColorMapName, ColorStop } from '../types';
import { getColorScale } from '../services/colormap';

interface ColorbarProps {
  colorMap: ColorMapName;
  dataRange: { min: number; max: number } | null;
  units?: string;
  inverted?: boolean;
  customColormap?: ColorStop[];
  isThreshold?: boolean;
}

const BAR_WIDTH = 20;
const BAR_HEIGHT = 200;

export const Colorbar: React.FC<ColorbarProps> = ({ colorMap, dataRange, units, inverted, customColormap, isThreshold }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!dataRange || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // For pre-canned colormaps, the domain is normalized to [0,1] for the interpolator.
    // For custom colormaps, the scale is built directly with the values.
    const domainForScale: [number, number] = colorMap === 'Custom' ? [dataRange.min, dataRange.max] : [0, 1];
    const colorScale = getColorScale(colorMap, domainForScale, inverted, customColormap, isThreshold); 

    ctx.clearRect(0, 0, BAR_WIDTH, BAR_HEIGHT);
    
    // For custom or standard scales, we can just sample the final scale, which will correctly
    // render either a smooth gradient or discrete threshold blocks.
    for (let i = 0; i < BAR_HEIGHT; i++) {
        const valueRatio = 1 - (i / BAR_HEIGHT);
        let value: number;
        if (colorMap === 'Custom') {
            value = dataRange.min + valueRatio * (dataRange.max - dataRange.min);
        } else {
            value = valueRatio;
        }
        ctx.fillStyle = colorScale(value);
        ctx.fillRect(0, i, BAR_WIDTH, 1);
    }
  }, [colorMap, dataRange, inverted, customColormap, isThreshold]);

  if (!dataRange) return null;

  const formatLabel = (value: number) => {
    if (units === 'days') {
      return (value / 24).toFixed(1);
    }
    return value < 100 ? value.toFixed(1) : Math.round(value);
  }

  return (
    <div className="flex flex-col items-center">
        <div className="flex items-stretch gap-2">
          <div className="flex flex-col justify-between h-full text-xs font-mono text-gray-300 py-0.5" style={{ height: BAR_HEIGHT }}>
            <span>{formatLabel(dataRange.max)}</span>
            <span>{formatLabel(dataRange.min)}</span>
          </div>
          <canvas
            ref={canvasRef}
            width={BAR_WIDTH}
            height={BAR_HEIGHT}
            className="rounded-sm border border-gray-600"
          />
        </div>
        {units && <span className="text-xs text-gray-400 mt-1">{units}</span>}
    </div>
  );
};