/**
 * NetCDF4 Parser for Lunar Illumination Maps
 *
 * Parses NetCDF4 files (HDF5 backend) containing lunar surface illumination data.
 * Supports CF-1.7 conventions with polar stereographic projection.
 *
 * Expected file structure:
 * - Dimensions: time (unlimited), y (variable), x (variable)
 * - Variables: illumination[time, y, x], latitude[y, x], longitude[y, x]
 * - CRS: Polar Stereographic (South Pole Centered)
 */

import * as h5wasm from 'h5wasm';
import type { File as H5File, Dataset as H5Dataset } from 'h5wasm';
import { NetCDFReader } from './LazyDataset';

export interface NetCdf4ParseResult {
  reader: NetCDFReader;
  shape: [number, number, number]; // [time, height, width]
  dimensions: {
    time: number;
    height: number;
    width: number;
  };
  metadata: NetCdf4Metadata;
  coordinates?: {
    x: Float32Array;         // 1D projected x coordinates (meters) - REQUIRED
    y: Float32Array;         // 1D projected y coordinates (meters) - REQUIRED
    latitude?: Float32Array; // Optional: 2D auxiliary lat (for reference)
    longitude?: Float32Array; // Optional: 2D auxiliary lon (for reference)
  };
}

export interface NetCdf4Metadata {
  title?: string;
  institution?: string;
  source?: string;
  history?: string;
  conventions?: string;
  variableName: string;
  variableUnit?: string;
  variableLongName?: string;
  variableDataType?: string;  // Original data type from NetCDF (e.g., '<B', '<f4', etc.)
  timeUnit?: string;
  timeCalendar?: string;
  timeValues?: number[];
  crs?: {
    projection: string;
    latitudeOfOrigin?: number;
    centralMeridian?: number;
    semiMajorAxis?: number;
    inverseFlattening?: number;
    spatialRef?: string;  // Proj4 string from spatial_ref attribute
  };
  latitude?: {
    min: number;
    max: number;
  };
  longitude?: {
    min: number;
    max: number;
  };
}

// Singleton instance for h5wasm module
let h5wasmReady: Promise<any> | null = null;

/**
 * Initialize h5wasm module
 */
async function getH5Wasm(): Promise<any> {
  if (!h5wasmReady) {
    h5wasmReady = h5wasm.ready;
  }
  return h5wasmReady;
}

/**
 * Parse a NetCDF4 file and extract illumination data
 * @param arrayBuffer - The raw file data
 * @returns Parsed data with metadata
 */
export async function parseNetCdf4(arrayBuffer: ArrayBuffer): Promise<NetCdf4ParseResult> {
  try {
    // Initialize h5wasm
    const h5 = await getH5Wasm();

    console.log('h5wasm initialized, loading file...');
    console.log('File size:', arrayBuffer.byteLength, 'bytes');

    // Check HDF5 signature
    const signatureView = new Uint8Array(arrayBuffer, 0, 8);
    console.log('File signature:', Array.from(signatureView.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '));

    // HDF5 signature should be: 89 48 44 46 0d 0a 1a 0a
    const expectedSignature = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
    const hasValidSignature = expectedSignature.every((byte, i) => signatureView[i] === byte);

    if (!hasValidSignature) {
      throw new Error(
        'Invalid HDF5/NetCDF4 file signature. This file may not be in NetCDF-4 format. ' +
        'Expected HDF5 signature (89 48 44 46...), got: ' +
        Array.from(signatureView.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ')
      );
    }

    console.log('Valid HDF5 signature detected');

    // Create HDF5 file object from buffer
    const uint8Array = new Uint8Array(arrayBuffer);
    const filename = `uploaded_file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.nc`;

    // Write file to virtual filesystem
    h5wasm.FS.writeFile(filename, uint8Array);

    // Try to open the file with h5wasm
    let file;
    try {
      // h5wasm.File constructor signature: File(buffer, filename)
      // Open from virtual filesystem
      file = new h5wasm.File(filename, 'r');
    } catch (openError) {
      const errorMsg = openError instanceof Error ? openError.message : String(openError);
      // Clean up if open fails
      try { h5wasm.FS.unlink(filename); } catch (e) { }

      throw new Error(
        `Failed to open NetCDF-4 file. ${errorMsg}\n\n` +
        `This file appears to use HDF5 features (likely compression) that cannot be read in the browser. ` +
        `\n\nWORKAROUND: Convert the file using this Python command:\n` +
        `nccopy -d0 input.nc output.nc\n\n` +
        `This will create an uncompressed version that can be loaded in the browser.`
      );
    }

    console.log('File opened successfully');

    try {
      // Extract dimensions from the file
      const dimensions = extractDimensions(file);
      console.log('Dimensions extracted:', dimensions);

      // Find the main data variable (illumination)
      const dataVarName = findDataVariable(file);
      console.log('Data variable found:', dataVarName);

      const dataset = file.get(dataVarName) as H5Dataset;
      const dtype = dataset.dtype as unknown as string;

      // Extract metadata
      const metadata = extractMetadata(file, dataVarName, dimensions, dtype);
      console.log('Metadata extracted');

      // Extract coordinate arrays
      const coordinates = extractCoordinates(file, dimensions);
      if (coordinates) {
        console.log('Coordinate arrays extracted');
      }

      // Create lazy reader
      // Note: We do NOT close the file here, the reader takes ownership
      const reader = new NetCDFReader(h5, file, dataset, filename);

      return {
        reader,
        shape: [dimensions.time, dimensions.height, dimensions.width],
        dimensions,
        metadata,
        coordinates,
      };
    } catch (e) {
      // If setup fails, close file and cleanup
      file.close();
      try { h5wasm.FS.unlink(filename); } catch (e) { }
      throw e;
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse NetCDF4 file: ${error.message}`);
    }
    throw new Error('Failed to parse NetCDF4 file: Unknown error');
  }
}

/**
 * Extract dimension information from the NetCDF4 file
 */
function extractDimensions(file: H5File): {
  time: number;
  height: number;
  width: number;
} {
  const keys = file.keys();

  // Common variable names for the main data
  const possibleDataVars = [
    'illumination',
    'solar_illumination',
    'illumination_fraction',
    'data',
  ];

  let dataVarName: string | null = null;
  for (const varName of possibleDataVars) {
    if (keys.includes(varName)) {
      dataVarName = varName;
      break;
    }
  }

  // If not found by name, look for any 3D variable
  if (!dataVarName) {
    for (const key of keys) {
      try {
        const dataset = file.get(key) as any;
        if (dataset && dataset.shape && dataset.shape.length === 3) {
          dataVarName = key;
          break;
        }
      } catch (e) {
        // Skip if we can't access this key
        continue;
      }
    }
  }

  if (!dataVarName) {
    throw new Error(
      `Could not find a 3D data variable. Available variables: ${keys.join(', ')}`
    );
  }

  // Get the shape from the data variable
  const dataset = file.get(dataVarName) as any;
  if (!dataset || !dataset.shape || dataset.shape.length !== 3) {
    throw new Error(`Variable "${dataVarName}" is not a 3D array`);
  }

  const [time, height, width] = dataset.shape;

  if (time === 0 || height === 0 || width === 0) {
    throw new Error(
      `Invalid dimensions: time=${time}, height=${height}, width=${width}`
    );
  }

  return { time, height, width };
}

/**
 * Find the main data variable (usually 'illumination')
 */
function findDataVariable(file: H5File): string {
  const keys = file.keys();

  // Priority order for finding the data variable
  const possibleNames = [
    'illumination',
    'solar_illumination',
    'illumination_fraction',
    'data',
  ];

  for (const name of possibleNames) {
    if (keys.includes(name)) {
      return name;
    }
  }

  // If not found, look for any variable with 3 dimensions
  for (const key of keys) {
    try {
      const dataset = file.get(key) as any;
      if (dataset && dataset.shape && dataset.shape.length === 3) {
        console.warn(
          `Could not find standard illumination variable. Using '${key}' as data variable.`
        );
        return key;
      }
    } catch (e) {
      // Skip if we can't access this key
      continue;
    }
  }

  throw new Error(
    `Could not find data variable. Available variables: ${keys.join(', ')}`
  );
}

/**
 * Extract metadata from the NetCDF4 file
 */
function extractMetadata(
  file: H5File,
  dataVariableName: string,
  dimensions: { time: number; height: number; width: number },
  dataType?: string
): NetCdf4Metadata {
  const metadata: NetCdf4Metadata = {
    variableName: dataVariableName,
    variableDataType: dataType,
  };

  // Extract global attributes from root group
  try {
    const attrs = file.attrs as any;
    if (attrs) {
      metadata.title = attrs.title?.value || undefined;
      metadata.institution = attrs.institution?.value || undefined;
      metadata.source = attrs.source?.value || undefined;
      metadata.history = attrs.history?.value || undefined;
      metadata.conventions = attrs.Conventions?.value || attrs.conventions?.value || undefined;
    }
  } catch (error) {
    // Global attributes might not exist
  }

  // Extract variable attributes
  try {
    const dataVar = file.get(dataVariableName) as any;
    if (dataVar && dataVar.attrs) {
      metadata.variableUnit = dataVar.attrs.units?.value || undefined;
      metadata.variableLongName = dataVar.attrs.long_name?.value || undefined;
    }
  } catch (error) {
    // Variable attributes might not exist
  }

  // Extract time metadata
  try {
    const keys = file.keys();
    const timeVarNames = ['time', 't', 'Time'];
    for (const name of timeVarNames) {
      if (keys.includes(name)) {
        const timeVar = file.get(name) as any;
        if (timeVar) {
          if (timeVar.attrs) {
            metadata.timeUnit = timeVar.attrs.units?.value || undefined;
            metadata.timeCalendar = timeVar.attrs.calendar?.value || undefined;
          }

          // Try to read time values
          try {
            const timeData = timeVar.value;
            if (timeData) {
              metadata.timeValues = Array.from(timeData);
            }
          } catch (e) {
            // Time values might not be readable
          }
          break;
        }
      }
    }
  } catch (error) {
    // Time metadata might not exist
  }

  // Extract CRS information
  try {
    const keys = file.keys();
    const crsVarNames = ['polar_stereographic', 'crs', 'spatial_ref'];
    for (const name of crsVarNames) {
      if (keys.includes(name)) {
        const crsVar = file.get(name) as any;
        if (crsVar && crsVar.attrs) {
          const attrs = crsVar.attrs;
          metadata.crs = {
            projection: 'Polar Stereographic',
            latitudeOfOrigin: attrs.latitude_of_origin?.value ||
              attrs.latitude_of_projection_origin?.value || undefined,
            centralMeridian: attrs.straight_vertical_longitude_from_pole?.value ||
              attrs.central_meridian?.value || undefined,
            semiMajorAxis: attrs.semi_major_axis?.value || undefined,
            inverseFlattening: attrs.inverse_flattening?.value || undefined,
            spatialRef: attrs.spatial_ref?.value || undefined,  // Proj4 string
          };
          console.log('Extracted CRS:', metadata.crs);
          break;
        }
      }
    }
  } catch (error) {
    // CRS might not exist
  }

  // Extract lat/lon ranges (from attributes, not full arrays)
  try {
    const keys = file.keys();
    const latVarNames = ['latitude', 'lat'];
    for (const name of latVarNames) {
      if (keys.includes(name)) {
        const latVar = file.get(name) as any;
        if (latVar && latVar.attrs) {
          const attrs = latVar.attrs;
          const validMin = attrs.valid_min?.value || attrs.actual_min?.value;
          const validMax = attrs.valid_max?.value || attrs.actual_max?.value;

          if (validMin !== undefined && validMax !== undefined) {
            metadata.latitude = {
              min: Number(validMin),
              max: Number(validMax),
            };
            break;
          }
        }
      }
    }

    const lonVarNames = ['longitude', 'lon'];
    for (const name of lonVarNames) {
      if (keys.includes(name)) {
        const lonVar = file.get(name) as any;
        if (lonVar && lonVar.attrs) {
          const attrs = lonVar.attrs;
          const validMin = attrs.valid_min?.value || attrs.actual_min?.value;
          const validMax = attrs.valid_max?.value || attrs.actual_max?.value;

          if (validMin !== undefined && validMax !== undefined) {
            metadata.longitude = {
              min: Number(validMin),
              max: Number(validMax),
            };
            break;
          }
        }
      }
    }
  } catch (error) {
    // Lat/lon might not be readable
  }

  return metadata;
}

/**
 * Convert time values from "hours since [date]" to Date objects
 * @param timeValues - Array of numeric time values
 * @param timeUnit - Unit string like "hours since 2024-01-01T00:00:00"
 * @returns Array of Date objects
 */
export function parseTimeValues(
  timeValues: number[],
  timeUnit: string
): Date[] {
  // Parse the unit string to extract reference date and unit
  const match = timeUnit.match(/(hours|days|minutes|seconds)\s+since\s+(.+)/i);
  if (!match) {
    throw new Error(`Invalid time unit format: ${timeUnit}`);
  }

  const [, unit, referenceStr] = match;
  const referenceDate = new Date(referenceStr);

  if (isNaN(referenceDate.getTime())) {
    throw new Error(`Invalid reference date: ${referenceStr}`);
  }

  // Convert time values to milliseconds
  const unitMultipliers: Record<string, number> = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };

  const multiplier = unitMultipliers[unit.toLowerCase()];
  if (!multiplier) {
    throw new Error(`Unknown time unit: ${unit}`);
  }

  return timeValues.map(value => {
    const ms = referenceDate.getTime() + value * multiplier;
    return new Date(ms);
  });
}

/**
 * Extract coordinate arrays from NetCDF file
 * Primary focus: x/y projected coordinates to determine geographic extent
 * Secondary: lat/lon auxiliary coordinates (optional, for reference only)
 */
function extractCoordinates(
  file: H5File,
  dimensions: { time: number; height: number; width: number }
): {
  x: Float32Array;        // Required: projected x coordinates (meters)
  y: Float32Array;        // Required: projected y coordinates (meters)
  latitude?: Float32Array;  // Optional: auxiliary lat/lon for reference
  longitude?: Float32Array;
} | undefined {
  try {
    const keys = file.keys();
    const { height, width } = dimensions;

    let x: Float32Array | undefined;
    let y: Float32Array | undefined;
    let latitude: Float32Array | undefined;
    let longitude: Float32Array | undefined;

    // Extract x coordinate (1D projected) - REQUIRED for geospatial alignment
    if (keys.includes('x')) {
      try {
        const xVar = file.get('x') as any;
        if (xVar && xVar.value && xVar.shape && xVar.shape.length === 1) {
          const [w] = xVar.shape;
          if (w === width) {
            const xData = xVar.value;
            if (xData instanceof Float32Array) {
              x = xData;
            } else if (xData instanceof Float64Array) {
              x = new Float32Array(xData);
            } else {
              x = new Float32Array(xData);
            }
            console.log(`Extracted x coordinate array: ${x.length} values`);
          }
        }
      } catch (e) {
        console.warn('Failed to extract x coordinate:', e);
      }
    }

    // Extract y coordinate (1D projected)
    if (keys.includes('y')) {
      try {
        const yVar = file.get('y') as any;
        if (yVar && yVar.value && yVar.shape && yVar.shape.length === 1) {
          const [h] = yVar.shape;
          if (h === height) {
            const yData = yVar.value;
            if (yData instanceof Float32Array) {
              y = yData;
            } else if (yData instanceof Float64Array) {
              y = new Float32Array(yData);
            } else {
              y = new Float32Array(yData);
            }
            console.log(`Extracted y coordinate array: ${y.length} values`);
          }
        }
      } catch (e) {
        console.warn('Failed to extract y coordinate:', e);
      }
    }

    // Return coordinates only if we have BOTH x and y (required for proper positioning)
    if (x && y) {
      // Validate ordering per CF-1.7 convention
      const xIncreasing = x[x.length - 1] > x[0];
      const yDecreasing = y[y.length - 1] < y[0];

      if (!xIncreasing) {
        console.warn('X coordinate array is not strictly increasing! This violates CF conventions.');
      }
      if (!yDecreasing) {
        console.warn('Y coordinate array is not strictly decreasing! Per spec, y should go from top (max) to bottom (min).');
      }

      console.log('Projected coordinates extracted:', {
        xRange: `${x[0].toFixed(1)} to ${x[x.length - 1].toFixed(1)} m (${xIncreasing ? 'increasing ✓' : 'WRONG ✗'})`,
        yRange: `${y[0].toFixed(1)} to ${y[y.length - 1].toFixed(1)} m (${yDecreasing ? 'decreasing ✓' : 'WRONG ✗'})`,
        hasLatLon: !!(latitude && longitude),
      });
      return { x, y, latitude, longitude };
    }

    console.warn('NetCDF file does not contain required x/y projected coordinates');
    return undefined;
  } catch (error) {
    console.warn('Failed to extract coordinate arrays:', error);
    return undefined;
  }
}
