# Design Direction

This project should keep future features consistent with the current rehearsal workspace design.

## Product Feel

- Calm, precise, and confidence-building.
- Build the actual rehearsal workspace first, not a marketing landing page.
- Keep feedback useful and quiet: no loud warnings unless a user action is blocked.
- The interface should feel like a warm presentation notebook paired with a compact analysis console.

## Visual System

- Background: warm cream paper tones with very subtle texture or radial warmth.
- Primary accent: restrained coral for main actions and selected metric cards.
- Dark surface: use one focused black/dark-brown analysis panel for rehearsal metrics.
- Borders: thin hairline borders, soft shadows, card radius around 8-12px.
- Avoid decorative blobs, generic SaaS gradients, and oversized empty marketing sections.

## Typography

- Main Korean headings use a bold sans-serif feel like the captured reference.
- Current heading stack: `Avenir Next`, `Apple SD Gothic Neo`, `Pretendard`, `ui-sans-serif`, `system-ui`, `sans-serif`.
- Main headings should use heavy weight around `900`, letter spacing `0`, and short line breaks.
- Metric labels may use mono styling for a measured dashboard feel.
- Body copy stays compact and readable, with Korean line breaks preserved by `word-break: keep-all`.

## Layout Rules

- The hero first viewport pairs the title/action area with the script input workspace.
- Script writing and file import live together in the same panel.
- The YouTube reference link field sits on the white paper gap between the hero workspace and the lower analysis row.
- The dark rehearsal preview belongs below the hero beside the analysis checklist.
- Keep dark preview height aligned with the adjacent checklist when they sit in the same row.
- Do not nest cards inside decorative cards unless the container is an actual tool surface.

## Functional UI Patterns

- File import supports direct writing plus `txt`, `md`, `pdf`, `docx`, and `pptx`.
- Dashboard numbers should reflect the same data as the checklist and script input.
- If an analysis item is added, update the shared `analysisItems` list so counts and checklist stay in sync.
- Use icons in controls and analysis rows, preferably from `lucide-react`.

## Copy Tone

- Korean copy should be short, calm, and direct.
- Avoid explaining the UI inside the UI.
- Prefer phrases that sound like a quiet coach, not a chatbot or marketing page.
