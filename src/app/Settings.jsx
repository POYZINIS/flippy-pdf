import React, { useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';
import { Text } from './Text.jsx';

export function Settings({ theme, onTheme, glass, onGlass, opacity, onOpacity, desktop, backdropSupported, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="settings-panel glass-card" aria-labelledby="settings-title" onClose={onClose}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = dialog.current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <div className="settings-header"><span id="settings-title"><Text size={13} weight={600}>Settings</Text></span><button type="button" className="icon-button" aria-label="Close settings" onClick={onClose} autoFocus><Icon name="close" size={16} /></button></div>
    <label className="setting-row"><Text size={12}>Theme</Text><select aria-label="Theme" value={theme} onChange={event => onTheme(event.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
    <label className="setting-row"><Text size={12}>{backdropSupported ? 'Glass background' : 'Glass panels'}</Text><input type="checkbox" role="switch" aria-label={backdropSupported ? 'Glass background' : 'Glass panels'} checked={glass} onChange={event => onGlass(event.target.checked)} /></label>
    {backdropSupported ? <label className="setting-slider"><span><Text size={12}>Background opacity</Text><output><Text size={11}>{`${opacity}%`}</Text></output></span><input type="range" aria-label="Background opacity" min="0" max="100" step="5" value={opacity} disabled={!glass} onChange={event => onOpacity(Number(event.target.value))} /></label>
      : <Text size={11} className="settings-note" wrap>{desktop ? 'Desktop blur requires Windows 11 (22H2 or later).' : 'Desktop blur is available in the Windows app.'}</Text>}
  </dialog>;
}
