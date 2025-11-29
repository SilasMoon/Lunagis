/**
 * LazyDataset
 *
 * A lazy-loading dataset that acts like a regular 3D array but only loads
 * time slices into memory when accessed. Implements LRU caching to keep
 * memory usage constant.
 *
 * Usage:
 *   const dataset = new LazyDataset(file, metadata);
 *   const slice = await dataset.getSlice(timeIndex);
 *   const value = await dataset.getValue(t, y, x);
 *
 * Memory: Keeps only N most recently used time slices in cache (default: 20)
 */

import type { TypedArray, FileMetadata, ProgressCallback } from './streamingFileReader';
import type { StreamingNpyMetadata } from './streamingNpyParser';
import type { StreamingNetCdfMetadata } from './streamingNetCdfParser';
import type { File as H5File } from 'h5wasm';
import { loadNpyTimeSlice } from './streamingNpyParser';
import { loadNetCdfTimeSlice } from './streamingNetCdfParser';

export interface LazyDatasetOptions {
  cacheSize?: number; // Number of time slices to keep in memory
  preloadAdjacent?: boolean; // Preload adjacent time slices
  preloadDistance?: number; // How many adjacent slices to preload
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  currentSize: number;
  maxSize: number;
  memoryUsageMB: number;
}

/**
 * LazyDataset class - lazy loading with LRU caching
 */
export class LazyDataset {
  private file: File;
  private metadata: FileMetadata;
  private cache: Map<number, TypedArray>;
  private lruQueue: number[]; // Queue of time indices (oldest first)
  private cacheSize: number;
  private preloadAdjacent: boolean;
  private preloadDistance: number;
  private stats: CacheStats;
  private loadingPromises: Map<number, Promise<TypedArray>>;
  private progressCallback?: ProgressCallback;
  private h5file?: H5File; // For NetCDF files (h5wasm file handle)

  constructor(
    file: File,
    metadata: FileMetadata,
    options: LazyDatasetOptions = {},
    h5file?: H5File // Optional h5wasm file handle for NetCDF
  ) {
    this.file = file;
    this.metadata = metadata;
    this.cache = new Map();
    this.lruQueue = [];
    this.cacheSize = options.cacheSize ?? 20; // Default: 20 time slices
    this.preloadAdjacent = options.preloadAdjacent ?? true;
    this.preloadDistance = options.preloadDistance ?? 2;
    this.loadingPromises = new Map();
    this.h5file = h5file;

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      currentSize: 0,
      maxSize: this.cacheSize,
      memoryUsageMB: 0
    };

    console.log(`💾 LazyDataset initialized:`, {
      file: file.name,
      dimensions: metadata.dimensions,
      cacheSize: this.cacheSize,
      sliceSize: `${(metadata.sliceSize / 1024 / 1024).toFixed(2)} MB`,
      maxMemory: `${(this.cacheSize * metadata.sliceSize / 1024 / 1024).toFixed(2)} MB`
    });
  }

  /**
   * Get a time slice (2D array)
   */
  async getSlice(timeIndex: number): Promise<TypedArray> {
    if (timeIndex < 0 || timeIndex >= this.metadata.dimensions.time) {
      throw new Error(
        `Time index ${timeIndex} out of range [0, ${this.metadata.dimensions.time - 1}]`
      );
    }

    // Check cache first
    if (this.cache.has(timeIndex)) {
      this.stats.hits++;
      this.updateLRU(timeIndex);

      // Preload adjacent slices in background
      if (this.preloadAdjacent) {
        this.preloadAdjacentSlices(timeIndex);
      }

      return this.cache.get(timeIndex)!;
    }

    // Cache miss - load from file
    this.stats.misses++;

    // Check if already loading
    if (this.loadingPromises.has(timeIndex)) {
      return this.loadingPromises.get(timeIndex)!;
    }

    // Load slice
    const loadPromise = this.loadSlice(timeIndex);
    this.loadingPromises.set(timeIndex, loadPromise);

    try {
      const data = await loadPromise;

      // Add to cache
      this.addToCache(timeIndex, data);

      // Preload adjacent slices
      if (this.preloadAdjacent) {
        this.preloadAdjacentSlices(timeIndex);
      }

      return data;
    } finally {
      this.loadingPromises.delete(timeIndex);
    }
  }

  /**
   * Get a single value at (t, y, x)
   */
  async getValue(t: number, y: number, x: number): Promise<number> {
    const slice = await this.getSlice(t);
    const { height, width } = this.metadata.dimensions;
    const index = y * width + x;
    return slice[index];
  }

  /**
   * Get a pixel's time series (all values at y, x across time)
   */
  async getPixelTimeSeries(y: number, x: number): Promise<number[]> {
    const { time } = this.metadata.dimensions;
    const series: number[] = [];

    for (let t = 0; t < time; t++) {
      const value = await this.getValue(t, y, x);
      series.push(value);
    }

    return series;
  }

  /**
   * Preload a range of time slices
   */
  async preloadRange(startTime: number, endTime: number): Promise<void> {
    const promises: Promise<TypedArray>[] = [];

    for (let t = startTime; t < endTime; t++) {
      if (!this.cache.has(t) && !this.loadingPromises.has(t)) {
        promises.push(this.getSlice(t));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.lruQueue = [];
    this.stats.currentSize = 0;
    this.stats.memoryUsageMB = 0;
    console.log('🗑️ Cache cleared');
  }

  /**
   * Dispose and cleanup all resources
   * IMPORTANT: Call this when layer is deleted to prevent memory leaks
   */
  dispose(): void {
    console.log('🗑️ Disposing LazyDataset...');

    // Clear all cached data
    this.clearCache();

    // Clear any pending loads
    this.loadingPromises.clear();

    // Close h5wasm file handle if this is a NetCDF file
    if (this.h5file && this.metadata.fileType === 'netcdf') {
      try {
        const netcdfMetadata = this.metadata as StreamingNetCdfMetadata;
        const filename = netcdfMetadata.h5wasmFilename;

        console.log(`Closing h5wasm file: ${filename}`);
        this.h5file.close();

        // Try to delete from virtual FS
        if (filename && typeof h5wasm !== 'undefined') {
          try {
            const h5wasm = require('h5wasm');
            h5wasm.FS.unlink(filename);
            console.log(`Deleted ${filename} from h5wasm virtual FS`);
          } catch (e) {
            // File might not exist or FS might not support unlink
            console.warn('Could not delete from virtual FS:', e);
          }
        }
      } catch (error) {
        console.warn('Error closing h5wasm file:', error);
      }
    }

    // Clear h5file reference
    this.h5file = undefined;

    // Clear progress callback
    this.progressCallback = undefined;

    console.log('✅ LazyDataset disposed');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Set progress callback
   */
  setProgressCallback(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Get metadata
   */
  getMetadata(): FileMetadata {
    return this.metadata;
  }

  // ========== Private methods ==========

  private async loadSlice(timeIndex: number): Promise<TypedArray> {
    if (this.metadata.fileType === 'npy') {
      return loadNpyTimeSlice(
        this.file,
        this.metadata as StreamingNpyMetadata,
        timeIndex,
        this.progressCallback
      );
    } else if (this.metadata.fileType === 'netcdf') {
      if (!this.h5file) {
        throw new Error('NetCDF file handle not provided to LazyDataset');
      }
      return loadNetCdfTimeSlice(
        this.h5file,
        this.metadata as StreamingNetCdfMetadata,
        timeIndex,
        this.progressCallback
      );
    } else {
      throw new Error(`Unsupported file type: ${this.metadata.fileType}`);
    }
  }

  private addToCache(timeIndex: number, data: TypedArray): void {
    // Evict if cache is full
    while (this.cache.size >= this.cacheSize && this.lruQueue.length > 0) {
      const oldestIndex = this.lruQueue.shift()!;
      this.cache.delete(oldestIndex);
      this.stats.evictions++;
    }

    // Add to cache
    this.cache.set(timeIndex, data);
    this.lruQueue.push(timeIndex);
    this.stats.currentSize = this.cache.size;
    this.stats.memoryUsageMB =
      (this.cache.size * this.metadata.sliceSize) / (1024 * 1024);
  }

  private updateLRU(timeIndex: number): void {
    // Move to end of queue (most recently used)
    const index = this.lruQueue.indexOf(timeIndex);
    if (index !== -1) {
      this.lruQueue.splice(index, 1);
      this.lruQueue.push(timeIndex);
    }
  }

  private preloadAdjacentSlices(currentTime: number): void {
    // Preload in background (don't await)
    const { time } = this.metadata.dimensions;

    for (let offset = 1; offset <= this.preloadDistance; offset++) {
      // Preload forward
      const nextTime = currentTime + offset;
      if (
        nextTime < time &&
        !this.cache.has(nextTime) &&
        !this.loadingPromises.has(nextTime)
      ) {
        this.getSlice(nextTime).catch(err =>
          console.warn(`Failed to preload slice ${nextTime}:`, err)
        );
      }

      // Preload backward
      const prevTime = currentTime - offset;
      if (
        prevTime >= 0 &&
        !this.cache.has(prevTime) &&
        !this.loadingPromises.has(prevTime)
      ) {
        this.getSlice(prevTime).catch(err =>
          console.warn(`Failed to preload slice ${prevTime}:`, err)
        );
      }
    }
  }
}

/**
 * Convert LazyDataset to traditional 3D array (for compatibility)
 * WARNING: Loads entire dataset into memory! Only use for small datasets.
 */
export async function materializeLazyDataset(
  dataset: LazyDataset,
  onProgress?: ProgressCallback
): Promise<number[][][]> {
  const metadata = dataset.getMetadata();
  const { time, height, width } = metadata.dimensions;

  const result: number[][][] = [];

  for (let t = 0; t < time; t++) {
    if (onProgress) {
      onProgress({
        phase: 'data',
        loaded: t + 1,
        total: time,
        percentage: ((t + 1) / time) * 100,
        message: `Materializing dataset: ${t + 1}/${time}`
      });
    }

    const slice = await dataset.getSlice(t);
    const array2D: number[][] = [];

    for (let y = 0; y < height; y++) {
      const row: number[] = [];
      for (let x = 0; x < width; x++) {
        row.push(slice[y * width + x]);
      }
      array2D.push(row);
    }

    result.push(array2D);
  }

  return result;
}
