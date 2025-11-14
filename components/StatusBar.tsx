import React from 'react';
import { useAppContext } from '../context/AppContext';
import { indexToDateString } from '../utils/time';

const InfoItem: React.FC<{ label: string; value: string | number; }> = ({ label, value }) => (
    <div className="flex items-center gap-2">
        <span className="text-gray-400 text-xs">{label}:</span>
        <span className="font-mono text-cyan-300 text-xs">{value}</span>
    </div>
);

export const StatusBar: React.FC = () => {
    const { hoveredCoords, timeRange, currentDateIndex, primaryDataLayer } = useAppContext();

    if (!primaryDataLayer) {
        return null;
    }

    return (
        <section className="bg-gray-800/70 border-y border-gray-700 w-full flex-shrink-0 z-40 px-4 py-1 flex items-center justify-between flex-wrap gap-x-6 gap-y-1">
            <div className="flex items-center gap-x-4">
                <InfoItem label="Lat" value={hoveredCoords ? hoveredCoords.lat.toFixed(4) : '---'} />
                <InfoItem label="Lon" value={hoveredCoords ? hoveredCoords.lon.toFixed(4) : '---'} />
            </div>

            {timeRange ? (
                <div className="flex items-center gap-x-4">
                    <InfoItem label="Current" value={currentDateIndex !== null ? indexToDateString(currentDateIndex) : '---'} />
                    <InfoItem label="Start" value={indexToDateString(timeRange.start)} />
                    <InfoItem label="End" value={indexToDateString(timeRange.end)} />
                    <InfoItem label="Duration" value={`${timeRange.end - timeRange.start + 1} hrs`} />
                </div>
            ) : (
                 <div className="flex items-center gap-x-4">
                    <InfoItem label="Current" value={'---'} />
                    <InfoItem label="Start" value={'---'} />
                    <InfoItem label="End" value={'---'} />
                    <InfoItem label="Duration" value={'---'} />
                </div>
            )}
        </section>
    );
};