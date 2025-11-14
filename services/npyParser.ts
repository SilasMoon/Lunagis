// Fix: Removed invalid file header which was causing parsing errors.
// services/npyParser.ts

/**
 * A basic parser for the .npy file format.
 * See https://numpy.org/devdocs/reference/generated/numpy.lib.format.html
 */

interface NpyHeader {
  descr: string;
  fortran_order: boolean;
  shape: number[];
}

export interface NpyData {
  header: NpyHeader;
  data: Float32Array;
  shape: number[];
}

/**
 * Parses an ArrayBuffer containing data in the .npy format.
 * @param arrayBuffer The ArrayBuffer to parse.
 * @returns An object containing the parsed header, data as a Float32Array, and shape.
 */
export function parseNpy(arrayBuffer: ArrayBuffer): NpyData {
  const dataView = new DataView(arrayBuffer);

  // Check magic string '\x93NUMPY'
  const magic = String.fromCharCode(...new Uint8Array(arrayBuffer, 0, 6));
  if (magic !== '\x93NUMPY') {
    throw new Error('Not a valid .npy file: invalid magic string.');
  }

  const versionMajor = dataView.getUint8(6);
  
  let headerOffset: number;
  let headerLen: number;

  if (versionMajor === 1) {
    headerLen = dataView.getUint16(8, true); // little-endian
    headerOffset = 10;
  } else if (versionMajor === 2) {
    headerLen = dataView.getUint32(8, true); // little-endian
    headerOffset = 12;
  } else {
    throw new Error(`Unsupported .npy version: ${versionMajor}. Only v1 and v2 are supported.`);
  }

  const headerStr = new TextDecoder().decode(
    arrayBuffer.slice(headerOffset, headerOffset + headerLen)
  );
  
  // A more robust parser for the Python dict literal. It's not a full-blown
  // Python literal parser, but handles the common cases from numpy.
  const jsonStr = headerStr
    // Replace Python booleans with JSON booleans
    .replace(/False/g, 'false')
    .replace(/True/g, 'true')
    // Replace tuples with arrays
    .replace(/\(/g, '[')
    .replace(/\)/g, ']')
    // Replace single quotes with double quotes
    .replace(/'/g, '"')
    // Remove trailing commas from arrays and objects
    .replace(/,(\s*\])/g, '$1')
    .replace(/,(\s*})/g, '$1');

  const header: NpyHeader = JSON.parse(jsonStr);
  
  const dataOffset = headerOffset + headerLen;

  // Dtype parsing. Assumes little-endian '<'.
  const dtype = header.descr;
  let data: Float32Array;

  if (dtype.includes('f4') || dtype.includes('f32')) {
    data = new Float32Array(arrayBuffer, dataOffset);
  } else if (dtype.includes('f8') || dtype.includes('f64')) {
    console.warn("Downcasting float64 to float32. Precision may be lost.");
    const float64 = new Float64Array(arrayBuffer, dataOffset);
    data = new Float32Array(float64); // This creates a copy
  } else if (dtype.includes('b1') || dtype.includes('?')) {
    const booleanData = new Uint8Array(arrayBuffer, dataOffset);
    data = new Float32Array(booleanData.length);
    for(let i = 0; i < booleanData.length; i++) {
        data[i] = booleanData[i];
    }
  } else {
    throw new Error(`Unsupported dtype in .npy file: ${dtype}. Only float32, float64, and boolean are supported.`);
  }

  return { header, data, shape: header.shape };
}