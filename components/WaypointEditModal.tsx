import React, { useState } from 'react';
import { Waypoint } from '../types';
import {
  Drill,
  CirclePause,
  Target,
  Flag,
  Satellite,
  SatelliteDish,
  Sunset,
  BatteryMedium,
  TrafficCone,
  ListChecks,
  Camera,
  SquareActivity,
  Waypoints,
  LucideIcon,
} from 'lucide-react';

interface WaypointEditModalProps {
  isOpen: boolean;
  waypoint: Waypoint;
  defaultColor: string; // Default color from the path artifact
  onClose: () => void;
  onSave: (updates: Partial<Waypoint>) => void;
}

// Available activity symbols with their icons
const AVAILABLE_SYMBOLS: { name: string | null; icon: LucideIcon | null; label: string }[] = [
  { name: null, icon: null, label: 'None' },
  { name: 'sunset', icon: Sunset, label: 'hibernation' },
  { name: 'battery-medium', icon: BatteryMedium, label: 'charging' },
  { name: 'circle-pause', icon: CirclePause, label: 'pause' },
  { name: 'flag', icon: Flag, label: 'objective' },
  { name: 'target', icon: Target, label: 'target' },
  { name: 'traffic-cone', icon: TrafficCone, label: 'commissioning' },
  { name: 'list-checks', icon: ListChecks, label: 'checkout' },
  { name: 'camera', icon: Camera, label: 'imaging' },
  { name: 'satellite-dish', icon: SatelliteDish, label: 'comms' },
  { name: 'satellite', icon: Satellite, label: 'LPF comms' },
  { name: 'square-activity', icon: SquareActivity, label: 'science station' },
  { name: 'drill', icon: Drill, label: 'drill' },
  { name: 'waypoints', icon: Waypoints, label: 'wisdom scan' },
];

export const WaypointEditModal: React.FC<WaypointEditModalProps> = ({
  isOpen,
  waypoint,
  defaultColor,
  onClose,
  onSave,
}) => {
  const [activitySymbol, setActivitySymbol] = useState<string | null>(waypoint.activitySymbol || null);
  const [activityLabel, setActivityLabel] = useState(waypoint.activityLabel || '');
  const [activitySymbolSize, setActivitySymbolSize] = useState(waypoint.activitySymbolSize || 24);
  const [activitySymbolColor, setActivitySymbolColor] = useState(waypoint.activitySymbolColor || defaultColor);
  const [activityOffset, setActivityOffset] = useState(waypoint.activityOffset !== undefined ? waypoint.activityOffset : 35);
  const [description, setDescription] = useState(waypoint.description || '');

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      activitySymbol: activitySymbol || undefined,
      activityLabel: activityLabel || undefined,
      activitySymbolSize: activitySymbol ? activitySymbolSize : undefined,
      activitySymbolColor: activitySymbol ? activitySymbolColor : undefined,
      activityOffset: activitySymbol ? activityOffset : undefined,
      description,
    });
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Edit Waypoint</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            title="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Coordinates Display */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Coordinates
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Longitude</label>
                <input
                  type="text"
                  value={waypoint.geoPosition[0].toFixed(6)}
                  readOnly
                  className="w-full bg-gray-700/50 text-gray-300 rounded px-3 py-2 font-mono text-sm cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Latitude</label>
                <input
                  type="text"
                  value={waypoint.geoPosition[1].toFixed(6)}
                  readOnly
                  className="w-full bg-gray-700/50 text-gray-300 rounded px-3 py-2 font-mono text-sm cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Activity Symbol Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Activity Symbol
            </label>
            <div className="relative">
              <select
                value={activitySymbol || ''}
                onChange={(e) => setActivitySymbol(e.target.value || null)}
                className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500 appearance-none pr-10"
              >
                {AVAILABLE_SYMBOLS.map((symbol) => (
                  <option key={symbol.name || 'none'} value={symbol.name || ''}>
                    {symbol.label}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {activitySymbol && (() => {
              const selectedSymbol = AVAILABLE_SYMBOLS.find(s => s.name === activitySymbol);
              const Icon = selectedSymbol?.icon;
              return Icon ? (
                <div className="mt-3 p-3 bg-gray-700/50 rounded-lg border border-gray-600 flex items-center gap-3">
                  <Icon
                    className="w-8 h-8"
                    style={{ color: activitySymbolColor }}
                    strokeWidth={2}
                  />
                  <span className="text-sm text-gray-300">Preview: {selectedSymbol?.label}</span>
                </div>
              ) : null;
            })()}
          </div>

          {/* Activity Label */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Activity Label
            </label>
            <input
              type="text"
              value={activityLabel}
              onChange={(e) => setActivityLabel(e.target.value)}
              className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="e.g., Drilling, Rest Stop, Target Point..."
              disabled={!activitySymbol}
            />
            {!activitySymbol && (
              <p className="text-xs text-gray-500 mt-1">
                Select an activity symbol to enable this field
              </p>
            )}
          </div>

          {/* Activity Symbol Configuration */}
          {activitySymbol && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Symbol Size */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Symbol Size
                  </label>
                  <input
                    type="range"
                    min="16"
                    max="48"
                    step="2"
                    value={activitySymbolSize}
                    onChange={(e) => setActivitySymbolSize(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Small</span>
                    <span className="font-mono">{activitySymbolSize}px</span>
                    <span>Large</span>
                  </div>
                </div>

                {/* Perpendicular Offset */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Offset Distance
                  </label>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    step="5"
                    value={activityOffset}
                    onChange={(e) => setActivityOffset(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Near</span>
                    <span className="font-mono">{activityOffset}px</span>
                    <span>Far</span>
                  </div>
                </div>
              </div>

              {/* Symbol Color */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Symbol Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={activitySymbolColor}
                    onChange={(e) => setActivitySymbolColor(e.target.value)}
                    className="w-12 h-10 rounded cursor-pointer bg-gray-700 border border-gray-600"
                  />
                  <input
                    type="text"
                    value={activitySymbolColor}
                    onChange={(e) => setActivitySymbolColor(e.target.value)}
                    className="flex-1 bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500 font-mono text-sm"
                    placeholder={defaultColor}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500 resize-none"
              rows={4}
              placeholder="Add a description for this waypoint..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
