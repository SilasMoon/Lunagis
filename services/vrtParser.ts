// Fix: Removed invalid file header which was causing parsing errors.
import type { VrtData } from '../types';

/**
 * Parses an XML string from a .vrt file to extract georeferencing information.
 * @param xmlString The content of the .vrt file.
 * @returns A VrtData object or null if parsing fails.
 */
export function parseVrt(xmlString: string): VrtData | null {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "application/xml");

    const errorNode = xmlDoc.querySelector("parsererror");
    if (errorNode) {
      throw new Error("XML parsing error: " + errorNode.textContent);
    }
    
    const vrtDataset = xmlDoc.querySelector('VRTDataset');
    if (!vrtDataset) {
        throw new Error("<VRTDataset> tag not found.");
    }

    const width = parseInt(vrtDataset.getAttribute('rasterXSize') || '0', 10);
    const height = parseInt(vrtDataset.getAttribute('rasterYSize') || '0', 10);

    const geoTransformStr = xmlDoc.querySelector('GeoTransform')?.textContent;
    if (!geoTransformStr) {
      throw new Error("<GeoTransform> tag not found.");
    }
    const geoTransform = geoTransformStr.split(',').map(Number);
    if (geoTransform.length !== 6 || geoTransform.some(isNaN)) {
        throw new Error("Invalid GeoTransform content.");
    }

    const srsStr = xmlDoc.querySelector('SRS')?.textContent;
    if (!srsStr) {
      throw new Error("<SRS> tag not found.");
    }

    return {
      geoTransform,
      srs: srsStr,
      width,
      height,
    };
  } catch (e) {
    console.error("Failed to parse VRT file:", e);
    // Error is handled by caller
    return null;
  }
}