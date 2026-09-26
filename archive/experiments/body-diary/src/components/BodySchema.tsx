import React from 'react';
import { BodyZone, FRONT_ZONES, BACK_ZONES, BodyView } from '../constants';

interface BodySchemaProps {
  view: BodyView;
  selectedZoneId?: string;
  onZoneSelect: (zone: BodyZone) => void;
  heatmapData?: Record<string, number>;
}

export const BodySchema: React.FC<BodySchemaProps> = ({ view, selectedZoneId, onZoneSelect, heatmapData }) => {
  const zones = view === 'front' ? FRONT_ZONES : BACK_ZONES;

  const getZoneColor = (zoneId: string) => {
    if (selectedZoneId === zoneId) return '#5A5A40';
    if (heatmapData && heatmapData[zoneId]) {
      const count = heatmapData[zoneId];
      // More sophisticated color scaling
      const intensity = Math.min(count / 5, 1);
      return `rgba(90, 90, 64, ${0.1 + intensity * 0.8})`;
    }
    return '#e5e5e0';
  };

  return (
    <div className="relative w-full max-w-[320px] mx-auto aspect-[1/1.8]">
      <svg
        viewBox="0 0 220 400"
        className="w-full h-full drop-shadow-xl"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Refined Body Outline Background */}
        <path
          d="M110,10 Q130,10 130,30 Q130,50 110,60 Q90,50 90,30 Q90,10 110,10 M110,60 L110,70 M80,70 L140,70 L145,150 L135,250 L110,250 L85,250 L75,150 L80,70"
          fill="none"
          stroke="#d1d1ca"
          strokeWidth="1"
          strokeDasharray="4 2"
          opacity="0.5"
        />

        {zones.map((zone) => (
          <path
            key={zone.id}
            d={zone.path}
            fill={getZoneColor(zone.id)}
            stroke="#ffffff"
            strokeWidth="1"
            className="cursor-pointer transition-all duration-300 hover:brightness-90"
            onClick={() => onZoneSelect(zone)}
            transform="scale(1.4) translate(-30, 10)"
          >
            <title>{zone.name}</title>
          </path>
        ))}
      </svg>
      
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
        <div className="text-[9px] uppercase tracking-[0.3em] text-stone-400 font-bold">
          {view === 'front' ? 'Anterior' : 'Posterior'}
        </div>
        <div className="w-8 h-0.5 bg-stone-200 rounded-full" />
      </div>
    </div>
  );
};
