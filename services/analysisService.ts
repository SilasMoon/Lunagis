import type { DataSet, DataSlice, Layer, DataLayer, AnalysisLayer, DteCommsLayer, LpfCommsLayer, TimeRange } from '../types';
import { evaluate as evaluateExpression, getVariables as getExpressionVariables, compileExpression, evaluateCompiled } from './expressionEvaluator';
import { analysisCache, AnalysisCacheKey } from './analysisCache';

export const sanitizeLayerNameForExpression = (name: string): string => {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
};

export const calculateExpressionLayer = async (
    expression: string,
    availableLayers: Layer[],
    onProgress?: (message: string) => void
): Promise<{ dataset: DataSet; range: { min: number; max: number }; dimensions: { time: number; height: number; width: number; } }> => {
    const variables = getExpressionVariables(expression);
    const sourceLayers: (DataLayer | AnalysisLayer | DteCommsLayer | LpfCommsLayer)[] = [];

    for (const v of variables) {
        const layer = availableLayers.find(l => sanitizeLayerNameForExpression(l.name) === v);
        if (!layer || !('dataset' in layer)) {
            throw new Error(`Variable "${v}" does not correspond to a valid data layer.`);
        }
        sourceLayers.push(layer as any);
    }

    // Check cache before computing
    const layerIds = sourceLayers.map(l => l.id);
    const cacheKey = AnalysisCacheKey.forExpression(expression, layerIds);
    const cachedResult = analysisCache.getExpression(cacheKey);
    if (cachedResult) {
        if (onProgress) {
            onProgress('Using cached result... 100%');
        }
        return cachedResult;
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

    // OPTIMIZATION 1: Pre-compile the expression once
    const compiledExpression = compileExpression(expression);

    // OPTIMIZATION 2: Pre-compute variable names to avoid repeated sanitization
    const layerVarNames = sourceLayers.map(l => sanitizeLayerNameForExpression(l.name));

    const resultDataset: DataSet = Array.from({ length: time }, () => Array.from({ length: height }, () => new Array(width).fill(0)));
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

    // OPTIMIZATION 3: Reuse context object instead of creating new one each iteration
    const context: { [key: string]: number } = {};

    // OPTIMIZATION 4: Better yielding - yield more frequently for better UI responsiveness
    // Process in chunks of ~50,000 pixels between yields
    const pixelsPerYield = 50000;
    let pixelCount = 0;
    const totalPixels = time * height * width;
    let lastReportedProgress = -1;

    // Report initial progress
    if (onProgress) {
        onProgress('Calculating expression... 0%');
        await yieldToMain();
    }

    for (let t = 0; t < time; t++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Update context with current pixel values from all source layers
                for (let i = 0; i < sourceLayers.length; i++) {
                    context[layerVarNames[i]] = sourceLayers[i].dataset[t][y][x];
                }
                // Use pre-compiled expression for much faster evaluation
                const result = evaluateCompiled(compiledExpression, context);
                resultDataset[t][y][x] = result;

                // Yield to main thread periodically to keep UI responsive
                pixelCount++;
                if (pixelCount >= pixelsPerYield) {
                    // Update progress if callback provided
                    if (onProgress) {
                        const totalProcessed = t * height * width + y * width + x + 1;
                        const progress = Math.floor((totalProcessed / totalPixels) * 100);
                        // Only report if progress has changed to avoid excessive updates
                        if (progress !== lastReportedProgress) {
                            onProgress(`Calculating expression... ${progress}%`);
                            lastReportedProgress = progress;
                        }
                    }
                    await yieldToMain();
                    pixelCount = 0;
                }
            }
        }
    }

    // Report completion
    if (onProgress) {
        onProgress('Calculating expression... 100%');
    }

    const result = { dataset: resultDataset, range: { min: 0, max: 1 }, dimensions: { time, height, width } };

    // Store result in cache
    analysisCache.setExpression(cacheKey, result);

    return result;
};


export const calculateDaylightFraction = (
    dataset: DataSet,
    timeRange: TimeRange,
    dimensions: {height: number, width: number},
    sourceLayerId?: string
) => {
    const { height, width } = dimensions;

    // Check cache before computing (if we have a source layer ID)
    if (sourceLayerId) {
        const datasetHash = AnalysisCacheKey.hashDataset(dataset, { time: dataset.length, height, width });
        const cacheKey = AnalysisCacheKey.forDaylightFraction(sourceLayerId, datasetHash, timeRange);
        const cachedResult = analysisCache.getDaylightFraction(cacheKey);
        if (cachedResult) {
            return cachedResult;
        }
    }

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

    const result = { slice: resultSlice, range: { min: 0, max: 100 } };

    // Store result in cache (if we have a source layer ID)
    if (sourceLayerId) {
        const datasetHash = AnalysisCacheKey.hashDataset(dataset, { time: dataset.length, height, width });
        const cacheKey = AnalysisCacheKey.forDaylightFraction(sourceLayerId, datasetHash, timeRange);
        analysisCache.setDaylightFraction(cacheKey, result);
    }

    return result;
};

export const calculateNightfallDataset = async (sourceLayer: DataLayer): Promise<{dataset: DataSet, range: {min: number, max: number}, maxDuration: number}> => {
    const { dataset, dimensions } = sourceLayer;
    const { time, height, width } = dimensions;

    // Check cache before computing
    const datasetHash = AnalysisCacheKey.hashDataset(dataset, dimensions);
    const cacheKey = AnalysisCacheKey.forNightfall(sourceLayer.id, datasetHash);
    const cachedResult = analysisCache.getNightfall(cacheKey);
    if (cachedResult) {
        return cachedResult;
    }

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

    const result = { dataset: resultDataset, range: { min: minDuration, max: maxDuration }, maxDuration };

    // Store result in cache
    analysisCache.setNightfall(cacheKey, result);

    return result;
};
