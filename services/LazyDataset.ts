import { Module, File as H5File, Dataset } from 'h5wasm';
import { loadNpyTimeSlice, StreamingNpyMetadata } from './streamingNpyParser';
import { readFileRange, createTypedArray } from './streamingFileReader';

export interface ILazyDataset {
  getSlice(timeIndex: number): Promise<Float32Array>;
  getCachedSlice(timeIndex: number): Float32Array | undefined;
  getPixelTimeSeries(y: number, x: number): Promise<number[]>;
  dispose(): void;
  clearCache(): void;
  getStats(): { cacheSize: number; totalSizeMB: number };
  setProgressCallback?(callback: (progress: { message: string }) => void): void;
}

const SLICE_CACHE_SIZE_MB = 256; // Max cache size in MB

class SliceCache {
  private cache = new Map<string, { data: Float32Array; lastAccess: number }>();
  private currentSizeMB = 0;

  getKey(fileId: string, timeIndex: number): string {
    return `${fileId}:${timeIndex}`;
  }

  get(fileId: string, timeIndex: number): Float32Array | undefined {
    const key = this.getKey(fileId, timeIndex);
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastAccess = Date.now();
      return entry.data;
    }
    return undefined;
  }

  set(fileId: string, timeIndex: number, data: Float32Array) {
    const key = this.getKey(fileId, timeIndex);
    const sizeMB = data.byteLength / (1024 * 1024);

    // Evict if needed
    while (this.currentSizeMB + sizeMB > SLICE_CACHE_SIZE_MB && this.cache.size > 0) {
      this.evictLRU();
    }

    this.cache.set(key, { data, lastAccess: Date.now() });
    this.currentSizeMB += sizeMB;
  }

  private evictLRU() {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.cache.get(oldestKey)!;
      this.currentSizeMB -= entry.data.byteLength / (1024 * 1024);
      this.cache.delete(oldestKey);
    }
  }

  clearForFile(fileId: string) {
    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(`${fileId}:`)) {
        this.currentSizeMB -= entry.data.byteLength / (1024 * 1024);
        this.cache.delete(key);
      }
    }
  }

  getStatsForFile(fileId: string) {
    let count = 0;
    let sizeMB = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(`${fileId}:`)) {
        count++;
        sizeMB += entry.data.byteLength / (1024 * 1024);
      }
    }
    return { cacheSize: count, totalSizeMB: sizeMB };
  }
}

export const globalSliceCache = new SliceCache();

export class NetCDFLazyDataset implements ILazyDataset {
  private fileId: string;
  private file: H5File;
  private dataset: Dataset;
  private width: number;
  private height: number;
  private h5: any; // Use any for Module to avoid type issues
  private filename: string;

  constructor(h5: any, file: H5File, dataset: Dataset, filename: string) {
    this.h5 = h5;
    this.file = file;
    this.dataset = dataset;
    this.filename = filename;
    this.fileId = filename; // Use filename as unique ID

    // Cache dimensions
    const shape = dataset.shape;
    // Shape is [time, height, width]
    this.height = shape[1];
    this.width = shape[2];
  }

  async getSlice(timeIndex: number): Promise<Float32Array> {
    // Check cache first
    const cached = globalSliceCache.get(this.fileId, timeIndex);
    if (cached) {
      return cached;
    }

    // Read from file
    try {
      // h5wasm slice takes (start, count)
      const start = [timeIndex, 0, 0];
      const count = [1, this.height, this.width];

      console.time(`h5wasm_read_${timeIndex}`);
      // Cast to any to bypass strict type check on slice arguments if needed
      const rawData = (this.dataset as any).slice(start, count);
      console.timeEnd(`h5wasm_read_${timeIndex}`);

      let floatData: Float32Array;
      if (rawData instanceof Float32Array) {
        floatData = rawData;
      } else {
        // Ensure we're passing an ArrayLike or ArrayBuffer
        floatData = new Float32Array(rawData as any);
      }

      // Cache it
      globalSliceCache.set(this.fileId, timeIndex, floatData);

      return floatData;
    } catch (error) {
      console.error(`Failed to read slice ${timeIndex} from ${this.filename}:`, error);
      throw error;
    }
  }

  getCachedSlice(timeIndex: number): Float32Array | undefined {
    return globalSliceCache.get(this.fileId, timeIndex);
  }

  async getPixelTimeSeries(y: number, x: number): Promise<number[]> {
    try {
      // Read pixel across all time steps
      // start: [0, y, x], count: [time, 1, 1]
      const timeSteps = this.dataset.shape[0];
      const start = [0, y, x];
      const count = [timeSteps, 1, 1];

      const rawData = (this.dataset as any).slice(start, count);

      console.log(`[getPixelTimeSeries] timeSteps: ${timeSteps}, start: ${start}, count: ${count}`);
      console.log(`[getPixelTimeSeries] rawData type: ${rawData?.constructor?.name}, length: ${rawData?.length}`);

      // Check if we got the expected length (slice worked correctly)
      if (rawData.length === timeSteps) {
        return Array.from(rawData);
      }

      // Fallback: If slice returned the full dataset (h5wasm bug/limitation?), extract manually
      // Assuming C-order: [Time, Height, Width]
      // Index = t * (Height * Width) + y * Width + x
      const stride = this.height * this.width;
      const offset = y * this.width + x;
      const fullSize = timeSteps * stride;

      if (rawData.length === fullSize) {
        console.warn(`[getPixelTimeSeries] slice() returned full dataset (${rawData.length}). Manually extracting time series.`);
        const result = new Array(timeSteps);
        for (let t = 0; t < timeSteps; t++) {
          result[t] = rawData[t * stride + offset];
        }
        return result;
      }

      // If we're here, the length is unexpected
      console.error(`[getPixelTimeSeries] Unexpected rawData length: ${rawData.length}. Expected ${timeSteps} or ${fullSize}.`);

      // Attempt to convert if small enough, otherwise throw
      if (rawData.length < 1000000) {
        return Array.from(rawData);
      }

      throw new Error(`Invalid slice result length: ${rawData.length}`);
    } catch (error) {
      console.error(`Failed to read pixel time series at (${x}, ${y}) from ${this.filename}:`, error);
      throw error;
    }
  }

  dispose() {
    // Clear cache
    globalSliceCache.clearForFile(this.fileId);

    // Close and delete file from VFS
    try {
      this.file.close();
      this.h5.FS.unlink(this.filename);
      console.log(`🗑️ Closed and unlinked ${this.filename}`);
    } catch (e) {
      console.error(`Error disposing NetCDF file ${this.filename}:`, e);
    }
  }

  clearCache() {
    globalSliceCache.clearForFile(this.fileId);
  }

  getStats() {
    return globalSliceCache.getStatsForFile(this.fileId);
  }
}

export class NpyLazyDataset implements ILazyDataset {
  private file: File; // Browser File object
  private metadata: StreamingNpyMetadata;
  private fileId: string;
  private progressCallback?: (progress: { message: string }) => void;

  constructor(file: File, metadata: StreamingNpyMetadata, options?: any) {
    this.file = file;
    this.metadata = metadata;
    this.fileId = file.name;
  }

  setProgressCallback(callback: (progress: { message: string }) => void) {
    this.progressCallback = callback;
  }

  async getSlice(timeIndex: number): Promise<Float32Array> {
    // Check cache
    const cached = globalSliceCache.get(this.fileId, timeIndex);
    if (cached) {
      return cached;
    }

    // Load from file
    try {
      const data = await loadNpyTimeSlice(this.file, this.metadata, timeIndex);

      // Convert TypedArray to Float32Array if needed
      let floatData: Float32Array;
      if (data instanceof Float32Array) {
        floatData = data;
      } else {
        floatData = new Float32Array(data);
      }

      // Cache it
      globalSliceCache.set(this.fileId, timeIndex, floatData);
      return floatData;
    } catch (error) {
      console.error(`Failed to load NPY slice ${timeIndex}:`, error);
      throw error;
    }
  }

  getCachedSlice(timeIndex: number): Float32Array | undefined {
    return globalSliceCache.get(this.fileId, timeIndex);
  }

  async getPixelTimeSeries(y: number, x: number): Promise<number[]> {
    const { time, height, width } = this.metadata.dimensions;
    const { headerSize, bytesPerValue, dataType } = this.metadata;

    // Create array of promises for parallel reading
    const promises: Promise<number>[] = [];

    // Helper to read single value
    const readValue = async (t: number): Promise<number> => {
      // Calculate offset for pixel (y, x) at time t
      // C-order: time * sliceSize + y * rowSize + x * bytesPerValue
      const offset = headerSize +
        (t * height * width * bytesPerValue) +
        (y * width * bytesPerValue) +
        (x * bytesPerValue);

      const buffer = await readFileRange(this.file, offset, bytesPerValue);
      const typedArray = createTypedArray(buffer, dataType);
      return typedArray[0];
    };

    // Batch requests to avoid overwhelming the browser/OS
    // Batch size of 50
    const results: number[] = new Array(time);
    const batchSize = 50;

    for (let i = 0; i < time; i += batchSize) {
      const batchPromises: Promise<void>[] = [];
      for (let j = 0; j < batchSize && i + j < time; j++) {
        const t = i + j;
        batchPromises.push(readValue(t).then(val => { results[t] = val; }));
      }
      await Promise.all(batchPromises);
    }

    return results;
  }

  dispose() {
    globalSliceCache.clearForFile(this.fileId);
  }

  clearCache() {
    globalSliceCache.clearForFile(this.fileId);
  }

  getStats() {
    return globalSliceCache.getStatsForFile(this.fileId);
  }
}

// Export NpyLazyDataset as LazyDataset for backward compatibility with AppContext
export { NpyLazyDataset as LazyDataset };
// Export NetCDFLazyDataset as NetCDFReader for backward compatibility
export { NetCDFLazyDataset as NetCDFReader };
