# Deployment pipeline reconnaissance

Snapshot: 2026-08-09 17:43 PDT (2026-08-10 UTC)

Scope: read-only repository, GitHub, Railway, DNS, TLS, and public-route inspection.

Change boundary: this task did not modify application code or deployment configuration and did not manually start a deployment.

Classification used throughout:

- **FACT** — directly observed in the repository, GitHub/Railway read-only state, DNS/TLS output, or a live HTTP response.
- **ASSUMPTION** — a reasoned recommendation or inference that still needs an owner decision or a live proof.
- **UNKNOWN** — not safely knowable from the inspected evidence; do not guess.

## Current truth

- **FACT:** Railway automatically deployed merged `main` commit `c7294eb5ad65ea0545867de59be4caa553281acb` after the explicitly authorized Part 1 push. Railway deployment `ab20b74b-3cbd-4623-bf52-745a894cd2af` is `SUCCESS` with one running instance. The Railway-generated URL is <https://jimmyapp-production.up.railway.app/>.
- **FACT:** The deployment's `/health` response is HTTP 200 with `status=ok`, database and Fairy-Stockfish available, and the local Qwen runtime ready.
- **FACT:** GitHub CI for `c7294eb` also passed Backend, Frontend, and Production container jobs. Railway started and finished its deployment independently of CI; CI is not a deployment gate.
- **FACT:** `https://thejimmyapp.com` is not a usable normal HTTPS entrypoint. The apex currently resolves to GitHub Pages IPs and presents a `*.github.io` certificate that does not include `thejimmyapp.com`.
- **FACT:** Plain HTTP at `http://thejimmyapp.com/` serves the byte-for-byte `gh-pages` redirect artifact, which forwards path, query, and fragment to the Railway-generated hostname. This does not rescue normal HTTPS because TLS fails before the redirect page can load.
- **FACT:** Railway still has a `thejimmyapp.com` custom-domain object, but it now reports its traffic record as `REQUIRES_UPDATE`, ownership `verified=false`, and certificate `ISSUING` because the current apex no longer points to Railway's required target.
- **FACT:** The real frontend is built into the Railway container and served same-origin by FastAPI. GitHub Pages does not host the application bundle; it hosts only a temporary redirect.
- **FACT:** The production catalog is available at `/blocks/index.html`, but `/blocks` and `/blocks/` currently return the main SPA shell, not the catalog. The Vite rewrite covers development and preview only; FastAPI's production catch-all does not perform the same directory-index rewrite.
- **FACT:** No deploy or configuration mutation was performed during Part 2. The existing Railway watch on `main` caused the Part 1 push to deploy automatically.

For an immediate work-in-progress link, the verified URL is:

<https://jimmyapp-production.up.railway.app/>

## 1. Evidence inspected

### Repository sources

- [`railway.json`](../railway.json)
- [`Dockerfile`](../Dockerfile)
- [`docker-compose.yml`](../docker-compose.yml)
- [`.env.example`](../.env.example)
- [`frontend/package.json`](../frontend/package.json)
- [`frontend/vite.config.ts`](../frontend/vite.config.ts)
- [`frontend/src/api.ts`](../frontend/src/api.ts)
- [`frontend/src/extractionData.ts`](../frontend/src/extractionData.ts)
- [`frontend/src/socket.ts`](../frontend/src/socket.ts)
- [`backend/config.py`](../backend/config.py)
- [`backend/main.py`](../backend/main.py)
- [`backend/chesscom_matchups.py`](../backend/chesscom_matchups.py)
- [`backend/database.py`](../backend/database.py)
- [CI workflow](../.github/workflows/ci.yml)
- [production-smoke workflow](../.github/workflows/production-smoke.yml)

### Recovery material

The following local, untracked handoffs were used as historical evidence. Their prior status statements were rechecked rather than treated as current truth:

- `output/handoffs/railway-domain-access-handoff-for-jimmy.md`
- `output/handoffs/railway-owner-side-read-only-addendum-2026-07-26.txt`
- `output/handoffs/new-task-starter-reconcile-jimmy-qwen-safety-2026-07-29.txt`
- `output/handoffs/GITHUB-ISSUE-13-CUSTOM-DOMAIN-OWNER-ESCALATION.md`
- `output/handoffs/JIMMY-CODEX-THEJIMMYAPP-DOMAIN-RECOVERY.md`
- `output/temporary-domain-redirect/`

### Live read-only surfaces

- GitHub Pages configuration, latest Pages build, deployments, CI run, branch protection, and issue #13.
- Railway project/service/environment status, deployment metadata, volume state, custom-domain status, and environment-variable names. Variable values were intentionally suppressed.
- Authoritative Namecheap DNS, public resolvers, presented TLS certificates, Railway-generated HTTP routes, custom-domain HTTP/HTTPS behavior, and the deployed guest-list/replay endpoints.

## 2. How deployment works now

### Railway: the real application

```text
push to main
    |
    +--> GitHub CI (tests, lint, Vite build, Docker build)
    |
    +--> Railway repository trigger (independent; not waiting for CI)
            |
            +--> Dockerfile multi-stage build
            |      1. build React/Vite frontend
            |      2. download Fairy-Stockfish binary
            |      3. download/extract llama.cpp runtime
            |      4. install Python dependencies
            |      5. copy frontend/dist into runtime image
            |
            +--> mount persistent volume at /app/data
            +--> alembic upgrade head
            +--> uvicorn backend.main:app on $PORT
            +--> health check GET /health
            +--> generated Railway hostname
```

- **FACT:** Railway project `thorough-celebration` (`6378186b-cd41-45ef-a72a-606d46c89403`) watches repository `thejimmyapp/The-jimmy-app`, branch `main`, for service `TheJimmyapp` (`3d6ac845-fa28-4af1-9dd9-440a1907d269`) in environment `production` (`2681f126-78e5-4235-a492-51d345d798c3`).
- **FACT:** `railway.json` selects the repository `Dockerfile`, checks `/health` for up to 120 seconds, restarts on failure, and allows five retries.
- **FACT:** The live deployment uses Railway runtime V2, one SFO replica, Hobby plan, and a 5,000 MB volume mounted at `/app/data`.
- **FACT:** At the snapshot, the volume uses 3,551.74 MB (about 71%); it is `READY`.
- **FACT:** The container start command is `alembic upgrade head && uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}`.
- **FACT:** FastAPI mounts hashed frontend assets at `/assets` and its final catch-all returns an exact file when one exists, otherwise `frontend/dist/index.html`.

### Build outputs

- **FACT:** `pnpm build` runs `tsc -b` and Vite. The generated `frontend/dist/` directory is ignored by Git and rebuilt for every Docker deployment.
- **FACT:** A local production build at this snapshot produced about 2.2 MB containing:
  - `index.html`;
  - hashed JavaScript and CSS under `assets/`;
  - the standalone `blocks/index.html` catalog and its specimen images.
- **FACT:** The Docker runtime contains that `dist` directory; the GitHub Pages branch does not.
- **FACT:** The Docker build downloads a Fairy-Stockfish release binary and a pinned llama.cpp release archive over HTTPS, but it does not verify either download against a committed checksum.

### GitHub CI

- **FACT:** Pull requests and pushes to `main` run Python correctness checks, 122 current backend tests, 87 current frontend tests, ESLint, TypeScript/Vite build, and a production Docker build.
- **FACT:** The separate `Production smoke` workflow is manual (`workflow_dispatch`) and read-only.
- **FACT:** `main` has no GitHub branch protection and the repository has no rulesets.
- **FACT:** Railway deployment `ab20b74b…` began at `00:38:21Z`; GitHub CI was created at `00:38:24Z`. Railway reported success at `00:39:09Z`, before CI was the controlling release decision.

### GitHub Pages: redirect only

- **FACT:** GitHub Pages uses legacy branch publishing from `gh-pages` at `/`.
- **FACT:** `gh-pages` head is `fed184e4017ae99805e6fe5ce996e1b8f17b967b` (`Add temporary custom-domain redirect`, 2026-08-06).
- **FACT:** The branch contains only `.nojekyll`, `CNAME`, `index.html`, and `404.html`.
- **FACT:** `index.html` and `404.html` preserve the incoming path/query/fragment and redirect in browser JavaScript to `https://jimmyapp-production.up.railway.app/`.
- **FACT:** GitHub reports the Pages build as `built`, custom domain `thejimmyapp.com`, `https_enforced=false`, and source `gh-pages:/`.
- **FACT:** No repository workflow or package script updates `gh-pages`; the observed branch has one manual redirect commit.
- **FACT:** Pages is therefore not a second application deployment pipeline. It is a manually maintained redirect layer.

## 3. Custom-domain recovery state

### What broke historically

- **FACT:** Railway custom domain `thejimmyapp.com` was created on 2026-07-22 with domain ID `4e8df60a-db18-40b5-bece-d79daec5c129` and target port `8080`.
- **FACT:** By August 5, authoritative/public DNS matched Railway's requested traffic CNAME and ownership TXT, but Railway still showed ownership unverified and certificate issuance stuck in `ISSUING`. Normal TLS presented Railway's wildcard certificate and the custom host fell through to Railway's fallback routing.
- **FACT:** This was not an application-container outage: the generated Railway root and `/health` were healthy.

### What was tried

- **FACT:** The ownership TXT and traffic record were verified at authoritative and public DNS.
- **FACT:** No CAA restriction, DNSSEC delegation, or Cloudflare proxy was found.
- **FACT:** `railway domain certificate retry` was attempted but refused because retry was unavailable until the certificate reached `FAILED`; it remained `ISSUING`.
- **FACT:** The domain object was refreshed in place on August 5 while preserving port `8080`; verification and issuance did not advance.
- **FACT:** The domain was not deleted/recreated, avoiding DNS-token rotation and certificate-rate-limit risk.
- **FACT:** Ryan had `Can Edit` project membership but could not create an owner-linked Railway support request for workspace `alfaswing's Projects`; the handoff requested owner-side escalation.

### Current state: the route changed to GitHub Pages

- **FACT:** The apex now has GitHub Pages A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153` at both authoritative Namecheap nameservers and public resolvers.
- **FACT:** The previous Railway traffic CNAME is absent.
- **FACT:** The Railway ownership TXT remains present with the required value.
- **FACT:** Railway now reports the traffic record's `currentValue` empty and status `DNS_RECORD_STATUS_REQUIRES_UPDATE`, ownership `verified=false`, and certificate `CERTIFICATE_STATUS_TYPE_ISSUING`.
- **FACT:** Plain HTTP at the apex serves the exact GitHub Pages redirect artifact.
- **FACT:** HTTPS at the apex fails hostname verification because the presented certificate covers GitHub domains, not `thejimmyapp.com`.
- **FACT:** `http://www.thejimmyapp.com/` returns 301 to `https://thejimmyapp.com`; `https://www.thejimmyapp.com/` did not complete during the timed check.
- **FACT:** GitHub issue #13 remains open; its latest comment is the August 5 owner escalation and therefore predates the switch to GitHub Pages DNS.
- **UNKNOWN:** Who changed the apex from Railway's CNAME to GitHub Pages A records and whether that switch was intended as the final recovery strategy or a temporary experiment.
- **UNKNOWN:** Whether an owner-linked Railway support request was subsequently opened outside GitHub after the August 5 handoff.
- **ASSUMPTION:** Keeping both providers configured for the same custom hostname is avoidable operational ambiguity. The owner should choose one authoritative custom-domain termination path before any further DNS mutation.

Protected mail DNS—MX, SPF, DKIM, DMARC, Google verification, and nameservers—is outside the deployment repair scope and must remain untouched.

## 4. What is live on merged main

### Deployment identity

| Item | Verified value |
|---|---|
| Git commit | `c7294eb5ad65ea0545867de59be4caa553281acb` |
| Railway deployment | `ab20b74b-3cbd-4623-bf52-745a894cd2af` |
| GitHub deployment record | `5824504538` |
| Railway status | `SUCCESS`, instance `RUNNING` |
| GitHub CI | Backend, Frontend, Production container all `success` |
| Generated public URL | <https://jimmyapp-production.up.railway.app/> |

### Read-only route checks

| Route on generated hostname | HTTP | Returned by server | Interpretation |
|---|---:|---|---|
| `/` | 200 | SPA shell | React guest funnel boots here. |
| `/health` | 200 | JSON | Database, Fairy-Stockfish, and Qwen ready. |
| `/privacy` | 200 | SPA shell | Expected server fallback; client renders LegalPage after JavaScript boots. |
| `/terms` | 200 | SPA shell | Expected server fallback; client renders LegalPage after JavaScript boots. |
| `/extraction` | 200 | SPA shell | Expected server fallback; client renders ExtractionPage after JavaScript boots. |
| `/blocks` | 200 | SPA shell | **Mismatch:** client does not route this path to the blocks catalog. |
| `/blocks/` | 200 | SPA shell | **Mismatch:** directory is not mapped to its index file. |
| `/blocks/index.html` | 200 | blocks catalog | The catalog itself is present in the deployed image. |

- **FACT:** The deployed guest-list endpoint returned HTTP 200 with five matches from `players_of_interest`.
- **FACT:** The first selected match's replay endpoint returned HTTP 200 with validated Board A and Board B payloads.
- **FACT:** The deployed JavaScript contains canonical public origin `https://thejimmyapp.com` and not the generated Railway origin. Canonical links therefore point at the currently broken custom HTTPS hostname even when a user opens the working Railway URL.

## 5. Environment and runtime requirements

No secret values are reproduced here. Railway variable names were read and values deliberately suppressed.

### Present in the live Railway service

| Variable | Why it matters |
|---|---|
| `DATABASE_URL` | SQLAlchemy collaboration database; `alembic upgrade head` must succeed before Uvicorn starts. |
| `LEGACY_DATABASE_PATH` | Imported-game library storage. It must point to durable storage if imported games must survive deploys. |
| `RAILWAY_VOLUME_MOUNT_PATH` | Platform-provided persistent mount used by the default Qwen model path. Current mount is `/app/data`. |
| `FAIRY_STOCKFISH_PATH` | Engine executable path; the Docker image also sets `/app/engines/fairy-stockfish`. |
| `VITE_PUBLIC_BASE_URL` | Build-time canonical public origin. The Dockerfile default is `https://thejimmyapp.com`. |
| `CORS_ORIGINS` | Allowed HTTP browser origins for API requests. |
| `TRUSTED_HOSTS` | Accepted `Host` headers for FastAPI/Starlette. |
| `WEBSOCKET_ORIGINS` | Allowed WebSocket browser origins. |
| `CHESSCOM_USER_AGENT` | Identification sent on Chess.com requests. |
| `CHESSCOM_OAUTH_CALLBACK_URL` | Reserved callback URL; OAuth remains pending authorization. |
| `ENGINE_DEPTH`, `ENGINE_TIMEOUT_SECONDS` | Engine work bounds. |
| `ENVIRONMENT`, `ROOM_TTL_HOURS` | Runtime mode and collaboration retention. |
| Railway-provided `RAILWAY_*` variables | Project/service/environment/domain/volume metadata. |

### Proxy and guest-funnel variables currently absent from Railway

These keys were not in the live variable-name inventory, so the code defaults apply:

| Variable | Code default | Go-live meaning |
|---|---:|---|
| `CHESSCOM_MATCH_PROXY_ENABLED` | `true` | **Kill switch.** `false` makes guest list/match/replay return a controlled 503 instead of calling the undocumented callback. |
| `CHESSCOM_MATCH_TIMEOUT_SECONDS` | `12` | Per-request upstream timeout, bounded 1–30 seconds. |
| `CHESSCOM_MATCH_CACHE_TTL_SECONDS` | `900` | In-process match and guest-list cache lifetime. |
| `CHESSCOM_PLAYERS_OF_INTEREST` | curated code list | Primary guest-funnel seed usernames. |
| `CHESSCOM_GUEST_MAX_ARCHIVES_PER_PLAYER` | `2` | Per-player public archive bound. |
| `CHESSCOM_GUEST_MAX_MATCHES_EXAMINED` | `40` | Total candidate bound for one list assembly. |

- **FACT:** `.env.example` does not currently list these six proxy settings, including the kill switch.
- **FACT:** The kill switch is therefore enabled by code default in production rather than by an explicit operator decision.
- **FACT:** The service serializes its upstream JSON requests with an async lock, validates response shapes, fetches partner boards sequentially, caches successful pairs, and fails closed on unknown/malformed results.

### Other defaults that need an explicit capacity decision

- **FACT:** `QWEN_ENABLED` is absent from the live variable inventory, so the code default is `true`. `/health` reports the model/runtime ready.
- **FACT:** Qwen/job-limit variables are also absent, so current code defaults govern model URL/path, 90-second generation timeout, active-job caps, retained-record caps, and 15-minute job TTL.
- **FACT:** The 2.71 GB model is stored on the same 5 GB volume whose current use is 3.55 GB. A prior production outage was caused by a full disk.
- **FACT:** `REDIS_URL` appears in `docker-compose.yml` and README setup prose, but no active backend code reads it and it is absent from the live service. Redis is not a demonstrated requirement for current main.
- **UNKNOWN:** The backing database type and durability details of the live `DATABASE_URL`; its value was intentionally not inspected or recorded.

## 6. What the deployed guest funnel hits

### Same-origin browser path

```text
Browser at jimmyapp-production.up.railway.app
  GET /
  GET /assets/<hashed>.js and .css
  GET /api/chesscom/guest-matchups
       |
       +--> backend: Chess.com public player archive index/monthly archives
       +--> backend: undocumented callback board A
       +--> backend: undocumented callback partner UUID / board B

User selects a guest card
  GET /api/chesscom/matches/{boardAId}/replay
       |
       +--> cached validated pair when fresh, otherwise the same two sequential callbacks
```

- **FACT:** All frontend guest-funnel API URLs are relative (`/api/...`). On Railway's combined frontend/backend deployment they are same-origin, so browser CORS does not mediate these GETs.
- **FACT:** Room collaboration similarly uses `wss://<current-host>/ws/rooms/...`; `WEBSOCKET_ORIGINS` must include every actual browser origin.
- **FACT:** The backend's server-to-server Chess.com requests are not browser CORS requests. Their operational controls are the proxy kill switch, validation, timeout, sequencing, and cache.
- **FACT:** `/extraction` game inputs use same-origin `/api/chesscom/matches/{id}`. Username/profile inputs instead call `https://api.chess.com/pub/...` directly from the browser and rely on Chess.com's PubAPI CORS behavior.
- **FACT:** If the React application were served directly from GitHub Pages without a redirect or API-base change, relative `/api` and `/ws` URLs would point to GitHub Pages and fail. The current `gh-pages` artifact avoids that topology by navigating the whole browser to Railway; it does not proxy API traffic.
- **FACT:** CORS variables still matter for intentional cross-origin clients and for a future split-host frontend. The generated Railway origin and any selected custom origin must be represented consistently in `CORS_ORIGINS`, `TRUSTED_HOSTS`, and `WEBSOCKET_ORIGINS`.

## 7. Concrete release sequence for current main

Current main has already completed this sequence once through the existing automatic trigger. For a repeatable future release:

1. **FACT:** Land the intended commit on `main`. A push to `main` is the Railway deployment trigger.
2. **FACT:** GitHub CI and Railway deployment begin independently. A green CI result does not currently authorize or gate Railway.
3. **FACT:** Railway builds the Dockerfile and must have network access to the package registries plus the Fairy-Stockfish and llama.cpp release downloads.
4. **FACT:** The runtime image receives the Vite bundle, Fairy-Stockfish, llama.cpp, Python dependencies, and repository code.
5. **FACT:** Railway mounts `/app/data`, supplies runtime variables, runs Alembic, then starts Uvicorn on `$PORT`.
6. **FACT:** Railway accepts the deployment only when `/health` passes inside the 120-second window.
7. **FACT:** The generated Railway hostname becomes the immediate public surface.
8. **OWNER DECISION:** Choose and repair exactly one custom-domain termination path before advertising `thejimmyapp.com`.
9. **FACT:** Run the read-only production smoke workflow or `scripts/production_smoke.py`, then manually verify the guest list, one paired replay, `/extraction`, legal pages, collaboration/WebSocket behavior, and the intended blocks URL.
10. **OWNER DECISION:** If a release fails, either redeploy the last known-good Railway deployment or revert the bad commit on `main` and push the revert. Do not rewrite shared history.

## 8. Risks and unknowns

| Classification | Risk / unknown | Consequence |
|---|---|---|
| **FACT** | `main` is unprotected and has no ruleset. | A direct push can become production without PR review. |
| **FACT** | Railway deploys independently of CI. | A bad container can reach production before tests finish. |
| **FACT** | The custom domain is split between a Railway domain object and GitHub Pages DNS/configuration. | Normal HTTPS is broken and operational ownership is ambiguous. |
| **FACT** | GitHub Pages HTTPS is not enforced and the served certificate excludes the apex. | The redirect is inaccessible to normal HTTPS users. |
| **FACT** | Railway's required traffic CNAME is absent. | Railway cannot activate custom-host routing/certificate issuance in the current DNS state. |
| **FACT** | The deployed bundle canonically points to the broken custom origin. | Search/share canonical metadata advertises an unusable URL. |
| **FACT** | Production `/blocks` does not match development/preview routing. | The catalog link is only correct at `/blocks/index.html`. |
| **FACT** | The proxy kill switch is absent from live variables and `.env.example`; default is enabled. | Operators cannot tell from Railway configuration alone that undocumented callback traffic is active. |
| **FACT** | No safe sustained callback request rate has been established; ToS review remains open. | Guest traffic could create upstream reliability or policy risk. |
| **FACT** | Proxy/cache/job state is process-local and the deployment has one replica. | Restarts discard caches/jobs; scaling would create independent state. |
| **FACT** | Volume use is about 71%, and a prior outage was disk-full. | Model/data growth can again prevent startup or writes. |
| **FACT** | Docker downloads executable artifacts without checksum verification. | Builds are less reproducible and carry supply-chain risk. |
| **FACT** | README says to add PostgreSQL and Redis, but the live project exposes one app service plus a volume; Redis is unused in code. | Setup documentation can cause unnecessary or inconsistent infrastructure. |
| **UNKNOWN** | Whether the current database URL is external PostgreSQL or volume-backed SQLite. | Backup, migration, and rollback guarantees cannot be stated yet. |
| **UNKNOWN** | Whether port `8080` remains the intended custom-domain target after the provider switch. | Do not recreate/update the Railway domain until the owner verifies the service port. |
| **UNKNOWN** | Whether owner-side Railway support acted after August 5. | Avoid duplicate support requests until the owner account is checked. |
| **UNKNOWN** | Who authorized the GitHub Pages DNS switch and whether it should be retained. | DNS must not be changed again without an explicit topology decision. |
| **ASSUMPTION** | A single Railway-hosted origin is the lowest-complexity current architecture because the app already requires FastAPI, WebSockets, and same-origin APIs. | Owner confirmation is still required; this recon does not authorize DNS/config changes. |

## 9. Proposed go-live checklist

This is a proposal, not authorization to deploy or mutate configuration.

### Release decision

- [ ] Name the release commit and owner approver.
- [ ] Decide the advertised work-in-progress URL. Use the generated Railway URL until custom TLS is valid.
- [ ] Choose one custom-domain topology:
  - [ ] **Option A — Railway terminates `thejimmyapp.com`:** restore Railway's exact current traffic record, retain its verification TXT, remove conflicting Pages custom-domain use only after an owner-approved plan, and wait for a valid certificate.
  - [ ] **Option B — GitHub Pages terminates `thejimmyapp.com` and redirects:** keep GitHub Pages DNS, obtain a certificate that includes the apex, and accept that Pages is only a redirect—not the application/API host.
- [ ] Preserve all Google Workspace/mail DNS and nameservers.

### Repository gate

- [ ] Require the Backend, Frontend, and Production container jobs to be green before merging to `main`.
- [ ] Consider branch protection/rules requiring a PR and successful checks; do not enable it without collaborator agreement.
- [ ] Resolve the production `/blocks` direct-route mismatch or advertise `/blocks/index.html` explicitly.
- [ ] Rebuild and verify that `/`, `/extraction`, legal routes, and `/blocks` remain distinct.
- [ ] Pin/checksum external Docker build artifacts or record an explicit acceptance of that risk.

### Railway configuration gate

- [ ] Verify `DATABASE_URL` persistence and document backup/restore behavior without exposing its value.
- [ ] Verify `LEGACY_DATABASE_PATH` is on durable storage.
- [ ] Confirm volume free space and set an alert/action threshold well before full disk.
- [ ] Confirm the actual service port before changing any custom-domain object.
- [ ] Verify `VITE_PUBLIC_BASE_URL` matches the chosen public hostname.
- [ ] Verify `CORS_ORIGINS`, `TRUSTED_HOSTS`, and `WEBSOCKET_ORIGINS` contain only the intended generated/custom origins.
- [ ] Set `CHESSCOM_MATCH_PROXY_ENABLED` explicitly to the owner's chosen state.
- [ ] If enabled, explicitly set/record timeout, cache TTL, archive bound, match-examination bound, and players-of-interest list.
- [ ] Decide whether Qwen remains enabled and confirm model/data capacity on the 5 GB volume.
- [ ] Confirm engine/job limits and spending limits.

### Domain/TLS gate

- [ ] Recheck authoritative DNS, public DNS, provider status, and the presented certificate after any approved change.
- [ ] Require certificate SAN coverage for `thejimmyapp.com` without bypassing TLS checks.
- [ ] Require HTTP 200 for `/`, `/health`, `/privacy`, `/terms`, `/extraction`, and the chosen blocks URL.
- [ ] Verify `www` behavior over both HTTP and HTTPS.
- [ ] Update GitHub issue #13 with fresh evidence and close it only after normal-browser HTTPS passes.

### Deployment and smoke gate

- [ ] Push the approved merge/revert commit to `main` only after the pre-merge checks are green.
- [ ] Record the Railway deployment ID, commit SHA, start/end time, and status.
- [ ] Verify `/health` reports database and Fairy-Stockfish available; inspect Qwen status separately.
- [ ] Load the guest funnel from a clean browser session.
- [ ] Confirm five guest cards load or a controlled fail-closed message appears.
- [ ] Open one match and verify both replay boards, pockets, move navigation, and perspective.
- [ ] Verify `/extraction` game and public-profile paths and both download formats.
- [ ] Verify room WebSocket creation/join if collaboration is part of the release.
- [ ] Verify the actual public link from an external network/device.

### Rollback readiness

- [ ] Identify the last known-good Railway deployment before release.
- [ ] Prepare a non-destructive Git revert path; never force-push shared `main`.
- [ ] Preserve database/volume data during rollback.
- [ ] After rollback, repeat `/health`, root, guest list, replay, and TLS checks.
- [ ] Record the incident and exact recovered deployment/commit.

## Bottom line

- **FACT:** Regular pushes to `main` already become regular Railway deploys.
- **FACT:** The generated Railway URL is the usable show-and-tell URL today.
- **FACT:** The custom domain is still not go-live ready and is now pointed at a GitHub Pages redirect whose HTTPS certificate is invalid for the apex.
- **FACT:** Before advertising a regular custom-domain deploy flow, the owner must choose the domain provider path, make the proxy kill switch explicit, resolve `/blocks` production routing, and add a release gate so Railway does not outrun CI.
