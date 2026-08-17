# Proofweave

Proofweave is a local-first workspace for shaping deep-research questions,
reading cited reports, and keeping a durable personal library. It uses only
Google Deep Research; it does not fall back to a general model or grounded
search request.

## Run locally

Requirements: Node.js 20.9 or newer and npm.

```bash
git clone https://github.com/ASHR12/proofweave.git
cd proofweave
cp .env.example .env.local
npm install
npm run dev
```

Add your `GEMINI_API_KEY` to `.env.local`, then open
[http://localhost:3000](http://localhost:3000). The key is read only by Node
route handlers. `.env.local` and all other real environment files are ignored;
no API keys are committed.

Run the provider-free verification suite with:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

These commands do not contact Google. A paid Deep Research call occurs only
after explicit confirmation in the New Research screen.

## Architecture

`src/providers/google-research.ts` is the sole provider boundary. It starts
Deep Research agent `deep-research-preview-04-2026` through Google's
Interactions API, persists the interaction before acknowledging submission,
and then resumes, streams, or polls that same interaction. Provider credentials
never reach the browser.

Proofweave keeps the provider's cited Markdown and URL annotations as the
authoritative report. A deterministic parser derives optional summaries,
finding cards, sections, and comparison rows without fabricating missing
structure.

## Persistence and recovery

- Saved reports live in `data/reports/*.json`.
- Active and historical runs live in `data/runs/*.json`.
- Writes use a temporary file followed by an atomic rename.
- On restart, persisted active runs are reconciled with Google and resumed from
  their last event when possible. Recovery never creates a replacement paid
  interaction.
- Runtime report and run records remain ignored by Git, apart from directory
  placeholders and the public sample below.

This single-user workspace supports one Node process against its data
directories. Recovery also depends on Google's interaction-retention window.

## Included sample

`data/reports/sample-glm-5-3-vs-kimi-k3.json` is a genuine prior report
comparing GLM 5.3 and Kimi K3. It was produced by Deep Research agent
`deep-research-preview-04-2026`, not relabeled or regenerated.

The public sample preserves the report text, structured sections, and public
citation metadata. Its Google interaction ID, resume event ID, local run ID,
provider runtime status, and progress log were removed or replaced with a
stable sample ID. The original private runtime record remains outside version
control. A fresh clone loads the sanitized sample automatically; future runtime
reports remain ignored.

## Local API

- `GET /api/reports` and `POST /api/reports`
- `GET /api/reports/:id` and `DELETE /api/reports/:id`
- `GET /api/research` and `POST /api/research`
- `GET /api/research/:id`
- `POST /api/research/:id/cancel`

For optional browser screenshots, start the app and run
`npm run capture:screenshots`. Generated artifacts and downloaded exports are
ignored.
