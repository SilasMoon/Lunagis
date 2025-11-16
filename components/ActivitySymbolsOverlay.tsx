import React from 'react';
import { PathArtifact, Waypoint } from '../types';
import {
  Drill,
  Pause,
  Target,
  Flag,
  Satellite,
  Crosshair,
  Moon,
  Sunset,
  MessageCircle,
  Binoculars,
  LucideIcon,
} from 'lucide-react';

const SYMBOL_COMPONENTS: Record<string, LucideIcon> = {
  drill: Drill,
  pause: Pause,
  target: Target,
  flag: Flag,
  satellite: Satellite,
  crosshair: Crosshair,
  moon: Moon,
  sunset: Sunset,
  message: MessageCircle,
  binoculars: Binoculars,
};

interface ActivitySymbolsOverlayProps {
  artifacts: PathArtifact[];
  proj: any;
  viewState: { center: [number, number]; scale: number };
  containerWidth: number;
  containerHeight: number;
  showActivitySymbols: boolean;
}

export const ActivitySymbolsOverlay: React.FC<ActivitySymbolsOverlayProps> = ({
  artifacts,
  proj,
  viewState,
  containerWidth,
  containerHeight,
  showActivitySymbols,
}) => {
  if (!showActivitySymbols || !proj || !viewState) return null;

  const projToCanvas = (projCoords: [number, number]): [number, number] => {
    const dpr = window.devicePixelRatio || 1;
    const canvasX = (projCoords[0] - viewState.center[0]) * viewState.scale * dpr + (containerWidth * dpr) / 2;
    const canvasY = (viewState.center[1] - projCoords[1]) * viewState.scale * dpr + (containerHeight * dpr) / 2;
    return [canvasX / dpr, canvasY / dpr];
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {artifacts.map((artifact) => {
        if (!artifact.visible || artifact.type !== 'path') return null;

        return artifact.waypoints.map((waypoint, waypointIndex) => {
          if (!waypoint.activitySymbol) return null;

          try {
            const projPos = proj.forward(waypoint.geoPosition) as [number, number];
            const [canvasX, canvasY] = projToCanvas(projPos);

            // Calculate perpendicular offset based on outgoing segment IN CANVAS SPACE
            let offsetX = 0;
            let offsetY = -40; // Default: upward

            const offsetDistance = waypoint.activityOffset !== undefined ? waypoint.activityOffset : 40;

            if (artifact.waypoints.length > 1) {
              let segmentDirCanvas: [number, number] | null = null;

              // Try to use outgoing segment (to next waypoint)
              if (waypointIndex < artifact.waypoints.length - 1) {
                const nextWaypoint = artifact.waypoints[waypointIndex + 1];
                const nextProjPos = proj.forward(nextWaypoint.geoPosition) as [number, number];
                const [nextCanvasX, nextCanvasY] = projToCanvas(nextProjPos);

                // Calculate segment direction in canvas space
                const dx = nextCanvasX - canvasX;
                const dy = nextCanvasY - canvasY;
                const magnitude = Math.sqrt(dx * dx + dy * dy);
                if (magnitude > 0) {
                  segmentDirCanvas = [dx / magnitude, dy / magnitude];
                }
              }
              // Fallback: use incoming segment (from previous waypoint)
              else if (waypointIndex > 0) {
                const prevWaypoint = artifact.waypoints[waypointIndex - 1];
                const prevProjPos = proj.forward(prevWaypoint.geoPosition) as [number, number];
                const [prevCanvasX, prevCanvasY] = projToCanvas(prevProjPos);

                // Calculate segment direction in canvas space
                const dx = canvasX - prevCanvasX;
                const dy = canvasY - prevCanvasY;
                const magnitude = Math.sqrt(dx * dx + dy * dy);
                if (magnitude > 0) {
                  segmentDirCanvas = [dx / magnitude, dy / magnitude];
                }
              }

              // Calculate perpendicular direction (rotate 90° counterclockwise in canvas space)
              if (segmentDirCanvas) {
                const [dirX, dirY] = segmentDirCanvas;
                // Perpendicular: rotate 90° counterclockwise
                const perpX = -dirY;
                const perpY = dirX;

                offsetX = perpX * offsetDistance;
                offsetY = perpY * offsetDistance;
              }
            }

            const size = waypoint.activitySymbolSize || 24;
            const color = waypoint.activitySymbolColor || artifact.color;

            const IconComponent = SYMBOL_COMPONENTS[waypoint.activitySymbol];
            if (!IconComponent) return null;

            return (
              <div
                key={`${artifact.id}-${waypoint.id}-activity`}
                className="absolute"
                style={{
                  left: `${canvasX + offsetX}px`,
                  top: `${canvasY + offsetY}px`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="flex flex-col items-center gap-1">
                  <IconComponent
                    size={size}
                    color={color}
                    strokeWidth={2}
                  />
                  {waypoint.activityLabel && (
                    <span
                      className="text-xs font-semibold whitespace-nowrap"
                      style={{
                        color,
                        textShadow: '0 0 3px rgba(0,0,0,0.8), 0 0 3px rgba(0,0,0,0.8)',
                      }}
                    >
                      {waypoint.activityLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          } catch (e) {
            return null;
          }
        });
      })}
    </div>
  );
};
