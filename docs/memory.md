# Memory use

## Changes

- Visible pages share reference-counted raster canvases. Scroll view displays
  these directly, without creating a second full-size canvas for every page.
- Unused raster pixels have a 12 MiB least-recently-used cache budget. Eviction
  zeros the canvas dimensions to release its backing store immediately. Visible
  pages are protected until their last consumer releases them. The unused cache
  is emptied after 750ms without rendering, keeping it useful during navigation
  without retaining those pixels for the rest of the reading session.
- Raster resolution follows the viewport and zoom, in 768/1024/1536/2200 pixel
  buckets. Individual PDF output rasters target at most four megapixels; the
  book's drawing buffer is also capped at four megapixels and 2x device scale.
- Book mode retains the current spread, pages involved in an active turn, and
  neighboring spreads within a separate 24 MiB GPU page-cache budget.
  Superseded GPU textures are disposed once their visible meshes stop using
  them. Page textures no longer allocate mipmaps. Matte page lighting uses a
  simpler diffuse material without a global specular lookup texture.
- After a book texture uploads to WebGL, its CPU raster is released. Shared
  consumers remain protected until their own leases end. A graphics-context
  loss switches to scroll view and renders fresh pages from the PDF.
- Scroll view uses one visibility observer, a 700px lookahead, and cancels work
  for pages that leave this area. Rapid navigation cancels obsolete queued work.
- PDF decoding is serialized and uses transferable CPU image buffers instead
  of worker OffscreenCanvas/ImageBitmap surfaces. Final book rendering stays
  on WebGL. This trades some decoding speed for lower graphics memory use.
- PDF.js page resources are cleaned after painting; document-wide decoded
  resources are cleaned after the rendering queue has been idle for 750ms.
  Closing or replacing the document cancels renders, clears rasters, destroys
  its worker, and releases the book's WebGL context.
- Local PDFs use [PDF.js range transport](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDataRangeTransport.html)
  to read requested slices of the File, with automatic read-ahead disabled.
  Opening no longer creates a whole-file ArrayBuffer in the UI process.
  Outstanding FileReaders are aborted on close; read failures terminate pending
  work instead of leaving a loading indicator stuck.

The 12 MiB limit covers **unused application raster pixels**, not total app
memory. Visible pages, temporary full-size PDF image decoding, the PDF itself,
Electron, graphics drivers, and compositor buffers consume additional memory.
High zoom retains larger page rasters; returning to fit reduces them again.
Native acrylic and the existing blur toggle are unchanged.

## Measurement

Measured on Windows using Electron 44.4.0 and the bundled 33 MB `public/sample.pdf`.
The same hidden 1120x820 desktop window, default zoom, and blur enabled were used
before and after. Two cycles opened the PDF, jumped through pages 2, 4, ... 20
in book view, repeated those jumps in scroll view, switched back to book view,
and closed the PDF. The second cycle uses the same app processes.

| Stage | Private MiB before | Private MiB after | Working set MiB before | Working set MiB after |
| --- | ---: | ---: | ---: | ---: |
| Empty | 80.6 | 79.6 | 219.9 | 220.2 |
| Book, cycle 1 | 1644.6 | 663.5 | 979.9 | 562.2 |
| Scroll, cycle 1 | 1154.5 | 766.1 | 808.3 | 518.9 |
| Closed, cycle 1 | 1010.7 | 876.5 | 739.8 | 471.6 |
| Book, cycle 2 | 1625.2 | 612.3 | 1056.4 | 582.4 |
| Scroll, cycle 2 | 1381.0 | 758.8 | 843.8 | 544.6 |
| Closed, cycle 2 | 1086.9 | 888.5 | 778.3 | 476.9 |

Across these two snapshots per mode, book working set fell about **44%** and
scroll working set about **36%**. Book private memory fell about **61%**.

These are snapshots, not peak-memory measurements or a universal memory cap.
The script sums Electron process metrics; working sets can include shared
pages, and private memory is not a measurement of GPU VRAM. Renderer JavaScript
garbage collection is forced before each snapshot. Close snapshots are taken
immediately after the empty UI returns, so asynchronous worker/driver cleanup
can still be in progress. Chromium and drivers can retain allocations after
application resources are disposed. Results vary with PDF content, GPU,
display scale, and window size.

## Second optimization pass

The additional changes are on-demand local-file reads, releasing CPU copies of
uploaded book textures, and clearing idle raster caches. Blur, page raster
resolution, antialiasing, and the window design are unchanged.

Range loading reduces initial reads and resident memory; it does **not** impose
a total document-memory cap. This PDF.js version still reserves a buffer as
large as the PDF in its worker and keeps chunks it has read. Damaged PDFs may
require a full read to recover their index. Book pages may need decoding again
when revisited because their CPU copies have been discarded.

A fresh comparison against the first optimized version used the same two-cycle
scenario, adding snapshots just after opening and two seconds after the final
close. The values below average the two reading/close snapshots per mode:

| Stage | Working set MiB, previous | Working set MiB, second pass | Private MiB, previous | Private MiB, second pass |
| --- | ---: | ---: | ---: | ---: |
| First page, first open | 477.3 | 441.5 | 479.6 | 495.9 |
| Book | 567.0 | 527.5 | 665.4 | 779.9 |
| Scroll | 549.9 | 515.9 | 803.6 | 832.4 |
| Immediately closed | 496.2 | 456.7 | 906.5 | 929.7 |
| Final close, settled | 452.3 | 440.7 | 868.5 | 916.8 |

Reading working set decreased another **7% in book mode** and **6% in scroll
mode** in this run. Private allocations did **not** consistently decrease;
the GPU process accounts for most of their variation. These results support
a modest resident-memory improvement, not a reduction in every allocation
metric. The two-cycle script took about 134 seconds versus 142 seconds before;
this includes UI automation and is not an isolated rendering-speed benchmark.
Raw runs are `benchmark-results/pass2-before.json` and `pass2-final.json`.

## Page-turn responsiveness

The memory-only configuration decoded neighboring pages after each click.
Book mode now prepares the next and previous spreads while reading, uploads
them to the GPU ahead of use, and releases their CPU canvases immediately.
Once a turn starts, lookahead advances toward the destination so the following
spread can be prepared during the animation. Jumps, resizes, zoom changes, and
closing cancel obsolete preparation. Speculative render failures are retried
when the page is actually requested.

Additional cached GPU page pixels are limited to **24 MiB**, outside the
visible/turning pages. At high zoom fewer neighboring pages fit. This is an
intentional memory/speed tradeoff; the earlier tables describe the memory-only
versions. The bounded CPU cache, serial decoding, file-range reads, and resource
cleanup remain in place. Scroll lookahead was increased from 350px to 700px.

Using the same 33 MB sample, a 1120x820 headless Chromium page with a visible
page lifecycle, and two seconds of reading between turns:

| Measurement | Before preloading | With preloading |
| --- | ---: | ---: |
| First turn, click to first curved frame | 99.7 ms | 14.9 ms |
| Following five forward/back turns | 61.6–72.6 ms | 0.5–1.0 ms |
| Cold document open | 331 ms | 334 ms |

These are loading delays, excluding the intentional page-turn animation.
Initial opens, distant jumps, and clicks before lookahead finishes still need
PDF decoding; this does not promise zero loading time for every file. The first
turn includes graphics-program setup. Hidden Electron windows exhibited
one-second compositor throttling despite background-throttling flags, so their
timings were excluded from this active-page comparison.

Run `npm run profile:pages` to reproduce the browser scenario. Raw results are
`benchmark-results/speed-browser-before.json` and `speed-browser-final.json`.
The native diagnostic in `scripts/page-speed.mjs` is also available, with its
hidden-window timing limitation recorded in its output.

Run the same scenario (no visible windows):

```bash
npm run profile:memory
# Or, after building:
node scripts/memory-profile.mjs benchmark-results/custom.json
```

Results are written to the ignored `benchmark-results/` directory. The script
records per-process memory, JavaScript heap/backing storage, and DOM counts.

Regression tests in `tests/memory.spec.js` check shared storage, the unused
pixel budget, preservation of active pages, cancellation, and zero remaining
page textures/raster leases after book teardown. They also check that book
textures retain no CPU raster pixels after upload, that local files open
without a whole-file read, and that idle cleanup preserves visible pages.
The reader tests exercise rapid jumps, repeated view changes, and recovery
after a lost graphics context with real PDFs.
