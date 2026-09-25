# PDFthing: interface, interaction, and the reading experience

PDFthing gives the document nearly the entire window. A few small floating controls handle opening, appearance, navigation, and magnification. The result is a quiet reading surface: the PDF supplies the visual content, while the application supplies just enough structure to move through it comfortably.

This guide describes the current React application in `src/app`, including its Windows desktop shell. The behavior and implementation details come from the source; the explanations of why they matter are design analysis. The older, separately exported CSS flipbook library has different behavior and is outside this guide's scope.

## The first impression: one obvious next step

On launch, a spacious background surrounds a centered, softly recessed rectangle. Inside it, a large plus sits above the words **Open PDF**. The dashed outline suggests a drop target, and the entire rectangle is a button. Clicking and dropping therefore lead into the same workflow without separate screens or instructions.

The target is up to 400 pixels wide and 280 pixels tall, shrinking with the viewport. Its size makes the initial action easy to find; the surrounding empty space gives it priority without a bright promotional banner. On hover or file drag, the border and text adopt the green accent. During a drag, the wording changes to **Drop PDF**, acknowledging what the user is already doing.

There is no account screen, document library, introductory carousel, or in-workspace logo to pass through. The app opens a local file without an upload step. Its initial screen asks for exactly the thing needed to begin reading.

Once a document opens, the drop target gives way to the page and the reading toolbar appears. This is progressive disclosure in a concrete form: navigation controls arrive when there is something to navigate.

## A layout that keeps attention on the page

The interface has three stable control locations. The upper-left group contains document and appearance actions. The Windows version adds window controls at the upper right. A compact toolbar sits at the bottom center while a PDF is open.

This spatial separation reflects three different intentions: manage the reading session, manage the application window, and move around the document. Finding the next-page button never requires searching through window commands or settings.

The controls float over the workspace rather than occupying a full-width ribbon. Their surrounding containers generally let pointer events pass through; the actual controls remain interactive. In the browser, the unused top strip stays available to the canvas. In the desktop app, that strip becomes the window's drag region. Empty space therefore has a useful interaction role as well as a visual one.

Book mode centers a cover by itself, opens interior pages into spreads, and centers an isolated final page. This avoids leaving a lone cover visually stranded on one side of an otherwise empty stage. During a turn, the centering changes gradually with the animation.

## Why the interface looks soft and restrained

The light theme uses a pale gray-green background (`#e9ece9`), dark green-gray text (`#343d38`), and a muted green accent (`#527966`). The dark theme uses a charcoal-green surface (`#202322`), pale text (`#d0d8d0`), and a lighter green accent (`#99bba3`). Both themes belong to the same palette, so changing theme preserves the app's identity and hierarchy.

Soft opposing shadows make floating control groups appear slightly raised. Inset shadows make the opening target feel recessed. These small depth cues distinguish actions from background without adding heavy borders around everything. Rounded corners repeat at several scales: roughly 7 pixels on icon buttons, 12 on toolbar groups, 14 on settings, and 17 on the opening target. The repetition makes separate components feel related.

Translucent panel backgrounds and backdrop blur add separation while allowing the workspace to remain visually continuous. The control groups use 20-pixel blur; settings use 24-pixel blur. On supported Windows systems, native acrylic extends this material treatment to the window background, with a subtle CSS grain and top-down sheen. The grain helps break up flat-looking gradients and banding.

The glass setting can replace these translucent panels with solid raised surfaces. Appearance is therefore adjustable to the reader's environment and taste. Dark mode changes the application chrome while retaining the PDF's own page colors, preserving the meaning of diagrams, photographs, and document typography.

Segoe UI, with Arial and sans-serif fallbacks, gives the small interface labels a familiar desktop character. Most labels use 11–13-pixel text. Icons use a common 24-unit SVG coordinate system, a 1.65-unit stroke, and rounded caps and joins. Most toolbar icons render at 17 pixels inside 32-by-30-pixel buttons. The consistent weight and spacing keep a row of unrelated actions visually calm.

Hover adds a soft background and stronger foreground color. Keyboard focus adds a visible accent outline. Disabled controls fade to 28% opacity, and an active pin gains accent color and inset shading. These states communicate availability and selection without changing the layout.

## Every visible button and what it contributes

### Opening and the upper-left controls

| Control | Current behavior and presentation | Why the choice matters |
| --- | --- | --- |
| **Open PDF** target | A large plus and short label inside the central dashed rectangle; opens the file chooser. Files can also be dropped into the app. | The first action is broad, easy to identify, and available through two familiar input methods. |
| **Folder / Open PDF** | A persistent folder icon at the upper left. With a file open, its accessible label and tooltip include the filename. | Opening another document stays available throughout reading. The filename remains discoverable without a permanent title taking space from the page. |
| **Close PDF** | An X beside the folder, visible while a file is present, including during opening. Returns to the empty state. | The user can end a reading session or cancel an import without closing the application. Its location ties it to the document. |
| **Sun / moon** | Shows the action available next: a sun for switching to light mode, a moon for switching to dark mode. | A common environmental adjustment takes one click. The icon and tooltip describe the destination of the action. |
| **Book / scroll view** | Appears after loading. Stacked-page imagery offers scroll view; a spread icon offers book view. | Two reading styles share one location and one document. The icon previews the layout the user can switch to. |
| **Settings** | A gear opens a small modal dialog and exposes its expanded state to assistive technology. | Less frequent appearance adjustments have a predictable home without lengthening the reading toolbar. |

Closing the PDF and closing the window use the same familiar X symbol, but their positions and labels establish different scopes. The document action lives beside Open PDF; the application action lives with the Windows controls.

### The bottom reading toolbar

The toolbar follows the reading task from left to right: move backward, inspect or enter a page number, move forward, then adjust the view. A thin divider separates navigation from magnification. Related controls remain close together, reducing both visual search and pointer travel.

| Control | Current behavior and presentation | Why the choice matters |
| --- | --- | --- |
| **Previous page** | A left chevron. Moves one spread in wide book mode or one page in single-page and scroll modes. Disabled at the beginning. | Direction is immediately recognizable, and the disabled state explains the document boundary. |
| **Page number and total** | An editable number followed by `/ total`. Enter commits by moving focus out; leaving the field also commits. Values are rounded and clamped to the document range. | Position feedback also provides direct navigation. A separate jump dialog or Go button would add steps to the same operation. |
| **Next page** | A right chevron with the corresponding forward behavior. Disabled at the end. | Symmetry around the page field makes forward and backward movement easy to learn. |
| **Zoom out** | A minus divides zoom by 1.2, down to a 35% minimum. | Proportional steps produce a consistent relative change at different magnifications. |
| **Zoom percentage / Fit to window** | Displays current relative zoom and is itself clickable. In book mode, resets to 100% and recenters. In scroll mode, restores the default page-column width. | The current view state also offers a recovery action. After exploring a detail, the reader can return to a known scale without repeated minus clicks. |
| **Zoom in** | A plus multiplies zoom by 1.2, up to a 400% maximum. | It mirrors zoom out and provides a visible alternative to wheel zoom or keyboard shortcuts. |
| **Fit to screen** | A page framed by vertical marks. In book mode, performs the same reset as Fit to window. In scroll mode, calculates a zoom that targets fitting the current page's height, within the zoom limits, and resets horizontal scrolling. | Width-based reading and seeing a complete page are different needs in scroll mode. The dedicated button makes whole-page recovery discoverable. |
| **Fullscreen** | Outward corner marks, shown in the browser when fullscreen is supported. | A standard symbol offers more reading space. Desktop users have their window controls and fullscreen keyboard command. |

The percentage is relative to the reader's fitted layout; it does not promise physical print size. In a wide book spread, the counter reports the first page of the spread. Jumping to page 3 can therefore display the 2–3 spread with `2` in the counter. This follows the spread model used by the renderer.

### Desktop window controls

| Control | Current behavior and presentation | Why the choice matters |
| --- | --- | --- |
| **Always on top** | A pin with a persistent pressed state when enabled. | Reference material can stay visible beside another task, and the active styling makes the unusual stacking behavior understandable. |
| **Minimize window** | A horizontal line. | Preserves a familiar Windows action in the custom frame. |
| **Maximize / Restore window** | Changes between a square and overlapping-window imagery as the state changes. | The icon describes the next action and gives the reader a quick way to alternate between focused and side-by-side use. |
| **Close window** | An X at the far right; turns red with white foreground on hover. | Its conventional location and stronger feedback distinguish ending the application from routine reading actions. |

Desktop window buttons are normally 39 pixels wide, slightly wider than the other icon buttons. The top strip can be dragged to move the window; double-clicking its empty area maximizes or restores it. Buttons are excluded from the drag region so clicking one does not move the window. Window corners become square when maximized or fullscreen, matching the window's new relationship to the screen edges.

### Settings and recovery controls

| Control | Current behavior and presentation | Why the choice matters |
| --- | --- | --- |
| **Close settings** | An X in the dialog header, focused when the dialog opens. Escape and clicking outside also dismiss the dialog. | A temporary adjustment has an immediate, familiar exit. |
| **Theme selector** | A labeled native select with Light and Dark options. | Settings gives an explicit text alternative to the compact sun/moon shortcut. |
| **Glass background / Glass panels** | A labeled checkbox exposed as a switch. The label reflects whether the native backdrop is supported. | The setting describes what the current environment can actually change. |
| **Background opacity** | A 0–100% slider in 5% steps, with a live numeric value. Available with supported desktop backdrops and disabled when glass is off. | Transparency can be tuned while preserving feedback. Disabling an inapplicable adjustment explains its dependency. |
| **Dismiss message** | An X inside the error toast. | A recoverable problem can be acknowledged without restarting or covering the document with a large blocking dialog. |

Settings changes take effect immediately, so there is no Save or Apply button. Theme, layout, glass, and opacity preferences persist locally. The PDF itself and its reading position are not restored across application sessions.

## Canvas conventions: predictable gestures and clear recovery

Book mode behaves like a manipulable reading surface. Scroll mode behaves like a vertically scrolling document. The shared toolbar ties them together, while mouse behavior follows the selected layout.

| Intention | Book mode | Scroll mode |
| --- | --- | --- |
| Read forward or backward | Click the page, drag it, or use the navigation arrows. | Scroll normally or use the navigation arrows. |
| Use the mouse wheel | Zoom around the pointer. | Move through the document using native scrolling. |
| Pan an enlarged page | Left-drag empty space or middle-drag anywhere, including over paper. | Use the native scroll container and its scrollbars. |
| Change magnification | Wheel, plus/minus buttons, or keyboard shortcuts. | Plus/minus buttons or keyboard shortcuts. |
| Recover a useful view | Click the percentage or Fit to screen to reset and recenter. | Restore default width with the percentage, or target the page height with Fit to screen. |

On paper, a primary-button gesture belongs to turning the page. It does not unexpectedly become a pan at the first or last page or when a modifier is held. Middle-drag provides an explicit way to pan over paper. This distinction prevents the same gesture from switching meanings merely because the reader reached a boundary.

Although an outer-edge drag is the natural book metaphor, the implementation accepts a primary click or drag anywhere on the visible page. The right side requests a forward turn; the left side requests a backward turn. A click completes the turn. A drag completes after passing 32% of the turn progress; releasing earlier returns the sheet. Pointer capture keeps a gesture connected to its starting surface when the pointer moves outside it. Cancellation returns the interaction to a settled state.

Cursor feedback reinforces the rules: a pointer over turnable paper, a default cursor at an unavailable turn, a grab cursor over empty space, and a grabbing cursor during panning.

Wheel zoom normalizes pixel-, line-, and page-based wheel deltas, then applies a smooth exponential scale change. Pan is adjusted around the pointer's location so the inspected area stays near the cursor. This matters when the reader is trying to examine a small diagram or a line of text: magnification should not force them to search for it again.

The keyboard supplies the same core operations:

| Key | Action |
| --- | --- |
| `Ctrl+O` / `Cmd+O` | Open a PDF. |
| Left / right arrow | Previous / next page or spread. |
| `Page Up` / `Page Down` | Previous / next spread in book mode; native behavior in scroll mode. |
| `Space` | Next spread in book mode, unless a button has focus; retains native behavior in scroll mode. |
| `Home` / `End` | First / last page. |
| `+` or `=` / `-` | Zoom in / out. |
| `0` | Fit to screen. |
| `F` with a document open, or `F11` | Toggle fullscreen. |

Reader shortcuts avoid intercepting text entry, and application shortcuts are suspended while settings is open. These boundaries matter as much as the shortcuts themselves: typing a page number should remain typing, and interacting with a dialog should not turn a page behind it.

## Motion, responsiveness, and continuity

The book animation uses a flexible sheet with separate front and back page textures. A 64-by-12 subdivision grid bends across an arc. Curvature rises during the turn and relaxes as the paper lands; a small corner variation makes the movement less rigid. The geometry preserves arc length along the sheet's width, avoiding artificial stretching of the printed content while still allowing perspective foreshortening.

Matte lighting communicates the changing shape, while a corrected back-face texture keeps text readable after the sheet turns. Anime.js uses a sine ease for settling the motion. A full automatic turn takes about 850 milliseconds; a partially completed gesture settles over a shorter duration, with a 180-millisecond floor. This makes release feel like a continuation of the drag.

Reduced-motion preferences remove the animated settling duration and greatly shorten CSS transitions and animations. The page can still respond directly to an active drag. The preference changes how motion is presented without removing access to navigation.

Below 650 pixels of workspace width, book mode displays a single page. This protects reading size in narrow windows. Below 500 pixels, outer control spacing tightens as well. A resize recalculates the fitted book dimensions and adapts the layout around the current page.

Switching between book and scroll keeps the current page as the destination. A wide book spread can report its first page even if the requested page is the second page in that spread. Zoom and pan reset when a different view mounts; the app preserves document location, rather than an exact geometric viewport shared between two different layouts.

Scroll pages are separated by 20-pixel gaps and soft shadows. A visible native scrollbar gives both movement and document-length context. The current-page indicator updates from a reference point 30% down the viewport, so it tracks the region being approached as the reader moves through the stack.

## The tools that produce the appearance

| Tool or technique | Its role in this app | Why it fits the experience |
| --- | --- | --- |
| **React and React DOM** | Compose the controls, settings, document states, and view switching. | Button availability, labels, and page feedback follow the same application state. |
| **NeumorUI and GlassKit styles** | Their CSS is imported before the app's own stylesheet. | They supply the styling foundation; the app's explicit CSS overrides define the actual palette, spacing, blur, shadows, and control geometry described here. These are native React/HTML controls with local styling, not an assumed library widget set. |
| **Custom CSS and CSS variables** | Define light/dark tokens, floating panels, interaction states, responsive spacing, and reduced-motion behavior. | Shared variables keep every panel and control visually consistent when the environment changes. |
| **Custom inline SVG icons** | Draw the folder, arrows, theme symbols, settings, and window controls. | A shared stroke system scales cleanly and inherits theme colors without loading an icon font. |
| **Pretext** | Prepares UI text measurements and computes line breaks; React displays ordinary selectable text spans. Preparation is memoized, and wrapping labels observe their width. | Short labels remain compact while error messages and notes can wrap to their available space. PDF page text is handled separately. |
| **PDF.js and its locally bundled worker** | Parse PDFs and rasterize requested pages. | Document rendering does not depend on a remote conversion service or remote worker script. |
| **Three.js / WebGL** | Display book pages as textures and deform the turning sheet. | The visual book metaphor is implemented as geometry that can respond to the pointer. |
| **Anime.js** | Animate turn progress and settling. | Programmatic navigation and released drags use the same motion behavior. |
| **Native browser APIs** | Supply dialogs, file selection, pointer capture, fullscreen, resize observation, and visibility observation. | Familiar platform behavior supports the custom visual design. |
| **Electron and Windows acrylic** | Provide the frameless desktop window, native window actions, file-open integration, and supported background material. | The desktop app can participate in normal window management while retaining the same reading UI. |
| **Vite and Playwright** | Bundle the app and worker; exercise the interface and rendering behavior. | Packaging and regression checks help keep the delivered experience consistent with the design. |

## Canvas optimizations are part of the user experience

A visually simple reader can still be expensive to render. PDF decoding, canvas pixels, GPU textures, and transparent window composition have separate costs. PDFthing limits work at several points so that the quiet interface is supported by a responsive rendering path.

| Implementation decision | What it does | Why the reader benefits |
| --- | --- | --- |
| **Load rendering code when needed** | Dynamically imports the PDF document code after file selection and the book renderer when book view mounts. | The empty interface can start without initializing the document or 3D machinery. |
| **Read local files on demand** | Uses PDF.js range requests with a 64 KiB chunk setting; disables automatic fetching and streaming. | Opening avoids first making an extra whole-file buffer in the UI process. Native Windows file opens use the same range-based document path. |
| **Size rasters to the view** | Selects 768, 1024, 1536, or 2200 pixels for the longest edge, based on viewport, zoom, and display scale, with a four-megapixel raster target limit. | Pages receive useful detail without always paying for maximum-resolution output. Resolution buckets also reduce repeated rendering for tiny size changes. |
| **Cap the WebGL drawing buffer** | Limits device scale to 2x and drawing-buffer area to roughly four megapixels. | Large or dense displays cannot expand the main render surface without a bound. Antialiasing remains enabled. |
| **Respond to zoom immediately, refine after settling** | Transforms existing book textures immediately, then checks for a new resolution after 180 milliseconds. | Wheel interaction feels connected to the hand without decoding a new PDF raster on every wheel event. |
| **Draw when the scene changes** | Renders for page loads, transforms, and animation updates; there is no permanent idle book-render loop. | A reader paused on a page does not need the 3D scene redrawn continuously by the app. |
| **Share raster storage** | Consumers acquire reference-counted page canvases. Scroll mode displays its acquired canvas directly. | The same page does not need a second full-size pixel copy simply to appear in the scroll layout. |
| **Bound unused CPU rasters** | Keeps unused rasters within a 12 MiB least-recently-used budget and clears unused pixels after about 750 milliseconds of rendering inactivity. | Short navigation sequences can reuse work while settled reading releases unnecessary storage. Visible pages stay protected by their active leases. |
| **Prepare neighboring book spreads** | Preloads adjacent spreads after the current view paints, with a separate 24 MiB budget for extra GPU page pixels. | Ordinary turns can begin with page textures already available. At high zoom, fewer pages fit the budget, keeping the speed/memory tradeoff controlled. |
| **Release CPU copies after upload** | Discards book raster pixels once WebGL owns the texture data. Disables texture mipmaps and uses simple matte materials for the sheet. | Book pages avoid retaining duplicate CPU pixels and unnecessary texture structures. |
| **Render only nearby scroll pages** | One IntersectionObserver uses a 700-pixel lookahead around the scroll viewport. Distant page containers remain, but their raster work is released or canceled. | The next pages can be ready before they enter view without rasterizing an entire long PDF. This is lazy raster rendering, not full DOM virtualization. |
| **Serialize PDF decoding** | Runs one page render at a time and avoids worker OffscreenCanvas/ImageBitmap allocations in this path. | Large scanned-image decode buffers overlap less, reducing memory pressure at the cost of some parallel decoding speed. |
| **Cancel obsolete work** | Aborts unneeded renders and preloads, rejects stale results, and delays disposing old textures until visible meshes stop using them. | Rapid jumps, zooms, and view changes do not need to finish every abandoned request or display a stale result. |
| **Clean up after reading** | Releases page decode resources, idle document resources, timers, observers, textures, canvases, and the book's WebGL context when appropriate. | Replacing or closing a PDF ends its active rendering lifecycle instead of leaving the old reader running behind the new one. |

These budgets apply to specific application caches, not total process memory. Active pages, PDF decoding, worker storage, Electron, graphics drivers, and compositor surfaces have additional costs. The 2200-pixel raster ceiling also means very high zoom can enlarge existing detail beyond its native resolution. The design makes deliberate quality, speed, and memory tradeoffs.

The repository's [memory and page-turn measurements](memory.md) document those tradeoffs. In its recorded sample scenario, preloading reduced first-turn loading delay from 99.7 ms to 14.9 ms, and subsequent measured turns from 61.6–72.6 ms to 0.5–1.0 ms. Those are previously recorded loading delays before the intentional animation, not universal guarantees or new measurements from preparing this guide.

## How the whole reading journey connects

The opening target establishes one clear entry. File validation catches multiple files, non-PDF files, and empty files with short messages. A loading ring acknowledges document opening. The persistent close-document action gives the user a way out while work is underway.

When the page appears, the interface changes in place: the opening target is replaced by the reader, the layout switch becomes available, and the bottom toolbar supplies position and navigation. There is no dashboard-to-editor transition to learn. The user is still in the same workspace, now populated with their document.

Reading proceeds through visible buttons, direct page interaction, or keyboard shortcuts. Neighbor preloading supports the rhythm of successive turns. Pointer-centered zoom supports inspection, and fit controls provide recovery. The reader can change appearance or reading layout without reopening the file; the retained page provides continuity through a mode switch.

Recovery follows the same restrained visual language. Invalid or unreadable files produce dismissible messages. Password-protected files request an unlocked copy. An individual scroll-page failure appears in that page's area. If 3D rendering is unavailable or its context is lost, the app switches to scroll view and reports the problem, preserving a route to the document.

Replacing a PDF uses the familiar folder or drop interaction and starts the new document at page 1. Dropping while reading adds a large **Drop PDF** overlay so the pending replacement has visible feedback. Closing returns to the original opening surface, ready for the next file. On Windows, opening a PDF through the operating system routes into the existing application window, extending that same entry path beyond the app itself.

The sense of flow comes from those connected transitions: each state presents the next useful action, retains the context it can preserve, and offers a short route back to a comfortable reading view.

## What makes the flow strong, and where the claim has limits

The strongest case for this experience is its consistency. The page dominates; controls keep stable positions; related actions share a visual language; gestures have defined ownership; and expensive rendering work is aligned with what the user is approaching. Simplicity is supported by both the interface and the resource lifecycle underneath it.

Calling any interface perfectly flowing for every reader would require user research beyond the implementation. The current design has specific boundaries: icon-only controls need discovery, small muted controls may be harder for some readers to use, and the two fit actions are less obviously distinct than their internal behavior. The percentage tooltip mentions `0`, but that shortcut actually invokes Fit to screen, which differs from the percentage action in scroll mode.

Accessible names, native buttons, visible keyboard focus, modal dialog behavior, status announcements, and reduced-motion support improve access to the controls. They do not make the rasterized PDF content an accessible text document. The app currently has no selectable PDF text layer, search, or annotation tools, and it does not implement a dedicated pinch-to-zoom gesture. These are meaningful scope limits when describing the intended audience.

For opening a local PDF, browsing its pages, adjusting the view, and moving smoothly into the next document, the interface offers a coherent end-to-end path. Its decisions matter because they repeatedly return attention to the same central task: reading.

## Source and verification notes

The guide was checked against [App.jsx](../src/app/App.jsx), [styles.css](../src/app/styles.css), [Settings.jsx](../src/app/Settings.jsx), [Icon.jsx](../src/app/Icon.jsx), [Text.jsx](../src/app/Text.jsx), [main.jsx](../src/app/main.jsx), [Reader.jsx](../src/app/Reader.jsx), [BookRenderer.js](../src/app/BookRenderer.js), [PdfDocument.js](../src/app/PdfDocument.js), [raster.js](../src/app/raster.js), [FileTransport.js](../src/app/FileTransport.js), and the [desktop shell](../desktop/main.cjs).

Three existing Playwright reader checks passed while preparing this document: the minimal interface and mouse navigation; native scrolling, zoom, and retained position; and narrow-screen navigation with reduced motion and dragging. Generated light-book, dark-empty, and mobile-book screenshots were inspected. Desktop behavior was reviewed in source; this documentation pass did not run the desktop test suite or conduct an accessibility or usability audit.
