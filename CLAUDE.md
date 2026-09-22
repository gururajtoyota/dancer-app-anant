# dance-view — project constitution

A small choreography tracker for a wedding dance showcase. Single Node process,
no build step, no framework, no dependencies. Keep it that way unless there's a
strong reason not to.

## Architecture

- `server.js` — plain `http` server. No Express, no npm dependencies at all
  (see `package.json`: zero `dependencies`). Serves static files from
  `public/` and a tiny JSON API for reading/writing the data file.
- `public/yaml.js` — a hand-rolled minimal YAML parser/dumper (`MiniYAML`),
  shared verbatim between server (`require`) and browser (`<script>`). It only
  supports the subset this app's data needs: nested maps, block/flow
  sequences, quoted scalars, `\n`-escaped multiline strings. Don't reach for
  a real YAML library — the whole point is zero dependencies.
- `public/index.html` / `public/app.js` / `public/styles.css` — the entire
  frontend. Vanilla JS, no bundler, no framework. `app.js` owns one `state`
  object and re-renders from it; there's no virtual DOM or diffing beyond
  what's already there.
- `public/data/choreography.yaml` — the single source of truth for content
  (or GitHub-hosted copy of the same file, see Storage below).

### Google Drive audio/video links need special handling

Audio/video sources are typically pasted as Drive "share" links
(`https://drive.google.com/file/d/FILE_ID/view?usp=sharing`). That URL serves
an HTML viewer page, **not** a media stream — a plain `<audio src=...>` or
`<video src=...>` will fail to load it (`networkState: NETWORK_NO_SOURCE`).
Drive does support inline streaming via its own embed endpoint:
`https://drive.google.com/file/d/FILE_ID/preview`, loaded in an `<iframe>`
(Drive renders its own play/pause/waveform player inside it). This is what
`driveFileId()` + `setMasterAudio()` in `app.js` do for the "Full Show Track"
card: detect a Drive file link, extract the ID, and point an iframe at
`/preview` instead of trying to play it as a raw `<audio>` source. The plain
`<audio>` element is kept as the fallback for genuinely direct audio file
URLs (e.g. an `.mp3` hosted elsewhere). The per-number `audio`/`video` cells
deliberately still just render `<a href>` links rather than embeds — that's
existing behavior, unchanged. If per-number inline playback is ever wanted,
reuse `driveFileId()`/the iframe-embed pattern rather than inventing a new
one.

## Data contract (`show` + `numbers`)

The shape both the server (`sanitize()` in `server.js`) and client
(`normalize()` in `app.js`) agree on:

```yaml
show:
  title: string (≤120 chars, defaults to "Dance Showcase")
  subtitle: string (≤160 chars)
  theme: string (≤6000 chars) — the show's theme/script/story, free text
  masterAudio: http(s) URL — link to the complete/full show audio track
numbers:
  - id: string
    order: number (server always renumbers by array position — order in the
      YAML file IS the order)
    song: string (≤200 chars)
    duration: string, "m:ss" (only this pattern is parsed for runtime stats)
    audio: http(s) URL — that number's own track/clip
    video: http(s) URL — practice video
    status: "planned" | "rehearsing" | "ready"
    notes: string (≤500 chars)
    dancers: string[] (≤100 entries, ≤80 chars each)
```

**Both `sanitize()` (server) and `normalize()` (client) must be updated
together** whenever this shape changes — they are independent
reimplementations of the same contract, not shared code. Treat this as one
logical schema in two files. Every field also needs a matching field in the
`<template>`/DOM wiring in `app.js` if it should be editable.

### Security rule: URLs only, never raw HTML/strings, for link fields

`audio`, `video`, and `masterAudio` all go through a `safeUrl()` function
(duplicated identically on server and client) that only accepts absolute
`http:`/`https:` URLs and returns `''` otherwise. This is what stops a pasted
value from ever becoming `javascript:` or `data:`. **Any new field that will
be rendered as an `href`/`src` must go through the same pattern.** Free-text
fields (`theme`, `notes`, `song`, ...) are rendered as `.textContent` /
`.value`, never `innerHTML` — keep it that way.

## Storage: local file or GitHub

Controlled by env vars (`GITHUB_TOKEN` + `GITHUB_REPO` → GitHub-backed,
otherwise a local file at `DATA_PATH`). Saves are optimistic-locked with a
`sha` (git blob sha for GitHub, content sha1 for local) — a save that doesn't
match the current sha is rejected with 409 so concurrent edits don't clobber
each other. Any new write path must carry the `sha` through the same way
`saveData()` does.

### Full Show Track audio upload

`POST /api/upload/master-audio` (passcode-gated like `/api/data`) lets the
browser upload the show's master audio file directly into the repo instead
of pasting a link. Client (`app.js`) reads the picked file as base64 and
POSTs `{ filename, contentBase64 }`; server (`server.js`) validates the
extension against `AUDIO_EXT`, caps size at `MAX_AUDIO_BYTES` (50MB), and
writes it to `public/media/full-show-track.<ext>` — always that one
canonical filename, so a re-upload with a different extension deletes the
stale file instead of accumulating orphans. In GitHub-backed mode this goes
through the same Contents API as `saveData()` (now generalized to take a
`filePath` argument) and the response URL points at
`raw.githubusercontent.com` (a direct, range-request-capable stream Drive
can't offer — see above); in local mode it writes under `public/media/` and
returns an absolute same-origin URL. Either way the endpoint only returns a
URL — the caller still has to set `state.show.masterAudio` and hit the
normal Save flow to persist it into the YAML, same as pasting a link would.

## Editing model

- Editing is gated by a single shared passcode (`EDIT_PASSCODE` env var),
  checked via `X-Edit-Passcode` header, timing-safe compared. Not per-user
  auth — anyone with the passcode can edit anything. This is intentional for
  a small family/friends showcase; don't build out real auth for it.
- The frontend has exactly one editing mode toggle (`editing` boolean in
  `app.js`), flipped by `setEditing()`, which re-renders everything. Inputs
  are `readonly`/`disabled` when not editing; there is no separate "view"
  vs "edit" template — the same DOM is reused with attributes toggled.
- `body.editing` CSS class + `.edit-only` utility class is how edit-mode-only
  UI is shown/hidden. Follow this pattern for new editable fields rather than
  inventing a new mechanism.
- **CSS gotcha to remember**: an element's own class styling (e.g.
  `display: inline-flex`) beats the UA `[hidden]` rule once you've written
  any rule for that class, because author CSS always wins over UA styles
  regardless of specificity. Every toggleable `<a>`/`<span>` in this codebase
  (`.audio-link[hidden]`, `.video-link[hidden]`, `.master-audio-link[hidden]`,
  ...) has an explicit `[hidden] { display: none !important; }` rule for
  exactly this reason. Add one for any new element you show/hide via the
  `hidden` attribute.
- **Any free text that can run long (notes, theme, ...) must be a
  `<textarea>`, never `<input type="text">`** — a single-line `<input>`
  cannot wrap, it just truncates/scrolls. `.notes-input` (per-number notes,
  in the row `<template>`) and `.theme-textarea` (`themeText`) are both
  auto-growing textareas: `readonly` when not editing (same toggle pattern as
  everything else), styled with `resize: none; overflow: hidden;`, and
  resized via the shared `autoGrowTextarea(el)` helper in `app.js`
  (`el.style.height = 'auto'` then `= el.scrollHeight + 'px'`). Call it in
  three places for any new auto-growing textarea: (1) after the element is
  attached to the real DOM and has a value — `scrollHeight` reads 0/wrong on
  a detached node, so for per-row textareas this means *after*
  `listEl.appendChild(frag)` in `render()`, not inside `buildRow()`; (2) on
  its own `input` listener, so it grows as the user types; (3) in the shared
  `autoGrowAll()` (wired to `window.resize` and `document.fonts.ready`), so
  column-width changes or webfont loading don't leave stale heights. Also add
  `textarea` alongside `input, select` in the shared field rules in
  `styles.css` (width/font/border/padding/hover/focus/placeholder) — it's
  easy to forget and the textarea silently loses all that base styling.

## Adding a new show-level or per-number field, step by step

1. `server.js` `sanitize()` — add the field with a length/type cap. Use
   `str()` for free text, `safeUrl()` for any link.
2. `public/app.js` `normalize()` — mirror the same default/cap logic.
3. `public/index.html` — add the DOM (input/textarea/etc.), following
   existing markup patterns (`.edit-only` for edit-mode-only controls, a
   paired `-link`/`-empty` pair for optional links).
4. `public/app.js` — wire read (`render()`/`renderShowInfo()` for show-level,
   `buildRow()` for per-number) and write (an `input`/`change` listener that
   mutates `state` and calls `markDirty()`).
5. `public/styles.css` — style it, and if it's a link/optional element toggled
   via `hidden`, add the `[hidden] { display: none !important; }` override.
6. No migration step needed — `sanitize()`/`normalize()` defaults handle
   missing fields in old YAML data transparently.

## Design language

- Soft "aurora" gradient background, white rounded cards (`--radius: 14px`),
  soft shadows (`--shadow`), Fraunces serif for headings, Inter for body.
- Color tokens live in `:root` in `styles.css` — reuse `--blue`, `--pink`,
  `--muted`, `--line`, `--surface`, don't hardcode new colors unless there's
  a real reason (status colors are the one deliberate exception, inline per
  status value).
- Mobile breakpoint is `@media (max-width: 900px)` — every new layout needs a
  mobile fallback there (the row grid uses `grid-template-areas` to reflow;
  follow that pattern for new grid-based layouts).
- No comments in JS/CSS beyond the rare one explaining a non-obvious "why"
  (see the two `safeUrl` comments) — match that density, don't add
  boilerplate doc comments.

## What NOT to do here

- Don't add a build step, bundler, or framework. The zero-dependency,
  copy-paste-deployable nature of this app is deliberate (see `render.yaml`
  — it's meant to run as-is on Render).
- Don't add per-user accounts/auth — the single shared passcode is the
  intended model.
- Don't swap `public/yaml.js` for a real YAML library.
- Don't put secrets, personal contact info, or anything sensitive in
  `public/data/choreography.yaml` — it's plain-text and may be committed to
  git or a public GitHub repo depending on deployment config.
