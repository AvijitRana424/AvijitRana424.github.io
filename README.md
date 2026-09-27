# Avijit Rana: portfolio + Job Radar

A chalkboard-themed personal site with two parts:

- **Portfolio** (`/`): about, lately, experience & education, toolbox, 3D project wall, and a resume
  with a live PDF preview. The owner can upload a new resume version from the page.
- **Job Radar** (`/tracker/`, private): add the companies you want to watch and your target role and
  level. A Python scanner checks their career portals every morning, emails you new matches, and
  you track applications on a kanban board.

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite, framer-motion, three.js, pdf.js |
| Data / auth / files | Supabase (Postgres + RLS, Auth, Storage) |
| Scanner | Python 3 (`backend/`): Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Recruitee, Workable, custom pages |
| Automation | GitHub Actions: `deploy.yml` (Pages) and `job-fetch.yml` (daily scan, 09:00 IST) |
| Hosting | GitHub Pages ($0) |

```bash
npm install
npm run dev          # demo mode: works without any keys
npm run build        # typecheck + production build → dist/
```

- Edit content in **`src/data/profile.ts`**.
- Go live: follow **[docs/SETUP.md](docs/SETUP.md)** (Supabase project, GitHub secrets, deploy, email).
- Scanner details: **[backend/README.md](backend/README.md)**.

Dev helpers: `?only=projects` renders a single section, and `?nochrome` hides the nav and overlays.
`node scripts/shot.mjs --url … --out shots/x.png` takes screenshots with local Chrome.
