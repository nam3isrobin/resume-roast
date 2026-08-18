---
name: testing-resume-roast
description: How to run and end-to-end test the ResumeRoast Next.js app (dev server, GROQ_API_KEY requirements, roast flow, and API edge cases)
---

# Testing ResumeRoast

## Devin Secrets Needed
- `GROQ_API_KEY` — a real Groq API key is required for the full roast flow. Put it in `.env.local` as `GROQ_API_KEY=...` (Next.js loads it automatically for `npm run dev` / `npm run build`).

## Commands
- `npm test` — Vitest suite (mocks pdf2json and groq-sdk, no key needed).
- `npm run lint`, `npm run build` — build requires GROQ_API_KEY set (a dummy value works for build only, e.g. `GROQ_API_KEY=dummy npm run build`).
- `npm run dev` — serves on http://localhost:3000.

## Gotchas
- `src/app/api/roast/route.ts` constructs the Groq client at module load. If GROQ_API_KEY is entirely unset, ANY POST to /api/roast returns 500 (module evaluation throws) — even the missing-pdf case that should be 400. Set at least a dummy key before testing the 400 path (`curl -X POST http://localhost:3000/api/roast -F foo=bar` should return 400 `{"error":"PDF file is required."}`).
- When killing the dev server from a scripted shell, `pkill -f "next dev"` matches the shell's own bash -c command string and kills your shell. Use `pkill -f "next-server\|next de[v]"` or kill by PID.
- Create a test PDF with python3 + reportlab (`pip install reportlab`), e.g. a short fake resume; the UI only accepts `application/pdf`.
- UI flow: click the dropzone to open a native file dialog, double-click the PDF, optionally fill Job Description textarea, click "Roast My Resume". Result streams into "The Verdict" section as markdown.
- Model behavior (as of qwen/qwen3.6-27b migration): the raw `<think>...</think>` chain-of-thought streams to the user and long thinking can cause the final answer to truncate mid-sentence. Not a test-infrastructure issue; flag as an app bug if observed.
