import React from 'react';
import { SENSATIONS, SensationType } from '../constants';
import * as Icons from 'lucide-react';
import { motion } from 'motion/react';

interface SensationPickerProps {
  selectedId?: string;
  onSelect: (sensation: SensationType) => void;
}

export const SensationPicker: React.FC<SensationPickerProps> = ({ selectedId, onSelect }) => {
  return (
    <div className="grid grid-cols-4 gap-3">
      {SENSATIONS.map((sensation) => {
        const IconComponent = (Icons as any)[sensation.icon];
        const isSelected = selectedId === sensation.id;

        return (
          <motion.button
            key={sensation.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelect(sensation)}
            className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${
              isSelected 
                ? 'bg-[#5A5A40] text-white shadow-lg' 
                : 'bg-white text-stone-600 hover:bg-stone-50'
            }`}
          >
            <div className={`p-2 rounded-full ${isSelected ? 'bg-white/20' : sensation.color.split(' ')[0]}`}>
              <IconComponent size={20} className={isSelected ? 'text-white' : sensation.color.split(' ')[1]} />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-center leading-tight">
              {sensation.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
};
