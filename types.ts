// Fix: Define VrtData here to break a circular dependency.
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
export type Tool = 'layers' | 'measurement' | 'config';

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


// --- New Layer Architecture Types ---

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
}

export interface DataLayer extends LayerBase {
  type: 'data';
  dataset: DataSet;
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