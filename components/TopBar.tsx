import React from 'react';
import type { Tool } from '../types';

interface ToolBarProps {
  activeTool: Tool;
  onToolSelect: (tool: Tool) => void;
}

interface ToolButtonProps {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

const ToolButton: React.FC<ToolButtonProps> = ({ label, icon, isActive, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    className={`w-full flex flex-col items-center justify-center p-2 rounded-lg transition-colors duration-200 ${
      isActive
        ? 'bg-cyan-500/20 text-cyan-300'
        : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
    }`}
  >
    {icon}
    <span className="text-xs mt-1">{label}</span>
  </button>
);

const LayersIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2H5a2 2 0 00-2 2v2m14 0V9" />
    </svg>
);

const MeasurementIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 15.536c-1.171 1.952-3.07 1.952-4.242 0-1.172-1.953-1.172-5.119 0-7.072 1.171-1.952 3.07-1.952 4.242 0M8 12h8M12 8v8" />
    </svg>
);

const ConfigIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

export const ToolBar: React.FC<ToolBarProps> = ({ activeTool, onToolSelect }) => (
  <aside className="bg-gray-800/50 border-r border-gray-700 p-2 w-20 flex-shrink-0 flex flex-col items-center gap-4">
    <div className="my-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-cyan-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.527-1.912 6.01 6.01 0 012.186 5.332A6.002 6.002 0 0110 16a6.002 6.002 0 01-5.668-7.973z" clipRule="evenodd" />
        </svg>
    </div>
    <ToolButton label="Layers" icon={<LayersIcon />} isActive={activeTool === 'layers'} onClick={() => onToolSelect('layers')} />
    <ToolButton label="Measure" icon={<MeasurementIcon />} isActive={activeTool === 'measurement'} onClick={() => onToolSelect('measurement')} />
    <ToolButton label="Config" icon={<ConfigIcon />} isActive={activeTool === 'config'} onClick={() => onToolSelect('config')} />
  </aside>
);