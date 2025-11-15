// Fix: Removed invalid file header which was causing parsing errors.
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
    aria-label={label}
    aria-current={isActive ? 'page' : undefined}
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

const ArtifactsIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" />
    </svg>
);

export const ToolBar: React.FC<ToolBarProps> = ({ activeTool, onToolSelect }) => (
  <aside className="bg-gray-800/50 border-r border-gray-700 p-2 w-20 flex-shrink-0 flex flex-col items-center gap-4" role="navigation" aria-label="Main navigation">
    <div className="my-2" aria-label="Lunagis logo">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-cyan-400" viewBox="0 0 1024 1024" fill="currentColor">
            <g transform="translate(0,1024) scale(0.1,-0.1)">
                <path d="M4930 7659 c-380 -39 -709 -167 -1013 -392 -106 -78 -292 -260 -371 -362 -183 -236 -312 -514 -380 -818 -109 -483 -5 -1054 268 -1477 307 -476 788 -795 1346 -891 118 -20 501 -38 535 -25 12 4 -23 26 -122 76 -167 84 -283 169 -423 310 -310 310 -525 747 -594 1210 -39 257 -45 452 -21 650 65 535 266 977 595 1311 158 160 336 288 517 371 62 28 66 31 43 38 -34 11 -274 9 -380 -1z"/>
                <path d="M5535 7580 c-171 -52 -273 -97 -381 -166 -30 -19 -58 -42 -61 -51 -10 -26 93 -215 153 -282 46 -51 65 -64 111 -77 65 -19 104 -13 150 22 83 63 182 287 222 500 9 45 8 46 -23 59 -59 24 -81 23 -171 -5z"/>
                <path d="M5780 7534 c-6 -14 -10 -35 -10 -47 0 -47 -64 -247 -106 -331 -56 -111 -93 -159 -151 -193 -93 -54 -193 -29 -302 76 -48 46 -69 78 -115 174 l-56 117 -48 -35 c-26 -19 -56 -43 -66 -54 -17 -18 -16 -21 5 -63 88 -174 204 -303 334 -371 53 -27 70 -31 145 -31 73 -1 94 3 145 27 33 15 77 45 98 65 96 92 196 276 244 447 13 50 31 107 39 128 19 50 18 53 -13 65 -16 6 -52 20 -81 31 l-52 21 -10 -26z"/>
                <path d="M5997 7463 c-3 -5 -17 -55 -33 -113 -72 -271 -189 -468 -340 -572 -144 -98 -336 -77 -501 55 -84 67 -141 139 -211 264 -25 46 -49 83 -53 83 -13 0 -99 -104 -99 -120 0 -25 112 -190 175 -258 197 -212 433 -294 641 -220 163 58 275 162 394 369 62 109 185 411 176 434 -3 10 -128 85 -141 85 -2 0 -6 -3 -8 -7z"/>
                <path d="M6179 7318 c-50 -181 -171 -436 -259 -543 -113 -138 -211 -212 -333 -250 -92 -29 -198 -33 -294 -10 -75 18 -218 88 -290 142 -71 53 -162 159 -229 265 -31 48 -57 88 -59 88 -2 0 -24 -31 -50 -69 -31 -45 -44 -74 -39 -83 28 -47 162 -204 222 -260 257 -242 554 -315 829 -204 231 94 395 280 571 646 46 96 88 185 93 197 8 22 6 23 -123 107 l-27 17 -12 -43z"/>
                <path d="M6476 6948 c-221 -452 -457 -702 -762 -806 -82 -28 -213 -43 -348 -41 -98 3 -116 0 -154 -20 -46 -24 -77 -65 -86 -116 -4 -21 4 -73 25 -151 37 -142 42 -248 15 -339 -59 -199 -188 -320 -456 -429 -73 -30 -242 -76 -277 -76 -13 0 -26 -6 -29 -13 -8 -23 44 -163 110 -295 93 -185 187 -320 321 -460 127 -133 224 -211 337 -272 l74 -40 13 53 c19 78 49 153 98 242 173 315 482 483 775 421 124 -27 321 -137 406 -227 20 -21 42 -39 47 -39 6 0 29 19 51 43 225 237 397 605 456 977 8 55 13 175 13 340 0 241 -2 262 -28 385 -77 359 -247 687 -483 937 -25 27 -48 48 -52 48 -4 0 -34 -55 -66 -122z"/>
            </g>
        </svg>
    </div>
    <ToolButton label="Layers" icon={<LayersIcon />} isActive={activeTool === 'layers'} onClick={() => onToolSelect('layers')} />
    <ToolButton label="Artifacts" icon={<ArtifactsIcon />} isActive={activeTool === 'artifacts'} onClick={() => onToolSelect('artifacts')} />
    <ToolButton label="Measure" icon={<MeasurementIcon />} isActive={activeTool === 'measurement'} onClick={() => onToolSelect('measurement')} />
    <ToolButton label="Config" icon={<ConfigIcon />} isActive={activeTool === 'config'} onClick={() => onToolSelect('config')} />
  </aside>
);