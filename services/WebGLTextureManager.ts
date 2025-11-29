/**
 * WebGLTextureManager
 *
 * Manages WebGL texture lifecycle for float data textures.
 * Handles creation, updates, deletion, and memory tracking.
 */

export class WebGLTextureManager {
  private gl: WebGLRenderingContext;
  private textures: Map<WebGLTexture, number>; // texture -> memory size in bytes

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.textures = new Map();
  }

  /**
   * Create a floating-point texture from Float32Array data
   *
   * @param width - Texture width in pixels
   * @param height - Texture height in pixels
   * @param data - Float32Array data (width * height values) or null to allocate only
   * @returns WebGLTexture handle
   */
  createFloatTexture(width: number, height: number, data: Float32Array | null): WebGLTexture {
    const gl = this.gl;

    const texture = gl.createTexture();
    if (!texture) {
      throw new Error('Failed to create WebGL texture');
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Upload float data as LUMINANCE (single channel)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,              // mip level
      gl.LUMINANCE,   // internal format
      width,
      height,
      0,              // border (must be 0)
      gl.LUMINANCE,   // format
      gl.FLOAT,       // type
      data
    );

    // Check for WebGL errors
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      gl.deleteTexture(texture);
      throw new Error(`Failed to upload texture data: WebGL error ${error}`);
    }

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Track memory usage (Float32 = 4 bytes per pixel)
    const memoryBytes = width * height * 4;
    this.textures.set(texture, memoryBytes);

    console.log(`✅ Created texture: ${width}×${height}, ${(memoryBytes / 1024 / 1024).toFixed(2)} MB`);

    return texture;
  }

  /**
   * Update an existing texture with new data
   *
   * @param texture - Texture to update
   * @param width - Texture width
   * @param height - Texture height
   * @param data - New Float32Array data
   */
  updateTexture(texture: WebGLTexture, width: number, height: number, data: Float32Array): void {
    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      width,
      height,
      0,
      gl.LUMINANCE,
      gl.FLOAT,
      data
    );

    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      console.error(`Failed to update texture: WebGL error ${error}`);
    }
  }

  /**
   * Delete a texture and free GPU memory
   *
   * @param texture - Texture to delete
   */
  deleteTexture(texture: WebGLTexture): void {
    const memoryBytes = this.textures.get(texture);
    this.gl.deleteTexture(texture);
    this.textures.delete(texture);

    if (memoryBytes) {
      console.log(`🗑️ Deleted texture: ${(memoryBytes / 1024 / 1024).toFixed(2)} MB freed`);
    }
  }

  /**
   * Get total GPU memory usage for all managed textures
   *
   * @returns Memory usage in megabytes
   */
  getMemoryUsage(): number {
    let totalBytes = 0;
    this.textures.forEach((bytes) => {
      totalBytes += bytes;
    });
    return totalBytes / (1024 * 1024); // Return in MB
  }

  /**
   * Get number of textures currently managed
   *
   * @returns Texture count
   */
  getTextureCount(): number {
    return this.textures.size;
  }

  /**
   * Cleanup all textures
   */
  dispose(): void {
    this.textures.forEach((_, texture) => {
      this.gl.deleteTexture(texture);
    });
    this.textures.clear();
    console.log('🗑️ WebGLTextureManager disposed');
  }
}
