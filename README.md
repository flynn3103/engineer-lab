# engineer-lab

The public portfolio of **Linh Trần Nhật**, Data Platform Engineer, and the lab where I write up how the systems I work with actually behave inside.

It is a static site with no build step for the pages themselves. It publishes to GitHub Pages from `main`.

## What's inside

| Page | Purpose |
| --- | --- |
| `index.html` | Home: profile, search across tours, skills and posts. |
| `tech.html` | Tech Stack index: every deep-dive tour, with search. |
| `skills.html` | Agent skills, pulled live from [`flynn3103/agent-skills`](https://github.com/flynn3103/agent-skills). |
| `blog.html` | Notes and posts (none published yet). |

### Deep-dive tours (`techstack/`)

Each system has its own folder with an interactive course. Lessons follow a Problem → Predict → Mechanism → Diagnose structure, with animated diagrams and simulations.

| System | Folder | Chapters |
| --- | --- | --- |
| Apache Spark | `techstack/spark/` | 15 |
| ScyllaDB | `techstack/scylla/` | 10 |
| Redis | `techstack/redis/` | 11 |
| Apache Kafka | `techstack/kafka/` | 12 |
| PostgreSQL | `techstack/postgres/` | 12 |
| Kubernetes | `techstack/k8s/` | 11 |
| Concurrency | `techstack/concurrency/` | 13 |
| Distributed Systems | `techstack/distributed/` | 15 |
| Database Systems | `techstack/database-systems/` | 16 |

An Operating Systems course also lives in `techstack/os/` but is not yet listed in `data/systems.js`, so it doesn't appear on the home or tech pages.

Each course's entry point is `course.html`. Lesson content lives in `course.js` and per-chapter files in `chapters/chNN.js`. Chapter numbers are zero-based in code and URLs; lessons are displayed starting at 1.

Some courses also keep a single-file, read-only archive of the original version, named `01-<system>-end-to-end.html`.

## Repository layout

```
index.html, tech.html, skills.html, blog.html   Top-level pages
assets/        Shared CSS and JS (site, lab, lesson, scene kit, thumbnails)
data/          Plain-JS content: profile, systems, tech index, skills, posts
techstack/     One folder per deep-dive tour
cv/cv.tex      Source for the CV (LaTeX)
tools/         Local helper scripts (e.g. build_cv.sh)
.github/workflows/
  pages.yml    Deploys the site to GitHub Pages
  cv.yml       Recompiles the CV PDF when cv/ changes
```

### Editing content

- **Profile and links:** `data/profile.js`.
- **Tours on the home and tech pages:** `data/systems.js`. Every tour listed there must exist under `techstack/`, or the Pages deploy fails.
- **Search index:** `data/tech-index.js`.
- **Posts:** `data/posts.js`, newest first. Shape: `{ title, date, summary, tags, url }`.
- **Skills snapshot:** `data/skills.js`. `skills.html` also refreshes it live in the browser.

## Running locally

Because the data files are plain JS rather than fetched JSON, the site also works from `file://`. For the closest match to production, serve the folder over HTTP:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deployment

- **Site:** `.github/workflows/pages.yml` runs on pushes to `main` that touch the top-level HTML, `assets/`, `data/`, or `techstack/`. It checks that the required files exist, copies them into `_site/`, and deploys. It needs **Settings → Pages → Source = GitHub Actions**.
- **CV:** `.github/workflows/cv.yml` runs when `cv/**` changes. It compiles `cv/cv.tex` with LaTeX, replaces `assets/Linh-Tran-Nhat-CV.pdf`, commits the result to `main`, and then dispatches the Pages workflow.

To rebuild the CV locally, install [tectonic](https://tectonic-typesetting.github.io/) and run:

```sh
sh tools/build_cv.sh
```

## Contact

- GitHub: [flynn3103](https://github.com/flynn3103)
- LinkedIn: [Linh Trần Nhật](https://www.linkedin.com/in/linh-tr%E1%BA%A7n-25744419a/)
- Email: trannhatlinh3103@gmail.com
- CV: [`assets/Linh-Tran-Nhat-CV.pdf`](assets/Linh-Tran-Nhat-CV.pdf)
