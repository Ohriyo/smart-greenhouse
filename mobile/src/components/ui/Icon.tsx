import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

type IonName = ComponentProps<typeof Ionicons>['name'];
type MciName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Any Ionicons name, or a MaterialCommunityIcons name prefixed with "mci-"
 * (for glyphs Ionicons lacks: "mci-fan", "mci-sprout", "mci-history", …).
 */
export type IconName = IonName | `mci-${MciName}`;

interface IconProps {
  name: IconName;
  size?: number;
  color: string;
}

function mciName(name: string): MciName | null {
  if (!name.startsWith('mci-')) return null;
  const bare = name.slice(4);
  return isMci(bare) ? bare : null;
}

function isMci(name: string): name is MciName {
  return Object.prototype.hasOwnProperty.call(MaterialCommunityIcons.glyphMap, name);
}

function isIon(name: string): name is IonName {
  return Object.prototype.hasOwnProperty.call(Ionicons.glyphMap, name);
}

/** Decorative icon: hidden from TalkBack (the surrounding control carries the label). */
export function Icon({ name, size = 20, color }: IconProps) {
  const mci = mciName(name);
  if (mci) {
    return (
      <MaterialCommunityIcons
        name={mci}
        size={size}
        color={color}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    );
  }
  return (
    <Ionicons
      name={isIon(name) ? name : 'help-circle-outline'}
      size={size}
      color={color}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    />
  );
}
