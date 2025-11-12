import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { TimeRange, TimeDomain } from '../types';
import { indexToDate } from '../utils/time';
import { useGlobalContext } from './GlobalContext';

interface TimeContextType {
    timeRange: TimeRange | null;
    setTimeRange: React.Dispatch<React.SetStateAction<TimeRange | null>>;
    timeZoomDomain: TimeDomain | null;
    setTimeZoomDomain: React.Dispatch<React.SetStateAction<TimeDomain | null>>;
    isPlaying: boolean;
    isPaused: boolean;
    playbackSpeed: number;
    setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
    setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
    onPlaybackSpeedChange: (speed: number) => void;
    
    // Derived state
    fullTimeDomain: TimeDomain | null;

    // Handlers
    handleManualTimeRangeChange: (newRange: TimeRange) => void;
    onTogglePlay: () => void;
    onZoomToSelection: (targetDomain: TimeDomain | null) => void;
    onResetZoom: () => void;
    initializeTime: (maxTimeIndex: number) => void;
}

const TimeContext = createContext<TimeContextType | null>(null);

export const useTimeContext = () => {
    const context = useContext(TimeContext);
    if (!context) {
        throw new Error("useTimeContext must be used within a TimeProvider");
    }
    return context;
};

export const TimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { sessionDataToRestore, setSessionDataToRestore } = useGlobalContext();

    const [timeRange, setTimeRange] = useState<TimeRange | null>(null);
    const [timeZoomDomain, setTimeZoomDomain] = useState<TimeDomain | null>(null);
    const [fullTimeDomain, setFullTimeDomain] = useState<TimeDomain | null>(null);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [isPaused, setIsPaused] = useState<boolean>(false);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(10);
    
    const animationFrameId = useRef<number | null>(null);
    const lastFrameTime = useRef<number>(0);
    const playbackRange = useRef<{start: number, end: number} | null>(null);

    const initializeTime = useCallback((maxTimeIndex: number) => {
        const initialTimeRange = { start: 0, end: maxTimeIndex };
        setTimeRange(initialTimeRange);
        const newFullDomain = [indexToDate(0), indexToDate(maxTimeIndex)];
        setFullTimeDomain(newFullDomain);
        setTimeZoomDomain(newFullDomain);
    }, []);

    useEffect(() => {
        if (!isPlaying) {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
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
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
            lastFrameTime.current = 0;
        };
    }, [isPlaying, playbackSpeed]);

    const onTogglePlay = useCallback(() => {
        if (!isPlaying) { // about to play
            if (!isPaused) {
                if (!timeRange || timeRange.start >= timeRange.end) return;
                playbackRange.current = { ...timeRange };
                setTimeRange({ start: timeRange.start, end: timeRange.start });
            }
            setIsPaused(false);
            setIsPlaying(true);
        } else { // about to stop
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

    const onZoomToSelection = useCallback((targetDomain: TimeDomain | null) => {
        if (targetDomain) {
            setTimeZoomDomain(targetDomain);
        }
    }, []);

    const onResetZoom = useCallback(() => {
        if (fullTimeDomain) setTimeZoomDomain(fullTimeDomain);
    }, [fullTimeDomain]);

    // Restore state from session
    useEffect(() => {
        if (sessionDataToRestore && (sessionDataToRestore as any).layersRestored) {
            // Find the primary data layer from the config to initialize the full time domain
            const primaryLayerConfig = sessionDataToRestore.layers.find(l => l.type === 'data');
            if (primaryLayerConfig) {
                 const maxTime = primaryLayerConfig.dimensions.time - 1;
                 const newFullDomain = [indexToDate(0), indexToDate(maxTime)];
                 setFullTimeDomain(newFullDomain);

                 // Set the specific zoom and time ranges from the config
                 setTimeRange(sessionDataToRestore.timeRange);
                 if (sessionDataToRestore.timeZoomDomain) {
                     setTimeZoomDomain([
                         new Date(sessionDataToRestore.timeZoomDomain[0]),
                         new Date(sessionDataToRestore.timeZoomDomain[1])
                     ]);
                 } else {
                    setTimeZoomDomain(newFullDomain);
                 }
            }
            
            // This is the last context to restore, so we can clear the restore data
            setSessionDataToRestore(null);
        }
    }, [sessionDataToRestore, setSessionDataToRestore]);

    const value: TimeContextType = {
        timeRange, setTimeRange,
        timeZoomDomain, setTimeZoomDomain,
        isPlaying, setIsPlaying,
        isPaused, setIsPaused,
        playbackSpeed, onPlaybackSpeedChange: setPlaybackSpeed,
        fullTimeDomain,
        handleManualTimeRangeChange,
        onTogglePlay,
        onZoomToSelection,
        onResetZoom,
        initializeTime
    };

    return <TimeContext.Provider value={value}>{children}</TimeContext.Provider>;
};
