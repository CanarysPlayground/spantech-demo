# Jenkins → GitHub Actions Demo (Parameter-job CI/CD, Linux)

This is a **working demo** of `Parameter-job/Jenkinsfile-CI-Linux` and
`Parameter-job/Jenkinsfile-CD-Linux` ported to GitHub Actions, running on
GitHub-hosted runners with placeholder secrets so you can trigger it today
without touching production infra.

## What's in here

```
.github/workflows/ci-linux.yml   # build image, push to registry
.github/workflows/cd-linux.yml   # pull image, run container, restart nginx
apps/tax990-app/                 # trivial Node app so the pipeline has something real to build/run
```

## Stage-by-stage mapping

| Jenkins stage | GitHub Actions step | Notes |
|---|---|---|
| `properties([parameters([...])])` cascading dropdowns | `workflow_dispatch` inputs + a `Validate Env/Application pair` step | Actions inputs can't cascade (Application options can't depend on Env selection live). We replicate the same allow-list and **fail fast** if you pick a mismatched pair, same as Jenkins would've. |
| `agent { label params.AGENT }` | `runs-on: ubuntu-latest` | Demo uses GitHub-hosted. Swap for a self-hosted runner labelled to match your real build host when you're ready to cut over for real. |
| `Git Clone` (`Trigger_Repo`/`Trigger_Branch`) | `actions/checkout@v4` with `repository`/`ref` inputs | Same behavior — clones whatever repo/branch you pass in. |
| `.env copy` from `/home/ubuntu/.envs/...` | `Resolve app path and seed .env` step | Same `backend/<app>` → `frontend/<app>` → `apps/<app>` fallback logic. The actual env values come from a placeholder `.env.example` in this demo — see **Secrets** below for the real options. |
| `Docker Build` | `Docker build` step | 1:1, same `--no-cache` build. |
| `Nexus Login` | `docker/login-action@v3` | Defaults to `ghcr.io` using the built-in `GITHUB_TOKEN` (zero setup). Point `vars.REGISTRY_URL` + `secrets.REGISTRY_USER`/`REGISTRY_PASS` at your real Nexus when migrating for real. |
| `Docker Push to Nexus` | `Tag and push` step | Same tag scheme: `<registry>/<namespace>/<env>/<app>:<tag>`. |
| CD: `Docker Image Pull` / `Stop and Remove` / `Run the Docker` / `Docker-List` | Same-named steps | Port/volume mapping table copied 1:1 from the Jenkins `if/else` chain. |
| `Nginx-Restart` | `Restart nginx (demo)` step | Installs and restarts nginx **on the ephemeral runner** just to prove the command runs. On a self-hosted runner this becomes your real nginx restart. |
| `post { success/failure }` Slack | `Notify Slack` step (`if: always()`) | Uses `slackapi/slack-github-action`; swap `SLACK_WEBHOOK_URL` for your channel's webhook. |

## Setup (5 minutes)

1. Push this folder to a new (or existing) GitHub repo.
2. In **Settings → Secrets and variables → Actions**, add:
   - `SLACK_WEBHOOK_URL` *(optional — leave unset and the notify step just no-ops via `continue-on-error`)*
   - Only if you want to point at a **real** registry instead of the default `ghcr.io`:
     - Repo **variable** `REGISTRY_URL`
     - Secrets `REGISTRY_USER`, `REGISTRY_PASS`
3. Go to **Actions → CI - Build and Push (Linux) [Demo] → Run workflow**, fill in:
   - `app_env`: `WEB`
   - `application`: `tax990-app`
   - `environment`: `Sprint`
   - `tags`: e.g. `demo1`
4. Once it succeeds, run **CD - Deploy (Linux) [Demo]** with the same inputs. You'll see the container start and get curl'd on the runner, plus a nginx restart, mirroring what Jenkins did on your real Docker host.

No self-hosted runner or real credentials required — that's the point of this first pass.

## Known gaps vs. the real Jenkins jobs (by design, for a safe demo)

- **No persistent host.** GitHub-hosted runners are thrown away after each run, so unlike your Jenkins `Tax990-APIWEB` box, the deployed container/nginx state doesn't survive between runs. This validates the *logic*; the real cutover needs a **self-hosted runner** on the actual Docker host.
- **No cascading dropdown.** `workflow_dispatch` can't make `application`'s options depend on `app_env` the way the Jenkins `CascadeChoiceParameter` did. We validate the pair server-side instead and fail the run if they don't match — same guardrail, less friendly UI. (If this matters a lot, a small custom GitHub App/Action-triggered form, or moving parameter selection into a `.github/workflows` reusable-workflow-per-app pattern, can restore the guided experience.)
- **`.env copy` is stubbed.** Real per-environment secrets need a real source once you're off the Jenkins host's local filesystem — options: GitHub encrypted secrets (fine for small env files), AWS Secrets Manager/Vault pulled at deploy time, or simply keeping the self-hosted runner on the same box so the existing path still works.

## Roadmap for the rest of the migration

Once you're happy with this pair, the same patterns extend to the other four:

1. **`Jenkinsfile-CI-Windows` / `Jenkinsfile-CD-Windows`** — same shape, `runs-on: windows-latest` (or a self-hosted Windows runner), PowerShell instead of `sh`.
2. **`WEBHOOK/Jenkinsfile-Linux` / `-Windows`** — bigger version of this same pattern: multi-app matrix build (`app()`/`wift()` type-mapping tables become a JSON/YAML lookup consumed by a `strategy: matrix`), plus the Ansible "Start PDF Worker Service" stage becomes a `ansible-playbook` step run from a self-hosted runner that already has SSH access to those hosts.
3. **`WEBHOOK/Jenkinsfile-EKS`** — Docker build → ECR push (`aws-actions/amazon-ecr-login`) → a **manual approval gate** using GitHub **Environments** with required reviewers (replaces the Jenkins `input` timeout/approval step) → commit the new image tag to your GitOps repo (`peter-evans/create-pull-request` or a direct `git push` step) — Argo CD/Flux then rolls it out, same as today.

I'd suggest validating this Linux CI/CD demo end-to-end first, then tackling Windows (same logic, different shell), then WEBHOOK Linux, then EKS last since it has the approval gate and GitOps push that need the most care.
