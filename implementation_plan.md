# Implementation Plan - Web Worker for NetCDF

## Goal
Eliminate the ~900ms main thread freeze when loading NetCDF frames by moving `h5wasm` processing to a Web Worker.

## User Review Required
> [!WARNING]
> This is a significant architectural change. The `NetCDFLazyDataset` will no longer hold a direct reference to the `h5wasm` file object but will instead communicate asynchronously with a worker.

## Proposed Changes

### Services
#### [NEW] [netcdf.worker.ts](file:///wsl.localhost/Ubuntu/home/geoff/Projects/Lunagis/services/workers/netcdf.worker.ts)
- Initialize `h5wasm`.
- Handle messages: `OPEN`, `GET_SLICE`, `GET_PIXEL_TIME_SERIES`, `DISPOSE`.
- Manage the `h5wasm` virtual filesystem within the worker scope.

#### [MODIFY] [LazyDataset.ts](file:///wsl.localhost/Ubuntu/home/geoff/Projects/Lunagis/services/LazyDataset.ts)
- Refactor `NetCDFLazyDataset` to own a `Worker` instance.
- Implement `getSlice` by posting a message and awaiting the response.
- Use `transfer` for `ArrayBuffer` to ensure zero-copy overhead where possible.

#### [MODIFY] [netcdf4Parser.ts](file:///wsl.localhost/Ubuntu/home/geoff/Projects/Lunagis/services/netcdf4Parser.ts)
- Instead of opening the file locally, instantiate the worker and send the file buffer to it.
- Receive metadata from the worker to return to the app.

## Verification Plan
### Automated Tests
- None (UI interaction required).

### Manual Verification
- Load a large NetCDF file.
- Scrub the time slider.
- Verify that the UI (e.g., hover states, other controls) remains responsive *while* the new frame is loading.
- Verify that the "h5wasm_read" logs (now in the worker) still show the operation time, but the main thread does not freeze.
