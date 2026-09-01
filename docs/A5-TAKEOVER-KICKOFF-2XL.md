# A5 kickoff — takeover, evidence reconciliation, and fresh deployment

Status: **ACTIVE**

Owner: Ryan

Operating mode: evidence first, one bounded change at a time

Supersedes: `docs/A5-KICKOFF.md` as the next task; the former UI-library task is parked

## Command

Take control of TheJimmyApp from the current GitHub `main`, prove the handoff
against the repository, establish a clean local golden build, and prepare one
fresh Ryan-owned deployment. Do not revive or transfer Jimmy's expired Railway
project. Do not begin UI-library work until this task's gates pass.

## Why this is the correct A5

The immediate problem is no longer visual direction. The public application is
offline, infrastructure ownership is split, historical production data is only
partially replaceable, and Jimmy has now supplied a source-reconstruction
handoff. Product work performed before source, runtime, and data custody are
settled would create another private sandbox rather than restore momentum.

The target state is deliberately narrow:

> Ryan controls the canonical repository and a fresh deployment; a clean checkout
> passes the verified test/build gates; the live generated URL passes smoke tests;
> persistence is backed up; and every unrecovered feature or record is named.

That is “everything synced” for this recovery phase. A custom domain and visual
redesign are subsequent gates, not part of the first proof.

## Executive decisions already made

1. **Accept a fresh deployment.** Do not pay for two Railway memberships or
   transfer Jimmy's old Railway project.
2. **Preserve the old volume deadline as a contingency, not a plan.** Until the
   reported October 12 deletion date passes, do not claim its unique records are
   recovered. Reconsider only if a specific irreplaceable record is identified.
3. **Use current GitHub `main` as the software baseline.** Historical commits are
   evidence and component sources, not a branch to merge wholesale.
4. **Deploy one instance first.** Current live room state is process-local;
   horizontal scaling is unsafe without a new shared coordination layer.
5. **Disable Qwen for launch.** It adds a 2.71 GB model, RAM/cold-start pressure,
   and no core tactical authority. Deterministic coach evidence remains available.
6. **Use fresh databases for the first live proof.** Keep all old SQLite files
   read-only. Do not swap a database under a running process.
7. **Use the provider-generated hostname first.** Move `thejimmyapp.com` only
   after health, replay, WebSocket, persistence, and restart tests pass.
8. **Treat the quick-phrase panel as new specified work.** The screenshot is a
   strong interaction concept, but its exact implementation is absent from all
   fetched Git refs. Do not pretend it is recovered.
9. **Pause UI research and Evan onboarding.** Resume both after the deployment
   baseline is under Ryan's control. Evan remains optional, never critical path.
10. **Do not request more reassurance or infrastructure work from Jimmy tonight.**
    His handoff is received. Discrepancies belong in the evidence ledger, not a
    live emotional negotiation.

## Required reading

Read completely, in order:

1. `AGENTS.md`
2. `ROBOT-HUB.md`
3. `docs/CURRENT-HANDOFF.md`
4. `docs/ROBOT-DOCKET.md`
5. `output/recovery/2026-08-12-to-31-timeline-consolidation.md`
6. `output/recovery/LOCAL-DATABASE-BACKUP-AUDIT-2026-08-31.md`
7. `output/recovery/incoming-jimmy-2026-08-31/THEJIMMYAPP_FINAL_RECONSTRUCTION_HANDOFF.md`
8. `output/recovery/incoming-jimmy-2026-08-31/THEJIMMYAPP_FEATURE_ARCHAEOLOGY.json`
9. `output/recovery/incoming-jimmy-2026-08-31/message.txt`

The `output/` evidence is local/private unless deliberately promoted. Do not add
database files, credentials, tokens, account exports, or private conversation
screenshots to Git.

## Evidence classification

### Verified locally on receipt

- Repository `HEAD` is `7bf611cad4de57f5a9b9122aeebea4565c2d495e`.
- The reconstruction handoff names that same audited commit.
- The archaeology JSON is syntactically valid and contains 27 feature records:
  19 `PRESENT_CURRENT_MAIN`, five `PARTIALLY_PRESENT`, one `RECONSTRUCTIBLE`, one
  `REMOVED`, and one `UNKNOWN`.
- Every commit named by the archaeology JSON resolves in the fetched repository.
- Every source and test path named by the archaeology JSON exists in this checkout.
- SHA-256 hashes for all received artifacts are recorded in
  `output/recovery/incoming-jimmy-2026-08-31/MANIFEST.md`.

### Credible claims that A5 must reproduce

- Backend: 179 tests pass.
- Frontend: 42 files / 202 tests pass.
- ESLint passes.
- The production frontend build passes.
- A Docker build produces a runnable FastAPI/React image with Fairy-Stockfish.
- Fresh SQLite bootstrap creates both collaboration and legacy schemas.
- The supported Chess.com path can resolve a real paired Bughouse replay.
- A two-browser room supports WebSocket join/synchronization on one instance.

### Explicitly unproved or unavailable

- Exact final contents of the old Railway volume.
- Any user-authored records created after the available local snapshot.
- Long-term reliability or official support for the undocumented Chess.com
  callback endpoint.
- The exact quick-phrase catalog, colors, and interaction behavior.
- Production-grade account verification and recovery.
- Safe multi-instance room synchronization.

### Artifact defect

The received `message.txt` is **not** the advertised takeover/rebuild prompt. It
is an older Railway-status audit that describes an active service, pending invite,
and DNS state from July. Preserve it as historical evidence, but do not execute it
and do not treat its infrastructure statements as current.

## Phase 0 — preserve and freeze

### Commands

```bash
cd /Users/user/Documents/4robots/thejimmyapp
git status --short
git rev-parse HEAD
shasum -a 256 output/recovery/incoming-jimmy-2026-08-31/*
```

### Rules

- Preserve the dirty working tree. Do not reset, checkout, clean, or stash it.
- Do not modify Jimmy's Railway project, billing, volume, deployment, or DNS.
- Do not delete or open old SQLite files for writing.
- Do not commit `output/recovery/` or `data/*.db`.
- Work in a clean worktree or fresh clone for validation and deployment prep.

### Gate 0

Pass only when the incoming files exist, hashes match the manifest, the current
Git SHA is recorded, and the dirty tree has not been altered.

## Phase 1 — reconcile the handoff against source

### Commands

Create a clean worktree from the exact audited commit:

```bash
git fetch origin --prune
git worktree add /Users/user/Documents/Jimmys-App-a5 7bf611cad4de57f5a9b9122aeebea4565c2d495e
cd /Users/user/Documents/Jimmys-App-a5
git status --short
```

Then validate the archaeology mechanically:

```bash
jq empty /Users/user/Documents/4robots/thejimmyapp/output/recovery/incoming-jimmy-2026-08-31/THEJIMMYAPP_FEATURE_ARCHAEOLOGY.json
git log --all --oneline --decorate -n 30
rg -n "quick.phrase|coordination|sit.*timing|piece.*feed|defense.*danger|attack.*pressure" .
rg -n "QWEN_ENABLED|LEGACY_DATABASE_PATH|DATABASE_URL|RoomHub|partnerGameId" backend frontend thejimmyapp
```

Produce an evidence ledger with one row per important claim:

| Serial | Claim | Source evidence | Runtime evidence | Verdict | Action |
|---|---|---|---|---|---|
| A5-E001 | Current main contains deterministic Team Coach | paths/commits/tests | pending | pending | verify |
| A5-E002 | Exact paired replay is reconstructible | paths + five cited IDs | pending | pending | verify one live sample |
| A5-E003 | Quick-phrase panel is not recoverable from Git | full-ref search | n/a | expected `UNKNOWN` | specify later |
| A5-E004 | Fresh DB bootstrap is complete | schema/migrations | pending | pending | launch locally |
| A5-E005 | `message.txt` is the takeover prompt | artifact contents | n/a | false | preserve as historical only |

Do not ask Jimmy to resolve a claim that source, Git history, or tests can settle.

### Gate 1

Pass only when each launch-critical handoff claim is either verified, contradicted,
or explicitly marked `UNKNOWN`. “Jimmy/Codex said so” is not runtime evidence.

## Phase 2 — establish the local golden build

Run in the clean worktree, not the dirty primary checkout.

### Backend

```bash
python -m pytest -q
python -m pip install ruff==0.16.1
python -m ruff check --isolated --select E4,E7,E9,F backend tests app.py scripts
```

This is the repository's actual CI lint gate. The broader command printed in the
received handoff is not equivalent: Ruff is absent from `requirements-dev.txt`,
the command is unpinned, and Ruff 0.16.5 reports 103 findings across that broader
scope. Do not auto-fix those findings during recovery.

### Frontend

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm run test
pnpm run lint
pnpm run build
cd ..
```

### Container

```bash
docker build --build-arg VITE_PUBLIC_BASE_URL=http://localhost:8000 -t thejimmyapp:a5 .
docker volume create thejimmyapp-a5-data
docker run --rm -d \
  --name thejimmyapp-a5 \
  -p 8000:8000 \
  -v thejimmyapp-a5-data:/app/data \
  -e PORT=8000 \
  -e ENVIRONMENT=production \
  -e QWEN_ENABLED=false \
  -e CORS_ORIGINS=http://localhost:8000 \
  -e TRUSTED_HOSTS=localhost,127.0.0.1 \
  -e WEBSOCKET_ORIGINS=http://localhost:8000 \
  thejimmyapp:a5
curl -fsS http://localhost:8000/health
python scripts/production_smoke.py --base-url http://localhost:8000
docker logs --tail 200 thejimmyapp-a5
```

Restart the same container against the same named volume and confirm data created
during the first run persists. Stop and remove only the named A5 container when
finished; retain the volume until the deployment is verified.

### Gate 2

Pass only when tests, lint, build, health, smoke, and persistence all pass from the
exact clean SHA. Record actual counts and failures; do not silently correct the
handoff's numbers.

## Phase 3 — create the fresh Ryan-owned deployment

### Deployment shape

- Source: Ryan-controlled GitHub repository at a pinned commit.
- Runtime: one Docker service.
- Persistence: durable volume mounted at `/app/data`.
- Qwen: disabled.
- Instances: exactly one.
- Public URL: provider-generated hostname for first verification.
- Databases: new `bughouse.db` and `webapp.db` created by the application.
- Backups: daily snapshot/export defined before importing historical data.

### Required environment

Set provider-specific values without copying old secrets:

```text
ENVIRONMENT=production
COOKIE_SECURE=true
LEGACY_DATABASE_PATH=/app/data/bughouse.db
DATABASE_URL=sqlite:////app/data/webapp.db
QWEN_ENABLED=false
VITE_PUBLIC_BASE_URL=https://<generated-hostname>
CORS_ORIGINS=https://<generated-hostname>
TRUSTED_HOSTS=<generated-hostname>
WEBSOCKET_ORIGINS=https://<generated-hostname>
```

Use a descriptive `CHESSCOM_USER_AGENT`. Leave OAuth credentials unset because
the current callback is a placeholder. Use the repository's bounded default job
limits unless measured runtime behavior requires a change.

### Deployment rules

- Do not reuse Jimmy's Railway project IDs, volume, variables, or DNS targets.
- Do not enable auto-deploy until the first pinned build passes.
- Do not attach the custom domain during the first deploy.
- Do not import the large historical corpus during the first deploy.
- Do not scale beyond one instance.

### Gate 3

Pass only when the generated URL has a valid certificate and passes:

1. `/health` with database and Fairy-Stockfish available;
2. production smoke script;
3. one fresh guest flow;
4. one paired two-board replay with moves, clocks, pockets, and timeline;
5. one two-browser room join and synchronized seek;
6. one Fairy analysis request;
7. restart with persistent data still present.

Qwen is explicitly not a launch gate.

## Phase 4 — backup, domain, and bounded reconstruction

Complete in this order:

1. Produce and restore-test an export of both fresh SQLite databases.
2. Document the provider, project owner, service, volume, generated URL, commit,
   backup command, restore command, and last verified timestamp.
3. Attach `thejimmyapp.com` using the new provider's current DNS instructions.
4. Preserve unrelated MX/TXT records and verify the certificate.
5. Update build-time and runtime origin variables to the final hostname.
6. Re-run every Gate 3 check on the custom domain.
7. Import one small historical username sample.
8. Compare reconstructed moves and clocks before any bulk job.
9. Add upstream backoff, resumable checkpoints, and a kill switch before scaling
   reconstruction across the full historical corpus.

Do not describe callback-derived data as permanently recoverable. It depends on
an undocumented upstream path and may disappear.

### Gate 4

Pass when the custom domain works, a backup has been restored successfully, the
deployment ledger is current, and a small reconstruction sample is verified.

## Data custody ruling

GitHub is a software and documentation source, not a production-database backup.
Local files provide partial safety, not complete continuity:

- the local August 12 legacy database is healthy but much smaller than the
  reported production corpus;
- the external July 17 database is large but lacks partner-board enrichment;
- the local collaboration database appears dominated by fixtures/placeholders;
- old identity tokens, emails, moments, votes, room links, chat/notes, and exact
  progression cannot be reconstructed from GitHub or Chess.com.

Keep all snapshots read-only and retain their hashes. Never merge rows between old
databases without a schema-aware, idempotent import plan and a rollback copy.

## Product work held behind A5

These are deliberately parked until Gate 3:

- UI inspiration research;
- private UI-library architecture and ZIP packaging;
- final palette or typography decisions;
- Evan's portfolio slices;
- quick-phrase panel specification;
- Opening Explorer web port;
- full Pattern Academy web port;
- dental-office service concept.

After Gate 3, resume with one narrow product task: specify and prototype the
quick-phrase communication panel using the supplied screenshot as inspiration,
while keeping the phrase catalog owner-approved and separate from tactical truth.

## Required deliverables

1. `output/recovery/A5-EVIDENCE-LEDGER.md`
2. `output/recovery/A5-GOLDEN-BUILD-RESULTS.md`
3. `output/recovery/A5-DEPLOYMENT-LEDGER.md`
4. `output/recovery/A5-DATA-CUSTODY.md`
5. Updated `docs/CURRENT-HANDOFF.md`
6. Updated `docs/ROBOT-DOCKET.md`

Each result must distinguish:

- verified fact;
- reproduced runtime result;
- inference;
- contradiction;
- unknown;
- blocked decision.

## Stop conditions

Stop the specific operation, preserve evidence, and change course when:

- a command would modify the dirty primary checkout;
- a credential, payment, passkey, or account approval is required;
- a provider action targets Jimmy's account rather than Ryan's;
- a database import cannot be made idempotent and reversible;
- the clean SHA fails a core replay-integrity test;
- the Chess.com callback begins failing, rate-limiting, or returning inconsistent
  partner evidence;
- a requested action would expose private messages, tokens, or user records in a
  public repository.

Do not sit idle after a stop condition. Continue with the next independent local
verification step and report the exact blocked gate.

## Completion test

A5 is complete only when a new operator can answer, from evidence:

- Which exact source commit is live?
- Who owns the repository, provider project, service, volume, and DNS?
- Which tests and smoke checks passed, with actual counts?
- Where are the two databases stored and how are they backed up/restored?
- Which historical records are restored, reconstructible, or lost?
- Which features are current, partial, removed, reconstructible, or unknown?
- What is the next single product task?

If any answer depends on private memory or asking Jimmy what happened, A5 is not
complete.
