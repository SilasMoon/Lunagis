// Fix: Removed invalid file header which was causing parsing errors.
// Fix: Define VrtData interface here to break the circular dependency with vrtParser.ts.
export interface VrtData {
  geoTransform: number[];
  srs: string;
  width: number;
  height: number;
}

export const COLOR_MAPS = ['Viridis', 'Plasma', 'Inferno', 'Magma', 'Cividis', 'Turbo', 'Grayscale', 'Custom'] as const;
export type ColorMapName = typeof COLOR_MAPS[number];

export type DataPoint = number;
export type DataRow = DataPoint[];
export type DataSlice = DataRow[]; // A 2D slice (Height x Width)
export type DataSet = DataSlice[]; // An array of 2D slices over time (Time x Height x Width)

export interface DataWithRange {
  dataset: DataSet;
  min: number;
  max: number;
}

export type GeoCoordinates = { lat: number; lon: number } | null;
export type PixelCoords = { x: number; y: number } | null;

export interface ViewState {
    center: [number, number]; // Projected coordinates [x, y]
    scale: number; // Pixels per projected unit
}

export type TimeRange = { start: number; end: number };
export type TimeDomain = [Date, Date];
export type Tool = 'layers' | 'measurement' | 'config' | 'artifacts';

export type ColorStop = { value: number; color: string; };

export interface DaylightFractionHoverData {
  fraction: number;
  dayHours: number;
  nightHours: number;
  longestDayPeriod: number;
  shortestDayPeriod: number;
  dayPeriods: number;
  longestNightPeriod: number;
  shortestNightPeriod: number;
  nightPeriods: number;
}


// --- Layer Architecture Types ---

export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
}

export interface BaseMapLayer extends LayerBase {
  type: 'basemap';
  image: HTMLImageElement;
  vrt: VrtData;
  pngFileName: string;
  vrtFileName: string;
}

export interface DataLayer extends LayerBase {
  type: 'data';
  dataset: DataSet;
  fileName: string; // Original file name for session saving
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  dimensions: { time: number; height: number; width: number };
}

export type AnalysisType = 'nightfall' | 'daylight_fraction';

export interface AnalysisLayer extends LayerBase {
  type: 'analysis';
  analysisType: AnalysisType;
  dataset: DataSet;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  dimensions: { time: number; height: number; width: number };
  sourceLayerId: string;
  params: {
    clipValue?: number;
  };
}

export type Layer = BaseMapLayer | DataLayer | AnalysisLayer;

// --- Artifact Types ---

export interface Waypoint {
  id: string;
  geoPosition: [number, number]; // [lon, lat]
  label: string;
}

export interface ArtifactBase {
  id: string;
  name: string;
  type: 'circle' | 'rectangle' | 'path';
  visible: boolean;
  color: string;
  thickness: number;
}

export interface CircleArtifact extends ArtifactBase {
  type: 'circle';
  center: [number, number]; // Projected coordinates [x, y]
  radius: number; // in meters
}

export interface RectangleArtifact extends ArtifactBase {
  type: 'rectangle';
  center: [number, number]; // Projected coordinates [x, y]
  width: number; // in meters
  height: number; // in meters
  rotation: number; // in degrees
}

export interface PathArtifact extends ArtifactBase {
  type: 'path';
  waypoints: Waypoint[];
}

export type Artifact = CircleArtifact | RectangleArtifact | PathArtifact;

// Serializable artifacts are the same as the main ones since coords are arrays
export type SerializableArtifact = Artifact;


// --- Serializable Types for Session Import/Export ---

interface SerializableLayerBase {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
}

export interface SerializableBaseMapLayer extends SerializableLayerBase {
  type: 'basemap';
  vrt: VrtData;
  pngFileName: string;
  vrtFileName: string;
}

export interface SerializableDataLayer extends SerializableLayerBase {
  type: 'data';
  fileName: string;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  dimensions: { time: number; height: number; width: number };
}

export interface SerializableAnalysisLayer extends SerializableLayerBase {
  type: 'analysis';
  analysisType: AnalysisType;
  range: { min: number; max: number };
  colormap: ColorMapName;
  colormapInverted?: boolean;
  customColormap?: ColorStop[];
  dimensions: { time: number; height: number; width: number };
  sourceLayerId: string;
  params: {
    clipValue?: number;
  };
}

export type SerializableLayer = SerializableBaseMapLayer | SerializableDataLayer | SerializableAnalysisLayer;

export interface AppStateConfig {
  version: number;
  layers: SerializableLayer[];
  activeLayerId: string | null;
  timeRange: TimeRange | null;
  timeZoomDomain: [string, string] | null;
  viewState: ViewState | null;
  showGraticule: boolean;
  graticuleDensity: number;
  showGrid: boolean;
  gridSpacing: number;
  gridColor: string;
  selectedCells: {x: number, y: number}[];
  selectionColor: string;
  activeTool: Tool;
  artifacts: SerializableArtifact[];
  artifactDisplayOptions: {
    waypointDotSize: number;
    showSegmentLengths: boolean;
    labelFontSize: number;
  };
}