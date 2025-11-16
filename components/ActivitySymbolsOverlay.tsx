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
              let directionVector: [number, number] | null = null;

              // First waypoint: use perpendicular to outgoing segment
              if (waypointIndex === 0) {
                const nextWaypoint = artifact.waypoints[1];
                const nextProjPos = proj.forward(nextWaypoint.geoPosition) as [number, number];
                const [nextCanvasX, nextCanvasY] = projToCanvas(nextProjPos);

                const dx = nextCanvasX - canvasX;
                const dy = nextCanvasY - canvasY;
                const magnitude = Math.sqrt(dx * dx + dy * dy);
                if (magnitude > 0) {
                  const outgoingDir = [dx / magnitude, dy / magnitude];
                  // Perpendicular: rotate 90° counterclockwise
                  directionVector = [-outgoingDir[1], outgoingDir[0]];
                }
              }
              // Last waypoint: use perpendicular to incoming segment
              else if (waypointIndex === artifact.waypoints.length - 1) {
                const prevWaypoint = artifact.waypoints[waypointIndex - 1];
                const prevProjPos = proj.forward(prevWaypoint.geoPosition) as [number, number];
                const [prevCanvasX, prevCanvasY] = projToCanvas(prevProjPos);

                const dx = canvasX - prevCanvasX;
                const dy = canvasY - prevCanvasY;
                const magnitude = Math.sqrt(dx * dx + dy * dy);
                if (magnitude > 0) {
                  const incomingDir = [dx / magnitude, dy / magnitude];
                  // Perpendicular: rotate 90° counterclockwise
                  directionVector = [-incomingDir[1], incomingDir[0]];
                }
              }
              // Middle waypoints: use outer angle bisector
              else {
                const prevWaypoint = artifact.waypoints[waypointIndex - 1];
                const nextWaypoint = artifact.waypoints[waypointIndex + 1];

                const prevProjPos = proj.forward(prevWaypoint.geoPosition) as [number, number];
                const nextProjPos = proj.forward(nextWaypoint.geoPosition) as [number, number];

                const [prevCanvasX, prevCanvasY] = projToCanvas(prevProjPos);
                const [nextCanvasX, nextCanvasY] = projToCanvas(nextProjPos);

                // Incoming direction (from previous to current)
                const dx1 = canvasX - prevCanvasX;
                const dy1 = canvasY - prevCanvasY;
                const mag1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                // Outgoing direction (from current to next)
                const dx2 = nextCanvasX - canvasX;
                const dy2 = nextCanvasY - canvasY;
                const mag2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                if (mag1 > 0 && mag2 > 0) {
                  const incomingDir: [number, number] = [dx1 / mag1, dy1 / mag1];
                  const outgoingDir: [number, number] = [dx2 / mag2, dy2 / mag2];

                  // The sum of two unit vectors bisects the INNER angle between them
                  const innerBisectorX = incomingDir[0] + outgoingDir[0];
                  const innerBisectorY = incomingDir[1] + outgoingDir[1];

                  // The OUTER angle is the larger of the two angles formed by the segments
                  // The outer angle bisector points in the opposite direction of the inner bisector
                  // This is because they are 180° apart
                  const outerBisectorX = -innerBisectorX;
                  const outerBisectorY = -innerBisectorY;

                  const bisectorMag = Math.sqrt(outerBisectorX * outerBisectorX + outerBisectorY * outerBisectorY);

                  if (bisectorMag > 0) {
                    const normalizedX = outerBisectorX / bisectorMag;
                    const normalizedY = outerBisectorY / bisectorMag;
                    // Rotate 90° counterclockwise for consistency with first/last waypoint logic
                    directionVector = [-normalizedY, normalizedX];
                  }
                }
              }

              if (directionVector) {
                offsetX = directionVector[0] * offsetDistance;
                offsetY = directionVector[1] * offsetDistance;
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
