import React from 'react';

const paths = {
  settings: <><path d="m9 3-.5 2a8 8 0 0 0-1.6 1L5 5.5 3 9l1.5 1.5a8 8 0 0 0 0 2L3 14l2 3.5 1.9-.5a8 8 0 0 0 1.6 1l.5 2h4l.5-2a8 8 0 0 0 1.6-1l1.9.5 2-3.5-1.5-1.5a8 8 0 0 0 0-2L19 9l-2-3.5-1.9.5a8 8 0 0 0-1.6-1L13 3z"/><circle cx="11" cy="11.5" r="3"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
  moon: <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>,
  pin: <><path d="m9 3 6 0-1 6 3 3v2H7v-2l3-3zM12 14v7"/></>,
  maximize: <rect x="5" y="5" width="14" height="14" rx="1"/>,
  restore: <><path d="M9 5V3h12v12h-2"/><rect x="3" y="9" width="12" height="12" rx="1"/></>,
  scroll: <><rect x="6" y="3" width="12" height="7" rx="1"/><rect x="6" y="14" width="12" height="7" rx="1"/></>,
  folder: <path d="M3 7V5h6l2 2h10v13H3z"/>,
  book: <><path d="M4 4h6l3 3v14H4z"/><path d="M10 4v4h4M17 4h3v17h-3"/></>,
  file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></>,
  upload: <path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  minus: <path d="M5 12h14"/>,
  left: <path d="m14 6-6 6 6 6"/>,
  right: <path d="m10 6 6 6-6 6"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  expand: <path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/>,
  collapse: <path d="M4 8h4V4m8 0v4h4M8 20v-4H4m12 4v-4h4"/>,
  fit: <><rect x="7" y="4" width="10" height="16" rx="1"/><path d="M3 8v8M21 8v8"/></>,
  spread: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14"/></>,
  lock: <><rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3M12 14v2"/></>,
  alert: <><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></>,
};

export function Icon({ name, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
