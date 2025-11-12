import type { DataSet, DataSlice, Layer, DataLayer, AnalysisLayer, DteCommsLayer, LpfCommsLayer, TimeRange } from '../types';

let worker: Worker | null = null;
let nextRequestId = 0;
const pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (reason?: any) => void }>();

function getWorker(): Worker {
    if (!worker) {
        // Use a path relative to the document root, which is more robust for various deployment scenarios.
        worker = new Worker('services/analysis.worker.ts', { type: 'module' });

        worker.onmessage = (e) => {
            const { requestId, result, error } = e.data;
            const request = pendingRequests.get(requestId);
            if (request) {
                if (error) {
                    request.reject(new Error(error));
                } else {
                    request.resolve(result);
                }
                pendingRequests.delete(requestId);
            }
        };
    }
    return worker;
}

function postRequest(type: string, payload: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const requestId = nextRequestId++;
        pendingRequests.set(requestId, { resolve, reject });
        getWorker().postMessage({ type, requestId, payload });
    });
}

export function terminateWorker() {
    if (worker) {
        worker.terminate();
        worker = null;
    }
}

export const calculateExpressionLayer = (expression: string, availableLayers: Layer[]): Promise<{ dataset: DataSet; range: { min: number; max: number }; dimensions: { time: number; height: number; width: number; } }> => {
    // We need to send serializable layers to the worker (without datasets)
    const serializableLayers = availableLayers.map(l => {
        if ('dataset' in l) {
            const { dataset, ...rest } = l;
            return { ...rest, hasDataset: true };
        }
        return { ...l, hasDataset: false };
    });
    // Datasets are sent separately to allow for transferring them
    const datasets = availableLayers
        .filter(l => 'dataset' in l)
        .map(l => (l as DataLayer).dataset);

    return postRequest('EXPRESSION', { expression, layers: serializableLayers, datasets });
};

export const calculateNightfallDataset = (sourceLayer: DataLayer): Promise<{dataset: DataSet, range: {min: number, max: number}, maxDuration: number}> => {
    // Transfer the dataset buffer for performance
    return postRequest('NIGHTFALL', { sourceLayer });
};

// This function is simple enough to remain on the main thread
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
