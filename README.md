# FM Web IDE (MVP Foundation)

A web-based IDE for FileMaker developers with two modes:

- `Layout Mode`: visual canvas editor that saves layout metadata as JSON.
- `Browse Mode`: runtime form renderer that reads the same layout JSON and works with live records.

This repository is a practical MVP scaffold aligned to the product spec.

## Tech Stack

- Next.js App Router
- TypeScript
- React
- Server route handlers for FileMaker Data API proxying
- JSON layout persistence (`data/layouts/*.json`)
- Local mock record storage fallback (`data/mock-records/*.json`)

## Implemented MVP Scope

### Layout Mode

- Drag/drop component creation: `field`, `label`, `button`, `webViewer`
- Canvas positioning with grid snap
- Move + resize interactions
- Layer (`z`) editing
- Inspector for:
  - layout metadata
  - field binding
  - control type
  - button script binding
  - web viewer URL template
- Save/load layout JSON via API

### Browse Mode

- Dynamic renderer from layout JSON
- Record navigation: first/prev/next/last
- New / Delete / Edit / Save / Cancel
- Field editing
- Script execution endpoint (`runScript`)
- Web viewer URL templating from current record

### Backend/API

- Server-side layout APIs:
  - `GET /api/layouts`
  - `POST /api/layouts`
  - `GET /api/layouts/:id`
  - `PUT /api/layouts/:id`
- Server-side FileMaker APIs:
  - `GET /api/fm/layouts`
  - `GET /api/fm/fields?tableOccurrence=...`
  - `GET /api/fm/records?tableOccurrence=...`
  - `POST /api/fm/records`
  - `PATCH /api/fm/records`
  - `DELETE /api/fm/records`
  - `POST /api/fm/scripts`
- FileMaker token login lifecycle handled server-side
- Automatic mock-mode fallback when FileMaker env vars are not set

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Default layout path:

- Layout Mode: `/layouts/default/edit`
- Browse Mode: `/layouts/default/browse`

## FileMaker Integration

Set values in `.env.local` (see `.env.example`).

When `FILEMAKER_*` vars are present, server routes call FileMaker Data API.
When they are absent, the app uses local mock JSON data to let you continue development.

### Import Native FileMaker Themes

To load installed FileMaker themes/styles into the inspector:

```bash
npm run import:themes
```

This generates a catalog at `data/filemaker-theme-catalog.json` and mirrors theme assets to `data/filemaker-themes/`.

### DDR Import + Inspector Coverage Audit

Import layouts from DDR XML:

```bash
npm run import:ddr /Users/deffenda/Downloads/Assets.xml
```

Import a multi-file DDR solution (data-separation model) from `Summary.xml`:

```bash
npm run import:ddr -- --summary /Users/deffenda/Downloads/PJ/Summary.xml
```

This creates one workspace per file (for example `assets`, `common`, `projecttracker`) under `data/workspaces/`.
Each workspace stores:
- its own layout JSON files and map
- DDR source path metadata
- solution/dependency metadata (when file references exist)

Open a workspace by adding `?workspace=<id>` to layout/browse URLs, for example:

- `/layouts/Asset%20Details/edit?workspace=assets`
- `/layouts/Home/browse?workspace=projecttracker`

Generate DDR-to-inspector mapping coverage report:

```bash
npm run audit:ddr-inspector
```

This writes `data/ddr-inspector-mapping-report.json`.

### Integration Regression Suite

Run FileMaker CRUD/find/value-list/portal regression checks:

```bash
npm run test:fm-regression
```

Notes:
- Requires `FM_INTEGRATION_TESTS=1` (set by the script).
- Uses real FileMaker config when `FILEMAKER_*` vars are present.
- Skips when FileMaker config is absent (unless `FM_TEST_ALLOW_MOCK=1` is set).

### Optional SSO (Trusted Header)

You can gate the IDE and API with reverse-proxy SSO headers:

```bash
WEBIDE_AUTH_MODE=trusted-header
WEBIDE_SSO_HEADER=x-forwarded-user
```

When enabled, requests without the trusted identity header are blocked.
Use `GET /api/auth/me` to verify the active auth mode and current user.

## Project Structure

- `app/` Next.js routes, pages, API handlers
- `components/layout-mode.tsx` Layout editor UI
- `components/browse-mode.tsx` Runtime renderer UI
- `src/lib/layout-model.ts` Shared metadata types
- `src/lib/layout-utils.ts` Layout helpers + templating
- `src/server/layout-storage.ts` Layout JSON persistence
- `src/server/filemaker-client.ts` FileMaker Data API + mock fallback
- `src/server/mock-record-storage.ts` Mock record persistence
- `data/layouts/` Saved layout JSON files
- `data/mock-records/` Mock records by table occurrence

## Next Phase Recommendations

- Add portals/tabs/popovers/card windows
- Add value list wiring for dropdown/radio/checkbox controls
- Add privilege-aware field gating based on FM account context
- Add table view mode + multi-layout navigation
- Add undo/redo and alignment guides
