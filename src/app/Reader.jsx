import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { rasterSize } from './raster.js';

export function BookView({ pdf, initialPage, apiRef, onChange, onError }) {
  const host = useRef(null);
  useEffect(() => {
    let renderer;
    let active = true;
    import('./BookRenderer.js').then(({ BookRenderer }) => {
      if (!active) return;
      try {
        renderer = new BookRenderer(host.current, pdf, initialPage, onChange, onError);
        apiRef.current = renderer;
      } catch {
        onError(new Error('3D rendering is unavailable. Switch to scroll view.'));
      }
    }).catch(() => { if (active) onError(new Error('Unable to start 3D view. Switched to scroll view.')); });
    return () => { active = false; renderer?.destroy(); if (apiRef.current === renderer) apiRef.current = null; };
  }, [pdf]);
  return <div ref={host} className="book-view" tabIndex={-1} data-busy="true" aria-label="PDF book" />;
}

const ScrollPage = memo(function ScrollPage({ pdf, number, visibility, pixels }) {
  const ref = useRef(null);
  const [aspect, setAspect] = useState(pdf.aspect);
  const [error, setError] = useState(false);
  useEffect(() => {
    const element = ref.current;
    let active = true;
    let controller;
    let lease;
    const release = () => {
      element.replaceChildren();
      controller?.abort();
      lease?.release();
      lease = null;
    };
    const unobserve = visibility.observe(element, visible => {
      release();
      if (!visible) return;
      const request = controller = new AbortController();
      setError(false);
      pdf.acquire(number, pixels, request.signal).then(result => {
        if (!active || request.signal.aborted) { result.release(); return; }
        lease = result;
        setAspect(result.canvas.width / result.canvas.height);
        result.canvas.setAttribute('aria-label', `Page ${number}`);
        // Display the leased raster itself instead of copying its pixel buffer.
        element.replaceChildren(result.canvas);
      }).catch(error => { if (active && !request.signal.aborted && error.name !== 'AbortError') setError(true); });
    });
    return () => { active = false; unobserve(); release(); };
  }, [pdf, number, visibility, pixels]);
  return <div className="scroll-page" style={{ aspectRatio: aspect }} data-page={number}>
    <div ref={ref} className="page-canvas" />
    {error && <span className="page-error" role="alert">Page {number} could not be rendered.</span>}
  </div>;
});

export function ScrollView({ pdf, initialPage, apiRef, onChange }) {
  const root = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(600);
  // One observer for the document; only nearby pages hold raster leases.
  const visibility = useMemo(() => {
    const callbacks = new Map();
    let observer;
    return {
      observe(element, callback) {
        observer ||= new IntersectionObserver(entries => {
          for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
        }, { root: root.current, rootMargin: '700px 0px' });
        callbacks.set(element, callback);
        observer.observe(element);
        return () => {
          observer.unobserve(element);
          callbacks.delete(element);
          if (!callbacks.size) { observer.disconnect(); observer = null; }
        };
      },
    };
  }, [pdf]);
  const pixels = rasterSize(width * zoom * Math.max(1, 1 / pdf.aspect) * Math.min(devicePixelRatio || 1, 2));
  const page = useRef(initialPage);
  const zoomRef = useRef(1);
  const pendingJump = useRef(initialPage);
  const emit = () => onChange({ page: page.current, total: pdf.total, zoom: zoomRef.current, atStart: page.current === 1, atEnd: page.current === pdf.total });
  const jump = number => {
    const value = Math.max(1, Math.min(pdf.total, Math.round(number)));
    if (!Number.isFinite(value)) return;
    const node = root.current.querySelector(`[data-page="${value}"]`);
    if (!node) return;
    root.current.scrollTop = node.offsetTop - 20;
    page.current = value;
    emit();
  };
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      pendingJump.current = page.current;
      setWidth(Math.max(120, Math.min(900, entry.contentRect.width - 48)));
    });
    observer.observe(root.current);
    const controller = {
      next: () => jump(page.current + 1), prev: () => jump(page.current - 1), goTo: jump,
      setZoom: value => {
        pendingJump.current = page.current;
        zoomRef.current = Math.max(.35, Math.min(4, value));
        setZoom(zoomRef.current);
        emit();
      },
      fitToWindow: () => { pendingJump.current = page.current; zoomRef.current = 1; setZoom(1); emit(); },
      fitToScreen: () => {
        const node = root.current.querySelector(`[data-page="${page.current}"]`);
        const naturalHeight = node ? node.offsetHeight / zoomRef.current : root.current.clientHeight;
        pendingJump.current = page.current;
        zoomRef.current = Math.max(.35, Math.min(1, (root.current.clientHeight - 40) / naturalHeight));
        root.current.scrollLeft = 0;
        setZoom(zoomRef.current);
        emit();
      },
    };
    apiRef.current = controller;
    emit();
    return () => { observer.disconnect(); if (apiRef.current === controller) apiRef.current = null; };
  }, [pdf]);
  useLayoutEffect(() => { if (pendingJump.current) { jump(pendingJump.current); pendingJump.current = null; } }, [width, zoom]);
  const frame = useRef(null);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const onScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const position = root.current.scrollTop + root.current.clientHeight * .3;
      const pages = root.current.querySelectorAll('[data-page]');
      let current = 1;
      for (const node of pages) { if (node.offsetTop > position) break; current = Number(node.dataset.page); }
      if (current !== page.current) { page.current = current; emit(); }
    });
  };
  return <div ref={root} className="scroll-view" onScroll={onScroll} tabIndex={-1} aria-label="PDF scroll view">
    <div className="scroll-pages" style={{ width: width * zoom }}>
      {Array.from({ length: pdf.total }, (_, index) => <ScrollPage key={index} pdf={pdf} number={index + 1} visibility={visibility} pixels={pixels} />)}
    </div>
  </div>;
}
