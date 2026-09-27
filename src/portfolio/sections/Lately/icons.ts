import { Award, Coffee, Radar, Rocket, Smartphone, Trophy, Zap, type LucideIcon } from 'lucide-react';
import type { LatelyItem } from '@/data/profile';

export const TAG_ICONS: Record<LatelyItem['tagIcon'], LucideIcon> = {
  trophy: Trophy,
  rocket: Rocket,
  award: Award,
  zap: Zap,
  phone: Smartphone,
  radar: Radar,
  coffee: Coffee,
};
