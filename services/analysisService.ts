import type { DataSet, DataSlice, Layer, DataLayer, AnalysisLayer, DteCommsLayer, LpfCommsLayer, TimeRange } from '../types';
import { evaluate as evaluateExpression, getVariables as getExpressionVariables } from './expressionEvaluator';

export const sanitizeLayerNameForExpression = (name: string): string => {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
};

export const calculateExpressionLayer = async (expression: string, availableLayers: Layer[]): Promise<{ dataset: DataSet; range: { min: number; max: number }; dimensions: { time: number; height: number; width: number; } }> => {
    const variables = getExpressionVariables(expression);
    const sourceLayers: (DataLayer | AnalysisLayer | DteCommsLayer | LpfCommsLayer)[] = [];

    for (const v of variables) {
        const layer = availableLayers.find(l => sanitizeLayerNameForExpression(l.name) === v);
        if (!layer || !('dataset' in layer)) {
            throw new Error(`Variable "${v}" does not correspond to a valid data layer.`);
        }
        sourceLayers.push(layer as any);
    }
    
    if (sourceLayers.length === 0 && variables.length > 0) {
        throw new Error(`No layers found for variables in expression: ${variables.join(', ')}`);
    }

    if (sourceLayers.length === 0 && variables.length === 0) { // Expression is a constant
        const firstDataLayer = availableLayers.find(l => 'dataset' in l) as DataLayer | undefined;
        if (!firstDataLayer) throw new Error("Cannot evaluate a constant expression without at least one data layer to define dimensions.");
        const { time, height, width } = firstDataLayer.dimensions;
        const result = evaluateExpression(expression, {});
        const resultDataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width).fill(result)));
        return { dataset: resultDataset, range: { min: 0, max: 1 }, dimensions: { time, height, width } };
    }

    const firstLayer = sourceLayers[0];
    const { time, height, width } = firstLayer.dimensions;
    if (!sourceLayers.every(l => l.dimensions.time === time && l.dimensions.height === height && l.dimensions.width === width)) {
        throw new Error("All layers used in an expression must have the same dimensions.");
    }

    const resultDataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width).fill(0)));
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

    for (let t = 0; t < time; t++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const context: { [key: string]: number } = {};
                for (const layer of sourceLayers) {
                    const varName = sanitizeLayerNameForExpression(layer.name);
                    context[varName] = layer.dataset[t][y][x];
                }
                const result = evaluateExpression(expression, context);
                resultDataset[t][y][x] = result;
            }
        }
        if (t % 100 === 0) await yieldToMain();
    }

    return { dataset: resultDataset, range: { min: 0, max: 1 }, dimensions: { time, height, width } };
};


export const calculateDaylightFraction = (dataset: DataSet, timeRange: TimeRange, dimensions: {height: number, width: number}) => {
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

export const calculateNightfallDataset = async (sourceLayer: DataLayer): Promise<{dataset: DataSet, range: {min: number, max: number}, maxDuration: number}> => {
    const { dataset, dimensions } = sourceLayer;
    const { time, height, width } = dimensions;

    const resultDataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width).fill(0)));
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));
    let maxDuration = 0;
    let minDuration = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixelTimeSeries = dataset.map(slice => slice[y][x]);

            // --- Pass 1: Pre-compute all night periods for this pixel ---
            const nightPeriods: { start: number; end: number; duration: number }[] = [];
            let inNight = false;
            let nightStart = -1;

            for (let t = 0; t < time; t++) {
                const isCurrentlyNight = pixelTimeSeries[t] === 0;
                if (isCurrentlyNight && !inNight) {
                    // Sunset: a new night period begins
                    inNight = true;
                    nightStart = t;
                } else if (!isCurrentlyNight && inNight) {
                    // Sunrise: the night period ends
                    inNight = false;
                    const duration = t - nightStart;
                    nightPeriods.push({ start: nightStart, end: t, duration });
                }
            }
            // Handle case where the series ends during a night period
            if (inNight) {
                const duration = time - nightStart;
                nightPeriods.push({ start: nightStart, end: time, duration });
            }
            
            // --- Pass 2: Populate the forecast using the pre-computed list ---
            let nextNightIndex = 0;
            for (let t = 0; t < time; t++) {
                if (pixelTimeSeries[t] === 1) { // It's DAY
                    // Find the next night period that starts after the current time
                    while (nextNightIndex < nightPeriods.length && nightPeriods[nextNightIndex].start <= t) {
                        nextNightIndex++;
                    }

                    if (nextNightIndex < nightPeriods.length) {
                        const nextNight = nightPeriods[nextNightIndex];
                        resultDataset[t][y][x] = nextNight.duration;
                        if (nextNight.duration > maxDuration) maxDuration = nextNight.duration;
                    } else {
                        resultDataset[t][y][x] = 0; // No more night periods
                    }
                } else { // It's NIGHT
                    // Find which night period the current time falls into
                    const currentNight = nightPeriods.find(p => t >= p.start && t < p.end);
                    if (currentNight) {
                        const forecastValue = -currentNight.duration;
                        resultDataset[t][y][x] = forecastValue;
                        if (forecastValue < minDuration) minDuration = forecastValue;
                    } else {
                        // This case should ideally not happen if logic is correct
                        resultDataset[t][y][x] = -1; 
                    }
                }
            }
        }
        if (y % 10 === 0) await yieldToMain();
    }
    return { dataset: resultDataset, range: { min: minDuration, max: maxDuration }, maxDuration };
};
