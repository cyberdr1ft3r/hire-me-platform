import { useLayoutEffect, useState, type RefObject } from 'react';

import { readRootFontSizePx } from '../layout/index.js';

/**
 * Whether the element is narrower than `minRem`, following resizes (window, the
 * shell's navigation panel, browser zoom). An element with no layout yet (width 0,
 * as in tests without a layout engine) counts as wide, so the default is the
 * desktop presentation.
 */
export function useNarrowContainer(ref: RefObject<HTMLElement | null>, minRem: number): boolean {
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      setNarrow(width > 0 && width < minRem * readRootFontSizePx());
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, minRem]);

  return narrow;
}
