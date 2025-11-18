/**
 * Shared utilities and components for ControlPanel components
 */
import React, { useState } from 'react';

// Helper function to format duration in hours and days
export const formatDuration = (hours: number): string => {
  if (hours === 0) return "0 hrs";
  const days = (hours / 24).toFixed(1);
  return `${hours} hrs (${days} days)`;
};

// Helper function to format distance with appropriate units
export const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${meters.toFixed(0)} m`;
  } else if (meters < 10000) {
    return `${(meters / 1000).toFixed(2)} km`;
  } else {
    return `${(meters / 1000).toFixed(1)} km`;
  }
};

// Helper function to calculate Euclidean distance in projected space
export const calculateProjectedDistance = (proj: any, coord1: [number, number], coord2: [number, number]): number => {
  if (!proj) return 0;

  try {
    const proj1 = proj.forward(coord1);
    const proj2 = proj.forward(coord2);

    const dx = proj2[0] - proj1[0];
    const dy = proj2[1] - proj1[1];

    return Math.sqrt(dx * dx + dy * dy);
  } catch (e) {
    return 0;
  }
};

// Helper function to calculate total distance of a path using projected coordinates
export const calculatePathDistance = (proj: any, waypoints: Array<{ geoPosition: [number, number] }>): number => {
  if (!proj || waypoints.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalDistance += calculateProjectedDistance(proj, waypoints[i].geoPosition, waypoints[i + 1].geoPosition);
  }

  return totalDistance;
};

// Collapsible Section component
export const Section: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-300 mb-2 bg-gray-900/50 p-2 rounded-md cursor-pointer flex justify-between items-center" onClick={() => setIsOpen(!isOpen)}>
        <span>{title}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
      </h3>
      {isOpen && <div className="p-3 rounded-md space-y-4 animate-fade-in bg-gray-800/30">{children}</div>}
    </div>
  );
};
