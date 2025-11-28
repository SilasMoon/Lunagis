# **Interface Control Document: Lunar Illumination Map (NetCDF-4)**

Version: 1.0.0  
Format: NetCDF-4 (HDF5)  
Conventions: CF-1.7 (Climate and Forecast)

## **1\. File Overview**

The output file is a **NetCDF-4** container storing fractional solar illumination data projected onto a **Polar Stereographic** grid. It is optimized for time-series analysis and efficient spatial subsetting.

* **Compression:** Zlib (Deflate) Level 4\.  
* **Chunking:** \[1, height, width\] (Optimized for streaming single time frames).  
* **Endianness:** Little-Endian.

## **2\. Coordinate Reference System (CRS)**

All spatial data is defined in **Projected Meters**, not Geographic Degrees.

* **Projection:** Polar Stereographic (Variant B)  
* **Datum:** Moon 2000 Sphere  
  * **Radius (R):** 1737400.0 meters  
* **Origin:** South Pole (-90° Lat, 0° Lon)  
  * latitude\_of\_projection\_origin: \-90.0  
  * straight\_vertical\_longitude\_from\_pole: 0.0  
  * false\_easting: 0.0  
  * false\_northing: 0.0  
* **PROJ String:** \+proj=stere \+lat\_0=-90 \+lon\_0=0 \+k=1 \+x\_0=0 \+y\_0=0 \+R=1737400 \+units=m \+no\_defs

## **3\. Dimensions**

The file contains three primary dimensions.

| Dimension | Name | Description |
| :---- | :---- | :---- |
| **Time** | time | Unlimited dimension. Step size is typically 1 hour. |
| **Height** | y | Number of rows in the spatial grid. |
| **Width** | x | Number of columns in the spatial grid. |

## **4\. Variables**

### **4.1 Coordinate Variables**

#### **time (1D Array)**

* **Type:** float64 (double)  
* **Units:** hours since YYYY-MM-DDTHH:MM:SS (ISO 8601 base date)  
* **Standard Name:** time  
* **Calendar:** gregorian  
* **Axis:** T

#### **y (1D Array \- Northing)**

* **Type:** float64 (double)  
* **Units:** m (Meters)  
* **Standard Name:** projection\_y\_coordinate  
* **Axis:** Y  
* **Ordering:** **Strictly Decreasing** (North $\\to$ South / Top $\\to$ Bottom). This aligns with standard image coordinate systems (0,0 at Top-Left).

#### **x (1D Array \- Easting)**

* **Type:** float64 (double)  
* **Units:** m (Meters)  
* **Standard Name:** projection\_x\_coordinate  
* **Axis:** X  
* **Ordering:** Strictly Increasing (West $\\to$ East / Left $\\to$ Right).

### **4.2 Data Variables**

#### **illumination (3D Cube)**

The primary scientific payload.

* **Type:** float32 (single precision)  
* **Dimensions:** (time, y, x)  
* **Units:** 1 (Dimensionless Fraction)  
* **Valid Range:** 0.0 to 1.0  
* **Fill Value:** \-1.0  
* **Standard Name:** surface\_downwelling\_shortwave\_flux\_in\_air (CF Standard)  
* **Long Name:** Solar Illumination Fraction  
* **Grid Mapping:** polar\_stereographic (Points to the CRS container variable)

### **4.3 Metadata Variables**

#### **polar\_stereographic (Scalar Container)**

This variable contains no data but stores the CRS attributes required by CF-aware tools (GDAL, QGIS).

* **Type:** int32 (dummy value 0\)  
* **Attributes:**  
  * grid\_mapping\_name: polar\_stereographic  
  * semi\_major\_axis: 1737400.0  
  * inverse\_flattening: 0.0  
  * spatial\_ref: (WKT or PROJ string)

## **5\. Global Attributes**

The file header includes discovery metadata.

* title: "Lunar Surface Illumination Map"  
* institution: "Mission Planning"  
* source: "LRO LOLA DEM, SPICE Ephemeris"  
* Conventions: "CF-1.7"  
* geospatial\_lat\_min / max: Geographic bounds of the domain.  
* geospatial\_lon\_min / max: Geographic bounds of the domain.  
* time\_coverage\_start / end: ISO 8601 timestamps.

## **6\. Integration Guide for Developers**

### **Reading with Python (xarray)**

import xarray as xr

\# Open dataset with decoding enabled  
ds \= xr.open\_dataset("illumination\_map.nc", decode\_coords="all")

\# Data is automatically georeferenced via 'x' and 'y' coordinates  
print(ds.illumination)

### **Reading with JavaScript (h5wasm)**

Since the file uses Zlib compression, simple parsers will fail. Use the HDF5 WASM library.

// 1\. Variable access  
const illumVar \= f.get("illumination");  
const shape \= illumVar.shape; // \[time, y, x\]

// 2\. Read specific frame (e.g., time index 0\)  
// Note: slicing in h5wasm requires flattened logic or helper libraries  
const frameData \= illumVar.value.slice(0, shape\[1\] \* shape\[2\]); 

### **Deriving Geographic Coordinates (Lat/Lon)**

The file stores x (Easting) and y (Northing). To get Latitude/Longitude for a specific pixel (row, col):

1. Get $x \= X\[col\]$ and $y \= Y\[row\]$.  
2. Apply Inverse Polar Stereographic projection:  
   $$ \\rho \= \\sqrt{x^2 \+ y^2} $$  
   $$ c \= 2 \\cdot \\arctan\\left(\\frac{\\rho}{2R}\\right) $$  
   $$ \\phi\_{lat} \= \\arcsin(\\cos(c) \\cdot (-1)) \\quad (\\text{Since origin is \-90}) $$  
   $$ \\lambda\_{lon} \= \\arctan2(x, \-y) $$