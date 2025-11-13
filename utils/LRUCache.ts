/**
 * LRU (Least Recently Used) Cache implementation
 * Automatically evicts least recently used items when capacity is reached
 */
export class LRUCache<K, V> {
  private capacity: number;
  private cache: Map<K, V>;
  private accessOrder: K[]; // Track access order, most recent at end

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('Cache capacity must be positive');
    }
    this.capacity = capacity;
    this.cache = new Map();
    this.accessOrder = [];
  }

  /**
   * Get value from cache
   * Updates access order
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);

    if (value !== undefined) {
      // Update access order - move to end (most recent)
      this.updateAccessOrder(key);
    }

    return value;
  }

  /**
   * Set value in cache
   * Evicts least recently used item if capacity is reached
   */
  set(key: K, value: V): void {
    // If key exists, just update it
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this.updateAccessOrder(key);
      return;
    }

    // If at capacity, evict least recently used
    if (this.cache.size >= this.capacity) {
      this.evictLRU();
    }

    // Add new item
    this.cache.set(key, value);
    this.accessOrder.push(key);
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete key from cache
   */
  delete(key: K): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.accessOrder = this.accessOrder.filter(k => k !== key);
    }
    return deleted;
  }

  /**
   * Clear all items from cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache capacity
   */
  get maxSize(): number {
    return this.capacity;
  }

  /**
   * Get all keys in access order (least to most recent)
   */
  keys(): K[] {
    return [...this.accessOrder];
  }

  /**
   * Get all values
   */
  values(): V[] {
    return this.accessOrder.map(key => this.cache.get(key)!);
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; capacity: number; utilizationPercent: number } {
    return {
      size: this.size,
      capacity: this.capacity,
      utilizationPercent: (this.size / this.capacity) * 100
    };
  }

  /**
   * Update access order for a key (move to most recent)
   */
  private updateAccessOrder(key: K): void {
    // Remove from current position
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    // Add to end (most recent)
    this.accessOrder.push(key);
  }

  /**
   * Evict least recently used item
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    // First item in access order is least recently used
    const lruKey = this.accessOrder[0];
    this.cache.delete(lruKey);
    this.accessOrder.shift();
  }
}

/**
 * Specialized LRU Cache for Canvas elements
 * Tracks total memory usage based on canvas size
 */
export class CanvasLRUCache extends LRUCache<string, HTMLCanvasElement> {
  private maxMemoryBytes: number;
  private currentMemoryBytes: number = 0;

  constructor(maxItems: number, maxMemoryMB: number = 500) {
    super(maxItems);
    this.maxMemoryBytes = maxMemoryMB * 1024 * 1024; // Convert MB to bytes
  }

  /**
   * Calculate approximate memory usage of a canvas
   */
  private getCanvasMemorySize(canvas: HTMLCanvasElement): number {
    // Approximate: width * height * 4 bytes per pixel (RGBA)
    return canvas.width * canvas.height * 4;
  }

  /**
   * Set canvas in cache with memory tracking
   */
  set(key: string, canvas: HTMLCanvasElement): void {
    const canvasSize = this.getCanvasMemorySize(canvas);

    // Check if adding this canvas would exceed memory limit
    if (this.currentMemoryBytes + canvasSize > this.maxMemoryBytes) {
      // Evict items until we have enough space
      while (this.currentMemoryBytes + canvasSize > this.maxMemoryBytes && this.size > 0) {
        this.evictOldest();
      }
    }

    // If canvas is too large for cache, don't store it
    if (canvasSize > this.maxMemoryBytes) {
      console.warn(`Canvas too large for cache: ${(canvasSize / 1024 / 1024).toFixed(2)}MB`);
      return;
    }

    super.set(key, canvas);
    this.currentMemoryBytes += canvasSize;
  }

  /**
   * Delete canvas from cache with memory tracking
   */
  delete(key: string): boolean {
    const canvas = this.get(key);
    if (canvas) {
      this.currentMemoryBytes -= this.getCanvasMemorySize(canvas);
    }
    return super.delete(key);
  }

  /**
   * Clear all canvases and reset memory counter
   */
  clear(): void {
    super.clear();
    this.currentMemoryBytes = 0;
  }

  /**
   * Evict oldest canvas
   */
  private evictOldest(): void {
    const keys = this.keys();
    if (keys.length > 0) {
      this.delete(keys[0]);
    }
  }

  /**
   * Get cache statistics including memory usage
   */
  getStats() {
    const baseStats = super.getStats();
    return {
      ...baseStats,
      currentMemoryMB: this.currentMemoryBytes / 1024 / 1024,
      maxMemoryMB: this.maxMemoryBytes / 1024 / 1024,
      memoryUtilizationPercent: (this.currentMemoryBytes / this.maxMemoryBytes) * 100
    };
  }
}
