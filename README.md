# Repo Analysis Tool (RAT) — Submission

This is the submission workspace. **The application lives in the
[`repo-analysis-tool/`](repo-analysis-tool/) subdirectory.**

## Quick start

From this directory, run the top-level launcher. It forwards to the app's own
`start.sh`, installing dependencies if needed and starting the dev server:

```bash
chmod +x start.sh   # only needed the first time
./start.sh
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

For a production build instead:

```bash
./start.sh build
```

## Running from the app directory

Equivalently, you can go straight into the app folder:

```bash
cd repo-analysis-tool
./start.sh
```

## Manual commands

```bash
cd repo-analysis-tool
npm install     # install dependencies
npm run dev     # start the dev server on http://localhost:3000
```

## Requirements

- **Node.js 20.9+** (Node 22 recommended)
- **npm 10+**
- **git** available on `PATH`

## More details

Full documentation — including all available scripts, custom-port usage, and
project notes — is in [`repo-analysis-tool/README.md`](repo-analysis-tool/README.md).
