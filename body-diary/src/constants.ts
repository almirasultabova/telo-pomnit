export type BodyView = 'front' | 'back';
export type BodyDepth = 'surface' | 'deep';

export interface BodyZone {
  id: string;
  name: string;
  path: string;
}

export interface SensationType {
  id: string;
  label: string;
  icon: string; // Lucide icon name
  color: string;
}

export interface DiaryEntry {
  id?: number;
  date: string;
  zone_id: string;
  sensation_id: string;
  note?: string;
  view: BodyView;
  depth: BodyDepth;
}

export const SENSATIONS: SensationType[] = [
  { id: 'tension', label: 'Зажатость', icon: 'Lock', color: 'bg-orange-100 text-orange-600' },
  { id: 'heaviness', label: 'Тяжесть', icon: 'Weight', color: 'bg-slate-100 text-slate-600' },
  { id: 'pulsation', label: 'Пульсация', icon: 'Activity', color: 'bg-rose-100 text-rose-600' },
  { id: 'numbness', label: 'Онемение', icon: 'Wind', color: 'bg-cyan-100 text-cyan-600' },
  { id: 'pain', label: 'Боль', icon: 'Zap', color: 'bg-red-100 text-red-600' },
  { id: 'warmth', label: 'Тепло', icon: 'Flame', color: 'bg-amber-100 text-amber-600' },
  { id: 'cold', label: 'Холод', icon: 'Snowflake', color: 'bg-blue-100 text-blue-600' },
  { id: 'tingling', label: 'Покалывание', icon: 'Sparkles', color: 'bg-purple-100 text-purple-600' },
];

// Detailed body zones for SVG
export const FRONT_ZONES: BodyZone[] = [
  { id: 'head', name: 'Голова', path: 'M100,20 Q100,10 110,10 Q120,10 120,20 Q120,40 110,50 Q100,40 100,20' },
  { id: 'eye_l', name: 'Левый глаз', path: 'M103,25 Q105,23 107,25 Q105,27 103,25' },
  { id: 'eye_r', name: 'Правый глаз', path: 'M113,25 Q115,23 117,25 Q115,27 113,25' },
  { id: 'temple_l', name: 'Левый висок', path: 'M98,25 Q96,25 96,30 Q98,35 100,30' },
  { id: 'temple_r', name: 'Правый висок', path: 'M122,25 Q124,25 124,30 Q122,35 120,30' },
  { id: 'jaw', name: 'Челюсть', path: 'M105,45 L115,45 L112,52 L108,52 Z' },
  { id: 'neck', name: 'Шея', path: 'M105,50 L115,50 L115,60 L105,60 Z' },
  { id: 'shoulder_l', name: 'Левое плечо', path: 'M60,65 L80,60 L80,80 L65,85 Z' },
  { id: 'shoulder_r', name: 'Правое плечо', path: 'M140,60 L160,65 L155,85 L140,80 Z' },
  { id: 'chest', name: 'Грудь', path: 'M80,60 L140,60 L140,100 L80,100 Z' },
  { id: 'stomach', name: 'Живот', path: 'M85,100 L135,100 L130,140 L90,140 Z' },
  { id: 'pelvis_front', name: 'Таз', path: 'M85,140 L135,140 L130,160 L90,160 Z' },
  { id: 'arm_upper_l', name: 'Левое плечо (верх)', path: 'M50,85 L65,85 L62,105 L47,105 Z' },
  { id: 'arm_upper_r', name: 'Правое плечо (верх)', path: 'M155,85 L170,85 L173,105 L158,105 Z' },
  { id: 'elbow_l', name: 'Левый локоть', path: 'M47,105 L62,105 L61,115 L46,115 Z' },
  { id: 'elbow_r', name: 'Правый локоть', path: 'M158,105 L173,105 L174,115 L159,115 Z' },
  { id: 'arm_lower_l', name: 'Левое предплечье', path: 'M46,115 L61,115 L60,130 L45,130 Z' },
  { id: 'arm_lower_r', name: 'Правое предплечье', path: 'M159,115 L174,115 L175,130 L160,130 Z' },
  { id: 'wrist_l', name: 'Левое запястье', path: 'M45,130 L60,130 L59,135 L44,135 Z' },
  { id: 'wrist_r', name: 'Правое запястье', path: 'M160,130 L175,130 L176,135 L161,135 Z' },
  { id: 'hand_l', name: 'Левая кисть', path: 'M40,135 L50,135 L48,145 L38,145 Z' },
  { id: 'hand_r', name: 'Правая кисть', path: 'M170,135 L180,135 L182,145 L172,145 Z' },
  { id: 'fingers_l', name: 'Кончики пальцев (лев)', path: 'M35,145 L45,145 L43,150 L33,150 Z' },
  { id: 'fingers_r', name: 'Кончики пальцев (прав)', path: 'M175,145 L185,145 L187,150 L177,150 Z' },
  { id: 'thigh_l', name: 'Левое бедро', path: 'M90,160 L110,160 L108,210 L88,210 Z' },
  { id: 'thigh_r', name: 'Правое бедро', path: 'M110,160 L130,160 L132,210 L112,210 Z' },
  { id: 'knee_l', name: 'Левое колено', path: 'M88,210 L108,210 L106,225 L86,225 Z' },
  { id: 'knee_r', name: 'Правое колено', path: 'M112,210 L132,210 L134,225 L114,225 Z' },
  { id: 'leg_l', name: 'Левая голень', path: 'M86,225 L106,225 L104,270 L84,270 Z' },
  { id: 'leg_r', name: 'Правая голень', path: 'M114,225 L134,225 L136,270 L116,270 Z' },
  { id: 'ankle_l', name: 'Левая щиколотка', path: 'M84,270 L104,270 L103,275 L83,275 Z' },
  { id: 'ankle_r', name: 'Правая щиколотка', path: 'M116,270 L136,270 L137,275 L117,275 Z' },
  { id: 'foot_l', name: 'Левая стопа', path: 'M82,275 L102,275 L100,285 L80,285 Z' },
  { id: 'foot_r', name: 'Правая стопа', path: 'M118,275 L138,275 L140,285 L120,285 Z' },
  { id: 'toes_l', name: 'Пальцы ног (лев)', path: 'M78,285 L98,285 L96,290 L76,290 Z' },
  { id: 'toes_r', name: 'Пальцы ног (прав)', path: 'M122,285 L142,285 L144,290 L124,290 Z' },
];

export const BACK_ZONES: BodyZone[] = [
  { id: 'back_head', name: 'Затылок', path: 'M100,20 Q100,10 110,10 Q120,10 120,20 Q120,40 110,50 Q100,40 100,20' },
  { id: 'upper_back', name: 'Верх спины', path: 'M80,60 L140,60 L140,90 L80,90 Z' },
  { id: 'lower_back', name: 'Поясница', path: 'M85,90 L135,90 L130,130 L90,130 Z' },
  { id: 'pelvis_back', name: 'Крестец', path: 'M85,130 L135,130 L130,150 L90,150 Z' },
  { id: 'shoulder_blade_l', name: 'Левая лопатка', path: 'M85,65 L105,65 L105,85 L85,85 Z' },
  { id: 'shoulder_blade_r', name: 'Правая лопатка', path: 'M115,65 L135,65 L135,85 L115,85 Z' },
  { id: 'buttocks', name: 'Ягодицы', path: 'M85,150 L135,150 L130,180 L90,180 Z' },
  { id: 'back_thigh_l', name: 'Задняя пов. бедра (лев)', path: 'M90,180 L110,180 L108,230 L88,230 Z' },
  { id: 'back_thigh_r', name: 'Задняя пов. бедра (прав)', path: 'M110,180 L130,180 L132,230 L112,230 Z' },
  { id: 'back_knee_l', name: 'Под коленом (лев)', path: 'M88,230 L108,230 L106,245 L86,245 Z' },
  { id: 'back_knee_r', name: 'Под коленом (прав)', path: 'M112,230 L132,230 L134,245 L114,245 Z' },
  { id: 'calf_l', name: 'Икра (лев)', path: 'M86,245 L106,245 L104,290 L84,290 Z' },
  { id: 'calf_r', name: 'Икра (прав)', path: 'M114,245 L134,245 L136,290 L116,290 Z' },
];
