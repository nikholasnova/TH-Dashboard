'use client';

import { useState } from 'react';
import { motion, LayoutGroup } from 'framer-motion';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedNavProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  layoutGroupId: string;
  className?: string;
}

export function SegmentedNav<T extends string | number>({
  options,
  value,
  onChange,
  layoutGroupId,
  className = '',
}: SegmentedNavProps<T>) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  return (
    <LayoutGroup id={layoutGroupId}>
      <div
        className={`inline-flex items-stretch border-b border-[var(--hairline)] ${className}`}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {options.map((opt, idx) => {
          const active = opt.value === value;
          const hovered = hoveredIdx === idx;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              onMouseEnter={() => setHoveredIdx(idx)}
              onFocus={() => setHoveredIdx(idx)}
              className={`relative h-14 px-4 inline-flex items-center justify-center text-sm whitespace-nowrap tracking-tight transition-colors ${
                active
                  ? 'text-[var(--fg)] font-semibold'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {hovered && (
                <motion.span
                  layoutId={`${layoutGroupId}-hover`}
                  aria-hidden
                  className="absolute rounded-md bg-[var(--hover-bg)]"
                  style={{ top: 6, bottom: 6, left: 2, right: 2, zIndex: -1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.5 }}
                />
              )}
              <span className="relative">{opt.label}</span>
              {active && (
                <motion.span
                  layoutId={`${layoutGroupId}-active`}
                  aria-hidden
                  className="absolute left-0 right-0 -bottom-px h-0.5 bg-[var(--fg)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.6 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
