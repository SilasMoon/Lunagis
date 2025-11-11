import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { indexToDate, dateToIndex, START_DATE } from '../utils/time';
import type { TimeRange, TimeDomain } from '../types';
import { MARGIN } from './TimeSeriesPlot';

declare const d3: any;

interface TimeSliderProps {
  isDataLoaded: boolean;
  timeRange: TimeRange | null;
  maxTimeIndex: number;
  onTimeRangeChange: (range: TimeRange) => void;
  timeZoomDomain: TimeDomain | null;
}

export const TimeSlider: React.FC<TimeSliderProps> = ({ 
  isDataLoaded, timeRange, maxTimeIndex, onTimeRangeChange, timeZoomDomain
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        setWidth(entries[0].contentRect.width);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const xScale = useMemo(() => {
    if (width === 0 || !timeZoomDomain) return d3.scaleUtc();
    return d3.scaleUtc().domain(timeZoomDomain).range([MARGIN.left, width - MARGIN.right]);
  }, [timeZoomDomain, width]);

  const ticks = useMemo(() => {
    if (!isDataLoaded || width < 100 || !timeZoomDomain) return [];
    
    const [start, end] = timeZoomDomain;
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    
    let tickValues;
    let tickFormat;

    if (durationHours <= 48) { // Show hours
        tickValues = xScale.ticks(d3.utcHour.every(3));
        tickFormat = d3.utcFormat("%H:%M");
    } else if (durationHours <= 24 * 30) { // Show days
        tickValues = xScale.ticks(d3.utcDay.every(1));
        tickFormat = d3.utcFormat("%d");
    } else { // Show months
        tickValues = xScale.ticks(d3.utcMonth.every(1));
        tickFormat = d3.utcFormat("%b");
    }

    return tickValues.map(date => ({
        date,
        label: tickFormat(date),
        isMajor: date.getUTCHours() === 0 && date.getUTCMinutes() === 0, // Could be improved
    }));
  }, [width, timeZoomDomain, isDataLoaded, xScale]);

  const handleInteraction = useCallback((e: React.MouseEvent | MouseEvent, isDragStart: boolean = false) => {
    if (!isDataLoaded || !timeRange) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    const newDate = xScale.invert(x);
    const newIndex = Math.max(0, Math.min(maxTimeIndex, dateToIndex(newDate)));

    if (isDragStart) {
      const startPos = xScale(indexToDate(timeRange.start));
      const endPos = xScale(indexToDate(timeRange.end));
      const distToStart = Math.abs(x - startPos);
      const distToEnd = Math.abs(x - endPos);
      
      const grabThreshold = 20;
      if (distToStart < distToEnd && distToStart < grabThreshold) {
        setDraggingHandle('start');
      } else if (distToEnd < grabThreshold) {
        setDraggingHandle('end');
      } else {
        if (distToStart < distToEnd) setDraggingHandle('start'); else setDraggingHandle('end');
      }
    } else if (draggingHandle) {
      if (draggingHandle === 'start') {
        onTimeRangeChange({ ...timeRange, start: Math.min(newIndex, timeRange.end) });
      } else {
        onTimeRangeChange({ ...timeRange, end: Math.max(newIndex, timeRange.start) });
      }
    }
  }, [xScale, onTimeRangeChange, maxTimeIndex, isDataLoaded, timeRange, draggingHandle]);

  useEffect(() => {
    const handleMouseUp = () => setDraggingHandle(null);
    const handleMouseMove = (e: MouseEvent) => {
        if (draggingHandle) {
            handleInteraction(e, false);
        }
    };

    if (draggingHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingHandle, handleInteraction]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isDataLoaded || !timeRange) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newStart = Math.max(0, timeRange.start - 1);
        if (newStart !== timeRange.start) {
          onTimeRangeChange({ ...timeRange, start: newStart });
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const newStart = Math.min(timeRange.end, timeRange.start + 1);
        if (newStart !== timeRange.start) {
          onTimeRangeChange({ ...timeRange, start: newStart });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, [isDataLoaded, timeRange, onTimeRangeChange]);
  
  const startX = timeRange ? xScale(indexToDate(timeRange.start)) : 0;
  const endX = timeRange ? xScale(indexToDate(timeRange.end)) : 0;

  return (
    <section className="bg-gray-800/70 backdrop-blur-sm border-t border-gray-700 w-full flex-shrink-0 z-40 h-[50px]">
        <div ref={containerRef} className="w-full h-full relative">
            <svg
              ref={svgRef}
              width={width}
              height={50}
              className={`absolute inset-0 ${isDataLoaded ? 'cursor-ew-resize' : 'opacity-50'}`}
              onMouseDown={(e) => handleInteraction(e, true)}>
                <line x1={MARGIN.left} y1={25} x2={width - MARGIN.right} y2={25} stroke="#4A5568" strokeWidth="2" />
                
                {isDataLoaded && ticks.map(({ date, label, isMajor }) => {
                const x = xScale(date);
                return (
                    <g key={date.toISOString()}>
                    <line x1={x} y1={isMajor ? 15 : 20} x2={x} y2={35} stroke={"#A0AEC0"} strokeWidth="1" />
                    {label && ( <text x={x} y={12} fill="#90CDF4" fontSize="10" textAnchor="middle">{label}</text> )}
                    </g>
                )
                })}
                
                {isDataLoaded && timeRange && width > 0 && (
                    <g>
                        <rect x={startX} y="21" width={endX - startX} height="8" fill="rgba(79, 209, 197, 0.5)" />
                        <line x1={startX} y1={10} x2={startX} y2={40} stroke="#4FD1C5" strokeWidth="2" />
                        <circle cx={startX} cy={25} r="6" fill="#4FD1C5" stroke="#1A202C" strokeWidth="2" />
                        <line x1={endX} y1={10} x2={endX} y2={40} stroke="#4FD1C5" strokeWidth="2" />
                        <circle cx={endX} cy={25} r="6" fill="#4FD1C5" stroke="#1A202C" strokeWidth="2" />
                    </g>
                )}
            </svg>
        </div>
    </section>
  );
};