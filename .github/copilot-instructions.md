# Copilot Instructions for `sii_automate`

## Build, test, and run commands

This repo does not define npm scripts; use direct commands:

- Install dependencies: `npm ci`
- Install Playwright browsers (needed in fresh environments/CI): `npx playwright install --with-deps`
- Generate dated rows from monthly client schedule: `node generate.js [month] [year]`
  - Defaults to current month/year when args are omitted.
- Run SII automation flow: `node main.js`
  - Today: `node main.js --today` (or `-t`)
  - Custom date: `node main.js --custom dd-mm-yyyy` (or `-c dd-mm-yyyy`)
- Run all tests: `npx playwright test`
- Run a single test file: `npx playwright test tests/example.spec.ts`
- Run a single test by title: `npx playwright test -g "has title"`

## High-level architecture

The project is a two-stage CSV-to-PDF pipeline:

1. `generate.js` reads `clients.csv` (weekly quantities per client), expands it into per-day rows, skips Sundays, and writes `output.csv`.
2. `main.js` reads `output.csv`, filters by target date (tomorrow by default), logs into SII with Playwright, creates/signs one document per client, downloads PDFs to `documents/`, merges them into `merged.pdf`, and then deletes files in `documents/`.

CI (`.github/workflows/playwright.yml`) currently validates only Playwright tests (`npx playwright test`).

## Key repository conventions

- Runtime is CommonJS (`"type": "commonjs"`). Use `require(...)` for modules; `pdf-merger-js` is loaded via dynamic `import(...)` inside the async main flow.
- Required secrets are loaded from `.env` (`RUT`, `CLAVE`, `FIRMA`); `.env.example` defines this contract.
- CSV contracts are strict and positional:
  - `clients.csv`: `alias,rut,precio,lunes,martes,miercoles,jueves,viernes,sabado`
  - `output.csv`: `alias,rut,precio,cantidad,fecha`
- Date filtering in `main.js` expects `output.csv` dates as `yyyy-mm-dd`; custom CLI input is `dd-mm-yyyy`.
- RUT handling normalizes by removing dots and splitting `rut-dv` before filling SII form fields.
- Business-specific defaults in document filling are hardcoded (`OVALLE`, `PAN`, `KG`) and should be treated as domain behavior, not generic placeholders.
