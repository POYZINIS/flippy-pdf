import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';

// Pretext computes the line breaks; React paints selectable text.
// Preparation is cached across container resizes.
export function Text({ children, as: Tag = 'span', size = 14, weight = 400, leading = 1.5, className = '', wrap = false }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  const text = String(children);
  const font = `${weight} ${size}px "Segoe UI", Arial, sans-serif`;
  const prepared = useMemo(() => prepareWithSegments(text, font), [text, font]);
  const result = useMemo(() => layoutWithLines(prepared, wrap ? Math.max(1, width || 800) : 100000, size * leading), [prepared, width, wrap, size, leading]);

  useLayoutEffect(() => {
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [wrap]);

  return <Tag ref={ref} className={`pretext ${wrap ? 'pretext-wrap' : ''} ${className}`} style={{ font, lineHeight: leading }}>
    {result.lines.map((line, i) => <React.Fragment key={i}>
      {i > 0 && ' '}<span className="pretext-line">{line.text}</span>
    </React.Fragment>)}
  </Tag>;
}
