# DEAD CHANNEL

A personal blog / media site with a 1990s analogue **VHS aesthetic** — part
late-night broadcast, part surveillance dossier. Built for posting about
favorite movies, books, 35mm film photography, and stories.

The mood draws on *Twin Peaks* and David Lynch, *The X-Files*, *Archive 81*,
Jim Jarmusch, and classic film noir: red-room reds, CRT-green terminal text,
warm amber timecodes, scanlines, film grain, and a tape that never quite stops
recording you back.

> *"Recorded late. Played back later."*

## How to open it

It's a plain static site — **no build step, no server, no dependencies.**

- Just open `index.html` in any modern browser, **or**
- Serve the folder if you prefer clean URLs / want the 404 page to trigger:
  ```bash
  python3 -m http.server 8000
  # then visit http://localhost:8000
  ```

Fonts load from Google Fonts over the network; everything else (effects,
textures, noise) is generated in pure CSS/JS with no external assets. Photo
placeholders use seeded [picsum.photos](https://picsum.photos) URLs — swap them
for your own scans.

## File structure

```
index.html      Home — broadcast hero + "tape box" grid of post cards
film.html       SCREENING ROOM — movie reviews listing
books.html      THE STACKS — books listing
photos.html     THE DARKROOM — 35mm contact-sheet gallery + lightbox
stories.html    NIGHT NOTES — journal/stories listing
post.html       Single article in "case file / dossier" style (template)
404.html        NO SIGNAL — channel-not-found static page
css/style.css   The full design system (tokens, components, effects, responsive, a11y)
js/main.js      Timecode, taglines, mobile nav, TRACKING + SP/LP controls, snow, glitch
js/gallery.js   Photo lightbox (keyboard: ← → Esc, focus-trapped)
```

## Design system at a glance

- **Colours** (CSS custom properties in `:root`): `--vhs-void` base black,
  `--lynch-red` accent, `--crt-green` terminal/focus, `--vhs-amber` timecodes,
  `--vhs-cream` body text, `--tape-brown` cassette bodies.
- **Type**: Bebas Neue (wordmark), Oswald (headlines), Newsreader (reading body),
  VT323 + Share Tech Mono (timecode / UI).
- **Effects**: ambient scanlines, SVG-turbulence film grain, CRT vignette,
  chromatic aberration, blinking REC, running timecode, page-entrance tracking
  glitch, animated snow. All respect `prefers-reduced-motion`.

## Adding a new post

1. Copy `post.html` to a new file, e.g. `post-my-review.html`.
2. Update `<title>`, the `CASE FILE No.`, `.post-title`, the category `.chip`
   (`chip--film` / `chip--books` / `chip--photos` / `chip--stories`), the
   `.post-meta` line, and the body inside `.article`.
3. Optional dossier bits you can reuse: `.pull-quote` (with a `.redaction`
   span), the `.signal` reception meter, and an `.exhibit` framed image.
4. Add a card linking to it on `index.html` (copy a `.card` block, set the
   matching `cat-*` class for the spine colour) and a row on the relevant
   section page (copy a `.listing-row`, set its `cat-*` class).

## Adding a photo

In `photos.html`, copy one `<button class="frame">` block and set:

- `data-full` — full-size image URL (shown in the lightbox)
- the inner `<img src>` — thumbnail URL + a descriptive `alt`
- `data-caption` and `data-exif` — caption + faux-EXIF dossier line
- the `.frame-no` text — the film frame number (e.g. `27A`)

## Accessibility

Dark theme tuned for contrast (cream-on-black ≈ 16:1), visible green focus
rings, `aria-label`s spelling out the glyph nav, decorative effects marked
`aria-hidden`, and a full `prefers-reduced-motion` path that freezes the
animations so the site reads as a calm still image. The footer **TRACKING**
slider can also dial scanlines/grain all the way to zero for a clean read.
