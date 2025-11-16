import React, { useState } from 'react';
import { Waypoint } from '../types';
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
  XCircle,
} from 'lucide-react';

interface WaypointEditModalProps {
  isOpen: boolean;
  waypoint: Waypoint;
  onClose: () => void;
  onSave: (updates: Partial<Waypoint>) => void;
}

// Available activity symbols with their icons
const AVAILABLE_SYMBOLS: { name: string | null; icon: LucideIcon | null; label: string }[] = [
  { name: null, icon: XCircle, label: 'None' },
  { name: 'drill', icon: Drill, label: 'Drill' },
  { name: 'pause', icon: Pause, label: 'Pause' },
  { name: 'target', icon: Target, label: 'Target' },
  { name: 'flag', icon: Flag, label: 'Flag' },
  { name: 'satellite', icon: Satellite, label: 'Satellite' },
  { name: 'crosshair', icon: Crosshair, label: 'Crosshair' },
  { name: 'moon', icon: Moon, label: 'Moon' },
  { name: 'sunset', icon: Sunset, label: 'Sunset' },
  { name: 'message', icon: MessageCircle, label: 'Message' },
  { name: 'binoculars', icon: Binoculars, label: 'Binoculars' },
];

export const WaypointEditModal: React.FC<WaypointEditModalProps> = ({
  isOpen,
  waypoint,
  onClose,
  onSave,
}) => {
  const [activitySymbol, setActivitySymbol] = useState<string | null>(waypoint.activitySymbol || null);
  const [activityLabel, setActivityLabel] = useState(waypoint.activityLabel || '');
  const [activitySymbolSize, setActivitySymbolSize] = useState(waypoint.activitySymbolSize || 24);
  const [activitySymbolColor, setActivitySymbolColor] = useState(waypoint.activitySymbolColor || '#ef4444');
  const [description, setDescription] = useState(waypoint.description || '');

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      activitySymbol: activitySymbol || undefined,
      activityLabel: activityLabel || undefined,
      activitySymbolSize: activitySymbol ? activitySymbolSize : undefined,
      activitySymbolColor: activitySymbol ? activitySymbolColor : undefined,
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
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Activity Symbol
            </label>
            <div className="grid grid-cols-6 gap-2">
              {AVAILABLE_SYMBOLS.map((symbol) => {
                const Icon = symbol.icon;
                const isSelected = activitySymbol === symbol.name;
                return (
                  <button
                    key={symbol.name || 'none'}
                    onClick={() => setActivitySymbol(symbol.name)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                    }`}
                    title={symbol.label}
                  >
                    {Icon && (
                      <Icon
                        className="w-6 h-6"
                        style={{ color: isSelected ? activitySymbolColor : '#9ca3af' }}
                        strokeWidth={2}
                      />
                    )}
                    <span className="text-xs text-gray-400">{symbol.label}</span>
                  </button>
                );
              })}
            </div>
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

          {/* Activity Symbol Size and Color */}
          {activitySymbol && (
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
                    placeholder="#ef4444"
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
