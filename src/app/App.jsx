import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { Text } from './Text.jsx';
import { BookView, ScrollView } from './Reader.jsx';
import { Settings } from './Settings.jsx';

const initialState = { page: 1, total: 0, zoom: 1, atStart: true, atEnd: true };
function preference(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, value); } catch { /* Private browsing can disable storage. */ } }

function IconButton({ icon, label, className = '', ...props }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...props}><Icon name={icon} size={17} /></button>;
}

export function App() {
  const app = useRef(null);
  const input = useRef(null);
  const api = useRef(null);
  const currentPage = useRef(1);
  const dragDepth = useRef(0);
  const [theme, setTheme] = useState(() => preference('pdfthing-theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [mode, setMode] = useState(() => preference('pdfthing-view', 'book') === 'scroll' ? 'scroll' : 'book');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [glass, setGlass] = useState(() => preference('pdfthing-glass', 'true') !== 'false');
  const [opacity, setOpacity] = useState(() => {
    const saved = Number(preference('pdfthing-opacity', '45'));
    return Number.isFinite(saved) ? Math.max(0, Math.min(100, saved)) : 45;
  });
  const [file, setFile] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [reader, setReader] = useState(initialState);
  const [pageInput, setPageInput] = useState('1');
  const [windowState, setWindowState] = useState({ pinned: false, maximized: false, fullscreen: false });
  const desktop = window.desktop;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    save('pdfthing-theme', theme);
  }, [theme]);
  useEffect(() => { save('pdfthing-view', mode); }, [mode]);
  useEffect(() => { save('pdfthing-opacity', String(opacity)); }, [opacity]);
  useEffect(() => {
    save('pdfthing-glass', String(glass));
    desktop?.setAppearance({ glass, theme }).then(setWindowState).catch(() => setError('Couldn’t change the window background.'));
  }, [glass, theme]);
  useEffect(() => {
    if (!desktop) return;
    desktop.getState().then(setWindowState);
    return desktop.onState(setWindowState);
  }, []);

  const openFiles = useCallback(files => {
    if (!files?.length) return;
    if (files.length !== 1) { setError('Choose one PDF.'); return; }
    const next = files[0];
    if (!/\.pdf$/i.test(next.name) && next.type !== 'application/pdf') { setError('Choose a PDF file.'); return; }
    if (!next.size) { setError('This PDF is empty.'); return; }
    setError('');
    setPdf(null);
    setLoading(true);
    setReader(initialState);
    currentPage.current = 1;
    setFile(next);
  }, []);

  const closeDocument = useCallback(() => {
    setFile(null); setPdf(null); setLoading(false); setError(''); setReader(initialState); currentPage.current = 1;
  }, []);

  useEffect(() => {
    if (!desktop) return;
    const unsubscribe = desktop.onPdf(descriptor => {
      if (descriptor.error) { setError(descriptor.error); return; }
      let closed = false;
      openFiles([{
        ...descriptor,
        async readRange(begin, end) {
          const data = new Uint8Array(end - begin);
          for (let offset = begin; offset < end; offset += 4 * 1024 ** 2) {
            if (closed) throw new DOMException('PDF closed', 'AbortError');
            data.set(await desktop.readPdfRange(descriptor.id, offset, Math.min(end, offset + 4 * 1024 ** 2)), offset - begin);
          }
          return data;
        },
        close() { if (!closed) { closed = true; desktop.releasePdf(descriptor.id).catch(() => {}); } },
      }]);
    });
    desktop.pdfReady().catch(() => setError('Couldn’t receive the PDF from Windows.'));
    return unsubscribe;
  }, [openFiles]);

  useEffect(() => {
    if (!file) return;
    let active = true;
    let source;
    import('./PdfDocument.js').then(async ({ PdfDocument }) => {
      if (!active) return;
      source = new PdfDocument();
      await source.open(file);
      if (active) { setPdf(source); setLoading(false); }
    }).catch(err => {
      if (!active) return;
      setLoading(false); setFile(null); setPdf(null);
      setError(err.name === 'PasswordException' ? 'Open an unlocked copy of this PDF.' : 'Couldn’t read this PDF. Try another file.');
    });
    return () => { active = false; source?.destroy(); file.close?.(); };
  }, [file]);

  const onChange = useCallback(state => { currentPage.current = state.page; setReader(state); }, []);
  const onRenderError = useCallback(err => { setError(err.message || 'Unable to render this page.'); setMode('scroll'); }, []);
  useEffect(() => { setPageInput(String(reader.page)); }, [reader.page]);

  const toggleFullscreen = useCallback(async () => {
    if (desktop) { await desktop.command('fullscreen'); return; }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await app.current.requestFullscreen();
    } catch { setError('Fullscreen is unavailable.'); }
  }, []);

  useEffect(() => {
    const keydown = event => {
      if (settingsOpen) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); input.current.click(); return; }
      if (event.key === 'F11') { event.preventDefault(); toggleFullscreen(); return; }
      if (!pdf || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, textarea, [contenteditable]')) return;
      if (event.key === ' ' && (event.target.closest('button') || mode === 'scroll')) return;
      const actions = {
        ArrowRight: () => api.current?.next(), ArrowLeft: () => api.current?.prev(),
        Home: () => api.current?.goTo(1), End: () => api.current?.goTo(pdf.total),
        '+': () => api.current?.setZoom(reader.zoom * 1.2), '=': () => api.current?.setZoom(reader.zoom * 1.2),
        '-': () => api.current?.setZoom(reader.zoom / 1.2), '0': () => api.current?.fitToScreen(),
        f: toggleFullscreen, F: toggleFullscreen,
        ...(mode === 'book' ? { PageDown: () => api.current?.next(), PageUp: () => api.current?.prev(), ' ': () => api.current?.next() } : {}),
      };
      if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [pdf, mode, reader.zoom, toggleFullscreen, settingsOpen]);

  const commitPage = () => {
    const page = Number(pageInput);
    if (pageInput.trim() && Number.isFinite(page)) api.current?.goTo(page);
    setPageInput(String(currentPage.current));
  };

  return <div ref={app} className={`app ${desktop ? 'desktop' : 'browser'} ${dragging ? 'is-dragging' : ''}`} data-mode={mode}
    data-glass={glass} data-backdrop={glass && windowState.backdropSupported ? 'true' : 'false'}
    data-square={windowState.maximized || windowState.fullscreen ? 'true' : 'false'} style={{ '--background-opacity': `${opacity}%` }}
    onDragEnter={event => { event.preventDefault(); if (Array.from(event.dataTransfer.types).includes('Files')) { dragDepth.current++; setDragging(true); } }}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
    onDragLeave={event => { event.preventDefault(); if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
    onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDragging(false); openFiles(event.dataTransfer.files); }}>
    <input ref={input} className="sr-only" type="file" tabIndex={-1} accept="application/pdf,.pdf" aria-label="Choose a PDF" onChange={event => { openFiles(event.target.files); event.target.value = ''; }} />
    <header className="window-bar" onDoubleClick={event => { if (event.target === event.currentTarget) desktop?.command('maximize'); }}>
      <div className="window-tools" onDoubleClick={event => { if (event.target === event.currentTarget) desktop?.command('maximize'); }}>
        <IconButton icon="folder" label={file ? `Open PDF (${file.name})` : 'Open PDF'} onClick={() => input.current.click()} />
        {file && <IconButton icon="close" label="Close PDF" onClick={closeDocument} />}
        <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Light mode' : 'Dark mode'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
        {pdf && <IconButton icon={mode === 'book' ? 'scroll' : 'spread'} label={mode === 'book' ? 'Scroll view' : 'Book view'} onClick={() => setMode(mode === 'book' ? 'scroll' : 'book')} />}
        <IconButton icon="settings" label="Settings" aria-haspopup="dialog" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)} />
      </div>
      {desktop && <div className="window-controls" onDoubleClick={event => { if (event.target === event.currentTarget) desktop?.command('maximize'); }}>
        <IconButton icon="pin" label="Always on top" aria-pressed={windowState.pinned} onClick={() => desktop.command('pin')} />
        <IconButton icon="minus" label="Minimize window" onClick={() => desktop.command('minimize')} />
        <IconButton icon={windowState.maximized ? 'restore' : 'maximize'} label={windowState.maximized ? 'Restore window' : 'Maximize window'} onClick={() => desktop.command('maximize')} />
        <IconButton icon="close" label="Close window" className="window-close" onClick={() => desktop.command('close')} />
      </div>}
    </header>
    <main className="workspace">
      {!file && <button className="drop-zone" type="button" onClick={() => input.current.click()} aria-label="Drop or choose a PDF">
        <Icon name="plus" size={30} /><Text size={13}>{dragging ? 'Drop PDF' : 'Open PDF'}</Text>
      </button>}
      {loading && <div className="loading" role="status" aria-label="Opening PDF"><span className="loading-ring" /></div>}
      {pdf && (mode === 'book'
        ? <BookView key="book" pdf={pdf} initialPage={currentPage.current} apiRef={api} onChange={onChange} onError={onRenderError} />
        : <ScrollView key="scroll" pdf={pdf} initialPage={currentPage.current} apiRef={api} onChange={onChange} />)}
    </main>
    {pdf && <footer className="reader-bottom">
      <div className="glass-card reader-toolbar" role="group" aria-label="PDF controls">
        <IconButton icon="left" label="Previous page" disabled={reader.atStart} onClick={() => api.current?.prev()} />
        <label className="page-counter"><input aria-label="Page number" inputMode="numeric" value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={commitPage} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><Text size={11}>{`/ ${reader.total || pdf.total}`}</Text></label>
        <IconButton icon="right" label="Next page" disabled={reader.atEnd} onClick={() => api.current?.next()} />
        <span className="toolbar-divider" />
        <IconButton icon="minus" label="Zoom out" disabled={reader.zoom <= .35} onClick={() => api.current?.setZoom(reader.zoom / 1.2)} />
        <button type="button" className="zoom-value" aria-label="Fit to window" title="Fit to window (0)" onClick={() => api.current?.fitToWindow()}><Text size={11}>{`${Math.round(reader.zoom * 100)}%`}</Text></button>
        <IconButton icon="plus" label="Zoom in" disabled={reader.zoom >= 4} onClick={() => api.current?.setZoom(reader.zoom * 1.2)} />
        <IconButton icon="fit" label="Fit to screen" title="Fit to screen (0)" onClick={() => api.current?.fitToScreen()} />
        {!desktop && document.fullscreenEnabled && <IconButton icon="expand" label="Fullscreen" onClick={toggleFullscreen} />}
      </div>
      <span className="sr-only" role="status">{`Page ${reader.page} of ${pdf.total}`}</span>
    </footer>}
    {error && <div className="error-toast glass-card" role="alert"><Icon name="alert" size={16} /><Text size={12} wrap>{error}</Text><IconButton icon="close" label="Dismiss message" onClick={() => setError('')} /></div>}
    {dragging && file && <div className="drop-overlay"><Icon name="plus" size={32} /><Text size={13}>Drop PDF</Text></div>}
    {settingsOpen && <Settings theme={theme} onTheme={setTheme} glass={glass} onGlass={setGlass} opacity={opacity} onOpacity={setOpacity} desktop={Boolean(desktop)} backdropSupported={windowState.backdropSupported} onClose={() => setSettingsOpen(false)} />}
  </div>;
}
