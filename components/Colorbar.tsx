
import React, { useRef, useEffect } from 'react';
import type { ColorMapName } from '../types';
import { getColorScale } from '../services/colormap';

interface ColorbarProps {
  colorMap: ColorMapName;
  dataRange: { min: number; max: number } | null;
  units?: string;
}

const BAR_WIDTH = 20;
const BAR_HEIGHT = 200;

export const Colorbar: React.FC<ColorbarProps> = ({ colorMap, dataRange, units }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!dataRange || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const colorScale = getColorScale(colorMap, [0, 1]); 

    ctx.clearRect(0, 0, BAR_WIDTH, BAR_HEIGHT);

    for (let i = 0; i < BAR_HEIGHT; i++) {
      ctx.fillStyle = colorScale(1 - i / BAR_HEIGHT);
      ctx.fillRect(0, i, BAR_WIDTH, 1);
    }
  }, [colorMap, dataRange]);

  if (!dataRange) return null;

  const formatLabel = (value: number) => {
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
