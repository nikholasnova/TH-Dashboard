'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

const SM_BREAKPOINT = 640;

interface ViewportScalerProps {
  children: ReactNode;
  ready?: boolean;
}

export function ViewportScaler({ children, ready = true }: ViewportScalerProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    if (!ready) {
      content.style.zoom = '';
      return;
    }

    let frameId = 0;
    let currentZoom = 1;

    function measure(force?: boolean) {
      content!.style.zoom = '';

      if (window.innerWidth < SM_BREAKPOINT) {
        currentZoom = 1;
        return;
      }

      const natural = content!.scrollHeight;
      if (natural <= 0) return;

      const topOffset = content!.getBoundingClientRect().top + window.scrollY;

      const container = content!.closest('.container-responsive');
      const bottomPad = container
        ? parseFloat(getComputedStyle(container).paddingBottom)
        : 32;

      const available = window.innerHeight - topOffset - bottomPad - 4;

      let newZoom = 1;
      if (natural > available && available > 0) {
        newZoom = available / natural;
      }

      // Skip tiny adjustments (< 1%) from child components settling — avoids visible micro-shifts
      if (!force && Math.abs(newZoom - currentZoom) < 0.01) {
        content!.style.zoom = currentZoom < 1 ? String(currentZoom) : '';
        return;
      }

      currentZoom = newZoom;
      if (newZoom < 1) {
        content!.style.zoom = String(newZoom);
      }
    }

    function scheduleMeasure() {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => measure(false));
    }

    measure(true);

    const delayedId = setTimeout(() => measure(true), 500);

    function onResize() { measure(true); }
    window.addEventListener('resize', onResize);

    const mo = new MutationObserver(scheduleMeasure);
    mo.observe(content, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(delayedId);
      window.removeEventListener('resize', onResize);
      mo.disconnect();
    };
  }, [ready]);

  return <div ref={contentRef}>{children}</div>;
}
