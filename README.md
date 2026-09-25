# PDFthing

A minimal, local PDF reader for Windows and the web. Open or drop a PDF.
No titles, logos, account, document upload, or server required in the desktop app.

The React interface keeps the soft NeumorUI/GlassKit look, with light and dark
themes. Pretext lays out the small amount of UI text. PDF.js renders pages;
Three.js deforms a subdivided sheet for curved page turns, animated with
Anime.js. This is an independent page-turn implementation, not FlipHTML5's
proprietary renderer. Narrow windows show one page at a time.

Book mode supports wheel zoom, panning from empty space (or middle-drag
anywhere — the pages themselves always turn instead), and page-edge dragging.
The settings dialog offers a transparent, blurred window background in the
Windows app. Scroll mode uses a normal scrollbar and zoom buttons. Switching
modes keeps your page. The theme and layout preference persist; the PDF itself
is not saved.

## Windows executable

Run `release/PDFthing-1.0.0-Windows-x64.exe`. This is a portable Windows x64
app with Electron bundled, so the target machine does not need Node.js or a
browser installation. The executable is unsigned. It extracts its runtime
to a temporary directory on launch; theme preferences live in the normal
application data directory.

The frameless window has custom minimize, maximize/restore, close, and
always-on-top buttons. Drag the empty top strip to move it; double-click it
to maximize or restore. Native window resizing remains available at the edges.

PDFs passed by Windows **Open with**, a file association, or the command line
open directly in the reader. Opening another PDF reuses the existing window.
Native file opens use the same on-demand range loading as drag-and-drop.
Keep the portable executable at a stable location and select that executable
as the PDF default; do not associate files with its temporary extracted copy.
For command-line use of the portable launcher, pass the PDF's absolute path
(Windows file associations already do this).

The Windows executable/window icon and browser favicon come from `svglol.svg`.
After editing the SVG, run `npm run icons` to regenerate the committed PNG/ICO
assets (requires `npx playwright install chromium`), then rebuild the app.

Build or run it from source:

```bash
npm install
npm run desktop
npm run dist:win
```

`dist:win` creates the portable executable and `release/win-unpacked/PDFthing.exe`.
Build on Windows x64. The build downloads Electron/packaging tools if needed.
The 33 MB sample PDF is excluded from the desktop distribution.

## Small development package

Double-click `package-dev.bat`, or run:

```bash
npm run package:dev
```

This rebuilds the UI and creates `release/PDFthing-<version>-dev.zip`. Share only
that ZIP. It contains the compiled UI, editable source, icons, build scripts,
and dependency installer. It excludes `node_modules`, Electron's runtime,
PDFs, Git history, test output, and previous release files.

On the receiving Windows machine:

1. Extract the ZIP completely.
2. Install Node.js 22.12+ with npm if needed.
3. Run `install-dependencies.bat` once (internet required for downloads).
4. Run `start-app.bat` to open the included compiled app.

This reduces the download you share; dependencies still take space after setup.
The standalone EXE includes Electron and needs no separate dependency setup.
Use that EXE for Windows PDF associations; the development launcher is intended
for manual use.

After editing the source, run `package-dev.bat` again to build a fresh ZIP.
The same version's ZIP is replaced. To give a release a new version, run
`npm version patch --no-git-tag-version` first (or use `minor` / `major`).
For a standalone Windows EXE, use `npm run dist:win` instead; close any running
copy of the output EXE before replacing it.

`start-app.bat` uses the last built UI. During development, `npm run desktop`
rebuilds before launching. The development ZIP includes automated tests, but
sample-based tests and profiling need your local `public/sample.pdf`, which
is intentionally omitted from the package.

## Run the app

Use a current Node.js release supported by Vite 8 (Node 22.12+ recommended).

### 1. Install

On Windows, double-click `install-dependencies.bat`. It checks for Node.js 22.12+
and installs the project dependencies, Electron, and Chromium for tests and
icon generation. An internet connection is needed for uncached downloads.
Use `install-dependencies.bat --no-pause` when running it from automation.

Alternatively, install the project dependencies manually:

```bash
npm install
```

### 2. Start the dev server

```bash
npm run dev
# or: npm run serve / npm start
```

Open `http://localhost:5173`. Drop a PDF anywhere in the window, or click
the open area/folder button. Native window buttons only appear in Electron.

`public/sample.pdf` is available for manual testing, but is not opened or
downloaded automatically. The PDF.js worker is bundled locally. Empty,
invalid, damaged, and password-protected files show a recoverable message;
password-protected PDFs currently require an unlocked copy.

### 3. Build a static bundle (optional)

```bash
npm run build
npm run preview
```

`npm run build` outputs an optimized bundle to `dist/`, and `npm run preview`
serves that bundle locally so you can sanity-check the production build.

### Checks

```bash
npx playwright install chromium
npm test
npm run build
npm run test:desktop
```

Playwright checks drag-and-drop, themes, curved turns, panning, wheel zoom,
normal scrolling, layout switching, replacement, cancellation, mobile sizing,
reduced motion, and the bundled sample. Desktop checks cover the built UI,
local PDF worker, isolated preload, native pin state, and window-command routing.
Screenshots are saved under the ignored `test-results/`.

### Memory

Page rasters are sized for the viewport and shared between consumers. Unused
rasters have a 12 MiB navigation-cache budget and are cleared when idle.
PDF files are read on demand; book pages release their CPU pixels after GPU
upload. Offscreen renders, old textures, and PDF decoding resources are cleaned
up. Book mode preloads neighboring spreads within a separate 24 MiB GPU cache
to make ordinary page turns immediate. Blur remains optional.
Run `npm run profile:memory` for a repeatable desktop measurement. See
[memory changes and measured results](docs/memory.md) for details and limits.
Use `npm run profile:pages` to measure click-to-turn loading delays.

To test the packaged app in PowerShell:

```powershell
$env:PDFTHING_EXECUTABLE = 'release/win-unpacked/PDFthing.exe'
$env:PDFTHING_SECOND_EXECUTABLE = 'release/PDFthing-1.0.0-Windows-x64.exe'
npm run test:desktop
```

## Controls

| Action            | Mouse / Touch                  | Keyboard            |
| ----------------- | ------------------------------ | ------------------- |
| Open PDF          | Open area or folder button     | `Ctrl+O`            |
| Next spread       | Toolbar right arrow            | `→` `Space` `PgDn`  |
| Previous spread   | Toolbar left arrow             | `←` `PgUp`          |
| Curved page turn  | Drag an outer page edge        | —                   |
| Pan in book mode  | Drag empty space; middle-drag anywhere (pages never pan) | — |
| Zoom in book mode | Mouse wheel at the pointer     | `+` / `−`           |
| Scroll mode      | Mouse wheel or scrollbar        | Native scrolling    |
| Jump to page      | Type a number in the toolbar   | —                   |
| Fullscreen        | Web toolbar button             | `F` / `F11`         |
| Zoom              | Toolbar `+` / `−` / reset      | `+` / `−` / `0`     |
| Fit and recenter  | Click the zoom percentage      | `0`                 |
| Book / scroll     | Top-strip layout button        | —                   |
| Theme             | Top-strip sun/moon button      | —                   |
| Pin on top        | Top-right pin (desktop)        | —                   |
| Replace / close PDF | Top-left folder / close      | —                   |
| First / last page | —                              | `Home` / `End`      |

PDF page colors stay faithful to the document in dark mode. Document text
is currently rasterized (no selection/search/annotations). Password-protected
files require an unlocked copy. Book mode requires WebGL; unavailable/lost
3D contexts fall back to scroll mode. Rendering is limited to nearby pages
and a bounded raster cache rather than prerendering an entire document.

## Use the library in your own project

The original CSS flipbook engine is retained for library consumers; the app
uses the new `src/app/BookRenderer.js` and `src/app/Reader.jsx` renderers.
The library is published under `./src/index.js` and the styles under
`./src/flipbook.css`.

```html
<link rel="stylesheet" href="/path/to/flipbook.css" />
<div id="my-flipbook" style="width: 100%; height: 100vh;"></div>

<script type="module">
  import { Flipbook } from '/path/to/flipbook.js';

  const fb = new Flipbook({ container: '#my-flipbook' });
  await fb.load('/path/to/your.pdf');
</script>
```

If you bundle with Vite/webpack/Rollup, the same import works:

```js
import { Flipbook } from 'pdfthing';
import 'pdfthing/style.css';

const fb = new Flipbook({ container: document.getElementById('viewer') });

// Any URL works — local path, absolute, S3 presigned URL, CDN, etc.
fb.load('https://my-bucket.s3.amazonaws.com/magazines/issue-03.pdf');
```

**Remote PDFs and CORS.** PDF.js fetches the document via XHR/fetch, so the
host (S3, CloudFront, your own server) must send permissive CORS headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET
```

For an S3 bucket, add a CORS rule that allows `GET` from your origin. For
S3 *presigned* URLs no extra setup is needed beyond the bucket CORS config.

### PDF.js worker setup

The library uses PDF.js, which runs its parser in a Web Worker. Out of the
box the worker is loaded from a CDN; for production you'll usually want to
host the worker yourself. Pass `workerSrc` once at startup:

```js
import { Flipbook, setWorkerSrc } from 'pdfthing';

// Vite / Rollup
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
setWorkerSrc(workerUrl);

// Webpack 5+ (asset modules)
setWorkerSrc(new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href);

// Or just point at a self-hosted file
setWorkerSrc('/static/pdf.worker.min.mjs');
```

You can also pass it per-instance via the `workerSrc` constructor option.

## API

### `new Flipbook(options)`

| Option           | Type                       | Default               | Notes                                                |
| ---------------- | -------------------------- | --------------------- | ---------------------------------------------------- |
| `container`      | `string \| HTMLElement`    | required              | Selector or element to mount the viewer into.       |
| `pdfUrl`         | `string`                   | —                     | If provided, you can call `load()` with no args.     |
| `renderScale`    | `number`                   | `~devicePixelRatio`   | Render scale for PDF.js. Higher = sharper, slower.  |
| `flipDuration`   | `number` (ms)              | `700`                 | Page-flip animation duration.                       |
| `enableDrag`     | `boolean`                  | `true`                | Drag a page edge to flip.                           |
| `enableKeyboard` | `boolean`                  | `true`                | Listen on `document` for arrow / page keys.         |
| `singlePageBreakpoint` | `number` (px)        | `900`                 | Below this stage width, layout switches to one-page-at-a-time with a horizontal slide. |
| `workerSrc`      | `string`                   | jsDelivr CDN          | PDF.js worker URL. Set globally with `setWorkerSrc()` or per-instance.            |

### Methods

- `await flipbook.load(pdfUrl?)` — load a PDF (returns `this`).
- `flipbook.next()` — advance one spread.
- `flipbook.prev()` — go back one spread.
- `flipbook.goTo(page)` — jump to the spread containing `page` (1-indexed).
- `flipbook.setZoom(zoom)` — set relative zoom, clamped to 0.5–2.5.
- `flipbook.setViewMode('auto' | 'single' | 'spread')` — choose a page layout.
- `flipbook.getState()` — read page, total, zoom, singlePage, atStart, and atEnd.
- `flipbook.destroy()` — tear down DOM, revoke object URLs, free PDF.

Custom UI integrations can pass `showControls: false`,
`onStateChange(state)`, and `onError(error)` as constructor options.

### How spreads work

Like a real magazine: the cover (page 1) is shown alone on the right of an
empty left half, then pages 2–3, 4–5, … pair up. If the document has an even
number of pages, the back cover sits alone on the left of the final spread.

### Responsive layout

On stage widths below `singlePageBreakpoint` (default `900px`) — phones and
tablets in portrait — the layout collapses to **one page at a time** and the
flip becomes a horizontal slide. Above the breakpoint, the standard two-page
magazine spread is shown. Mode is re-evaluated on resize, so rotating a
device or resizing the window swaps layouts on the fly and preserves the
current page.

## How it works (briefly)

- PDF rendering: [PDF.js](https://mozilla.github.io/pdf.js/) renders each
  page off-screen to a canvas, which is converted to a JPEG `Blob` and stored
  as an object URL. Pages render in priority order (cover → current spread →
  rest) so the reader can start flipping almost immediately.
- The flip itself is a single `<div>` ("the leaf") with two faces, rotated
  around the spine using CSS 3D transforms. Drag-to-flip drives the rotation
  in real time from pointer events; release-without-completion snaps back.
- Backface culling and a soft gradient on each face give the curl shadow.

## Browser support

Anything modern: Chrome, Firefox, Safari, Edge. Requires CSS 3D transforms,
`backface-visibility`, ES modules, and `ResizeObserver` — all baseline since
~2020.

## Project layout

```
pdfthing/
├── index.html         # React app entry
├── package.json
├── vite.config.js
├── public/
│   └── sample.pdf     # The bundled sample (served at /sample.pdf)
└── src/
    ├── app/           # React UI, Pretext text component, app styles
    ├── index.js       # Library entry
    ├── flipbook.js    # The Flipbook class
    └── flipbook.css   # Widget styles
```

## License

MIT.
