<p align="center">
  <img src="public/project-icon.svg" width="96" alt="Meteor History">
</p>

<h1 align="center">Meteor History</h1>

<p align="center">
  <a href="https://github.com/MengMengCode/meteor-history/actions/workflows/build-release.yml"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/MengMengCode/meteor-history/build-release.yml?branch=main&style=flat-square&label=Build"></a>
  <a href="https://github.com/MengMengCode/meteor-history/releases"><img alt="Release" src="https://img.shields.io/github/v/release/MengMengCode/meteor-history?style=flat-square&label=Release"></a>
  <img alt="Docker" src="https://img.shields.io/badge/Docker-GHCR-2496ED?style=flat-square&logo=docker&logoColor=white">
</p>

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-22-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=111111">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white">
</p>

<p align="center">
  <img alt="SVG Cards" src="https://img.shields.io/badge/SVG-Cards-FFB13B?style=flat-square">
  <img alt="Theme" src="https://img.shields.io/badge/Theme-Light%20%7C%20Dark%20%7C%20Auto-6E56CF?style=flat-square">
  <img alt="Storage" src="https://img.shields.io/badge/Storage-JSON-4CAF50?style=flat-square">
  <img alt="Sync" src="https://img.shields.io/badge/Sync-Background-1976D2?style=flat-square">
  <img alt="Security" src="https://img.shields.io/badge/Security-Signed%20URLs-orange?style=flat-square">
</p>

Meteor History is a self-hosted GitHub repository gallery and SVG card service. It synchronizes repository and profile data on a schedule, stores star history as persistent JSON, and provides copyable image URLs and Markdown for project README files.

![text1](image/image-1.png)


## Deployment

### One-click Linux installation

Run the interactive installer as root:

```bash
curl -fsSL https://raw.githubusercontent.com/MengMengCode/Meteor-History/main/deploy.sh | sudo sh
```

The installer detects x86_64 or ARM64 on Linux with glibc 2.28 or later, downloads the matching self-contained runtime from the latest GitHub Release, verifies its SHA-256 checksum, and installs a systemd or OpenRC service. Node.js and Docker are not required on the host. It asks for the fine-grained GitHub token, the public HTTPS URL, and whether image hotlink protection should be enabled for GitHub and the deployment site. The token is stored in a root-only environment file and is never added to the command line.

When hotlink protection is enabled, SVG requests carrying a Referer are accepted only from GitHub hosts or the deployment itself. Same-origin previews on the web interface continue to work. Requests without a Referer remain available for GitHub's image proxy, while signed URLs and per-client rate limiting reduce abuse.

The public URL must already point to the server through a trusted HTTPS reverse proxy. The one-click service listens on `127.0.0.1:8666` so the application port is not exposed directly.

### Docker image

Replace `github_pat_xxx` and the example public URL, then run:

```bash
docker run -d \
  --name meteor-history \
  --restart unless-stopped \
  -p 8666:8666 \
  -v meteor-history-cache:/app/.cache \
  -e "GITHUB_TOKEN=github_pat_xxx" \
  -e "EMBED_SIGNING_KEY=$(openssl rand -hex 32)" \
  -e "PUBLIC_BASE_URL=https://stars.example.com" \
  -e "PORT=8666" \
  -e "CACHE_TTL_MINUTES=360" \
  -e "REFRESH_INTERVAL_MINUTES=360" \
  -e "EMBED_RATE_LIMIT_PER_MINUTE=120" \
  -e "API_RATE_LIMIT_PER_MINUTE=240" \
  -e "EMBED_ALLOWED_HOSTS=github.com,*.githubusercontent.com,*.github.io,stars.example.com,*.stars.example.com" \
  -e "TRUST_PROXY=false" \
  -e "INCLUDE_PRIVATE_REPOSITORIES=false" \
  ghcr.io/mengmengcode/meteor-history:latest
```

The application listens on port `8666`. Generated JSON is stored in the `meteor-history-cache` Docker volume.

### Build from source

Clone the repository:

```bash
git clone https://github.com/MengMengCode/meteor-history.git
cd meteor-history
```

Create and configure the environment file:

```bash
cp .env.example .env
```

Set `GITHUB_TOKEN`, `EMBED_SIGNING_KEY`, and `PUBLIC_BASE_URL` in `.env`, then build and start the service:

```bash
docker compose up -d --build
```

Check the container status:

```bash
docker compose ps
```

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | Yes | None | Fine-grained GitHub token used by scheduled background synchronization. |
| `EMBED_SIGNING_KEY` | Yes | None | Secret used to sign image URLs. It must contain at least 32 characters. |
| `PUBLIC_BASE_URL` | No | Request origin | Public HTTPS origin used in generated image URLs and Markdown. |
| `CACHE_DIR` | No | `.cache` | Directory used for persistent repository and star history JSON. |
| `HOST` | No | `0.0.0.0` | Network interface used by the application listener. |
| `PORT` | No | `8666` in Docker | Application port inside the container. |
| `HOST_PORT` | No | `8666` | Host port used by `compose.yaml`. |
| `METEOR_IMAGE` | No | GHCR latest image | Container image used by `compose.yaml`. |
| `CACHE_TTL_MINUTES` | No | `360` | Time before cached JSON is considered stale. |
| `REFRESH_INTERVAL_MINUTES` | No | `360` | Interval between scheduled GitHub synchronization runs. |
| `GITHUB_API_VERSION` | No | `2026-03-10` | GitHub REST API version used by the server. |
| `EMBED_RATE_LIMIT_PER_MINUTE` | No | `120` | Maximum SVG requests per client each minute. |
| `API_RATE_LIMIT_PER_MINUTE` | No | `240` | Maximum JSON API requests per client each minute. |
| `EMBED_HOTLINK_PROTECTION` | No | `true` | Enables Referer validation for SVG image endpoints. |
| `EMBED_ALLOWED_HOSTS` | No | GitHub hosts | Comma-separated Referer allowlist for SVG images. |
| `TRUST_PROXY` | No | `false` | Trusts the first reverse proxy hop when enabled. |
| `INCLUDE_PRIVATE_REPOSITORIES` | No | `false` | Includes private repository metadata and charts when enabled. |

## GitHub token setup

**Fine-grained token — least access, but a single owner.** A fine-grained token is scoped to **one** account or organization, so it cannot read repositories across different organizations. This is the best choice when the charts cover repositories under a single owner.

1. [**Create a fine-grained token**](https://github.com/settings/personal-access-tokens/new).
2. Set **Resource owner** to the account or organization that owns the repositories.
3. Set **Repository access** to the repositories you want to display, or select *All repositories*.
4. Under **Permissions → Repository permissions**, grant only **Metadata → Read-only**.

Metadata read access is the only repository permission required by the stargazers endpoint. Repositories outside the token selection are not synchronized or displayed.

## Features

| Area | What Meteor History provides |
| --- | --- |
| Repository gallery | Displays repositories from the configured GitHub account with star and fork counts, descriptions, and repository detail dialogs. |
| Star history | Generates cumulative Star History-style SVG charts from scheduled GitHub stargazer synchronization. |
| Profile cards | Generates GitHub Readme Stats-style profile cards with contribution statistics and rank information. |
| Customization | Supports multiple chart styles, custom colors, dimensions, line width, labels, markers, and light, dark, or automatic themes. |
| Sharing | Provides independent image URLs and ready-to-copy Markdown for repository charts and profile cards. |
| Data storage | Stores repository indexes, profile statistics, and star histories as JSON in a persistent cache directory. |
| Background jobs | Synchronizes data automatically on the configured interval without visitor-triggered GitHub requests. |
| Security | Includes signed image URLs, Referer controls, request rate limits, private repository filtering, security headers, and redacted server errors. |

## Technology stack

- Frontend: React 19, Vite 8, Lucide React, Inter, and the xkcd font
- Backend: Node.js 22, Express 5, GitHub REST API, and GitHub GraphQL API
- Storage: Persistent JSON files under `.cache`
- Runtime: Docker or a standard Node.js production environment
- Automation: GitHub Actions and GitHub Container Registry

## Service endpoints

| Endpoint | Description |
| --- | --- |
| `/api/health` | Service status, cache state, and background synchronization status. |
| `/api/repositories` | Cached repository gallery and GitHub profile data. |
| `/api/history/:owner/:repo` | Cached repository star history and generated share URLs. |
| `/api/embed/:owner/:repo.svg` | Repository star history SVG image. |
| `/api/profile/:owner.svg` | GitHub profile statistics SVG image. |

## Preview
![text2](image/image-2.png)
![text3](image/image-3.png)
![text4](image/image-4.png)
