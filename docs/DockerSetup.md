# Docker Setup Playbook (Static Sites)

This document is a step-by-step playbook for containerizing a **static HTML/CSS/JS site** the same way the **Valhalla Landing Page** project is set up: plain files served by **nginx** inside a small Docker image, built locally for smoke tests and in CI for production deploys.

Each step is tagged either **(AI)** or **(Human)** to indicate who performs it.

- **(AI)** steps are performed by the assistant — file creation, edits, terminal commands.
- **(Human)** steps must be performed by the user. The AI **must pause** and prompt the human with explicit instructions, then wait for confirmation before continuing.

Throughout this doc, replace the placeholders below with values for the new project:

| Placeholder | Meaning | Example (this repo) |
|---|---|---|
| `<PROJECT_NAME>` | Friendly name | `Valhalla Landing Page` |
| `<SRC_DIR>` | Directory of static files copied into the image | `src` |
| `<APP_PORT>` | Port nginx listens on inside the container | `80` |
| `<NGINX_ROOT>` | nginx document root inside the image | `/usr/share/nginx/html` |

> **Production vs local:** In production, CI builds this image and Kubernetes runs it (see [KubernetesSetup.md](KubernetesSetup.md)). You do **not** need `docker-compose` or a long-running `docker run` on the server — this playbook focuses on the **image definition** and optional local smoke tests.

---

## 0. Prerequisites (Human)

Before any AI steps, confirm Docker is available where you will build:

1. **On the deploy server** (e.g. Linux Mint with a GitHub Actions self-hosted runner): Docker Engine installed, your user in the `docker` group.
2. **For local smoke tests (optional):** Docker on your dev machine, or Docker Engine inside WSL on Windows.

> **AI prompt to human (before continuing):**
> "Please confirm Docker is installed where you plan to build images. Reply when ready."

### Optional: WSL + Docker Desktop on Windows

If you use WSL and Docker Desktop was ever installed, WSL's `~/.docker/config.json` may contain `{"credsStore": "desktop.exe"}`, which breaks `docker build` inside WSL when `desktop.exe` is not on the PATH. Fix by replacing that file with `{}` inside WSL, or use Docker Engine natively in WSL instead of Desktop.

---

## 1. Create the `Dockerfile` (AI)

Place at the repo root. Static sites need no build step — copy files into nginx's html root.

```dockerfile
FROM nginx:alpine

COPY <SRC_DIR>/ <NGINX_ROOT>/

EXPOSE <APP_PORT>
```

**This repo's actual file:**

```dockerfile
FROM nginx:alpine

COPY src/ /usr/share/nginx/html/

EXPOSE 80
```

Notes:

- `nginx:alpine` is a minimal official image (~40 MB) with sensible defaults for static files.
- ES modules (`.js` with `type="module"`) work out of the box — default nginx MIME types are fine.
- No custom `nginx.conf` is required for a single-page or multi-file static site unless you need SPA fallback routing (`try_files`) or special headers.
- External assets loaded from CDNs (Google Fonts, cdnjs, etc.) are fetched by the **browser**, not nginx — they do not need to be in the image.

---

## 2. Create the `.dockerignore` (AI)

Place at the repo root. Keeps the build context small and excludes dev-only files.

```gitignore
.git
.github
.vscode
k8s
README.md
.gitignore
.dockerignore
Dockerfile
docs
inspiration_photos
.serve-pids.txt
```

Add project-specific paths (reference photos, local scratch folders, etc.) that should not ship in the image.

**This repo's actual file** matches the list above (with `docs` optional if you add documentation after the first deploy).

---

## 3. Local smoke test (Human)

Verify the image serves your site before relying on CI.

From the repo root:

```bash
docker build -t <project-name>-local .
docker run --rm -p 8080:<APP_PORT> <project-name>-local
```

Open `http://localhost:8080/` in a browser. You should see the site; styling and JS should work (CDN assets require network access).

Stop the container with Ctrl+C.

**Valhalla example:**

```bash
docker build -t valhalla-local .
docker run --rm -p 8080:80 valhalla-local
```

> **AI prompt to human:**
> "Run the smoke test above and confirm the site loads at `http://localhost:8080`. Paste any errors if it fails."

---

## 4. How this fits into production deploy

The Dockerfile is consumed by [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml):

1. `docker build` on the self-hosted runner tags the image for GHCR.
2. `docker push` uploads it to `ghcr.io/<user>/<package>`.
3. Kubernetes pulls that image and runs it (see [KubernetesSetup.md](KubernetesSetup.md)).

You do **not** run `docker run` on the Mint box for production — k3s manages the container lifecycle.

---

## Quick checklist

- [ ] (Human) Docker available on the build host (runner or local).
- [ ] (AI) `Dockerfile` at repo root (`nginx:alpine`, `COPY <SRC_DIR>/`).
- [ ] (AI) `.dockerignore` at repo root.
- [ ] (Human) Local smoke test: `docker build` + `docker run` → site loads in browser.
- [ ] (AI/Human) Kubernetes + CI wired per [KubernetesSetup.md](KubernetesSetup.md).

---

## See also

- [Self-Hosting.md](Self-Hosting.md) — plain-language overview of the full pipeline.
- [KubernetesSetup.md](KubernetesSetup.md) — k3s, GHCR, Tailscale, GitHub Actions.
