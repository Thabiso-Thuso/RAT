# Repo Analysis Tool (RAT)

A Next.js 16 web app that ingests Git repositories (uploaded as a `.zip` containing
`.git`, or deep-cloned from a remote URL) and presents commit/file/directory/author
metrics through an interactive dashboard.

## Requirements

- **Node.js 20.9+** (Node 22 recommended)
- **npm 10+**
- **git** available on `PATH` (used for cloning and history parsing)

Check your versions:

```bash
node -v
npm -v
git --version
```

## Quick start (recommended)

From the `repo-analysis-tool/` directory, run the launcher script. It installs
dependencies if needed and starts the development server:

```bash
chmod +x start.sh   # only needed the first time
./start.sh
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

To run a production build instead:

```bash
./start.sh build
```

## Manual start

If you prefer to run the commands yourself:

```bash
cd repo-analysis-tool
npm install     # install dependencies
npm run dev     # start the dev server on http://localhost:3000
```

For a production build and server:

```bash
npm run build
npm run start
```

## Available scripts

| Command         | Description                                   |
| --------------- | --------------------------------------------- |
| `npm run dev`   | Start the Next.js development server          |
| `npm run build` | Create an optimized production build          |
| `npm run start` | Serve the production build                    |
| `npm run lint`  | Run ESLint                                     |

## Using a different port

Set the `PORT` environment variable before starting:

```bash
PORT=4000 ./start.sh
# or
PORT=4000 npm run dev
```

## Notes

- Uploaded repositories and generated history are stored under `data/repos/`
  (this directory is git-ignored).
- This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)
  to load the Geist font family.

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
