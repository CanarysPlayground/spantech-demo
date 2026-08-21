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

## Stage-by-stage mapping (Linux CI/CD)

| Jenkins stage | GitHub Actions step | Notes |
|---|---|---|
| `properties([parameters([...])])` cascading dropdowns | `workflow_dispatch` inputs + a `Validate Env/Application pair` step | Actions inputs can't cascade (Application options can't depend on Env selection live). We replicate the same allow-list and **fail fast** if you pick a mismatched pair, same as Jenkins would've. |
| `agent { label params.AGENT }` | `runs-on: ubuntu-latest` | Demo uses GitHub-hosted. Swap for a self-hosted runner labelled to match your real build host when you're ready to cut over for real. |
| `Git Clone` (`Trigger_Repo`/`Trigger_Branch`) | `actions/checkout@v4` with `repository`/`ref` inputs | Same behavior — clones whatever repo/branch you pass in. |
| `.env copy` from `/home/ubuntu/.envs/...` | `Resolve app path and seed .env` step | Same `backend/<app>` → `frontend/<app>` → `apps/<app>` fallback logic. The actual env values come from a placeholder `.env.example` in this demo — see **Secrets** below for the real options. |
| `Docker Build` | `Docker build` step | 1:1, same `--no-cache` build. |
| `Nexus Login` | `docker/login-action@v3` | Defaults to `ghcr.io` using the built-in `GITHUB_TOKEN` (zero setup). Point `vars.REGISTRY_URL` + `secrets.REGISTRY_USER`/`REGISTRY_PASS` at your real Nexus when migrating for real. |
| `Docker Push to Nexus` | `Tag and push` step | Same tag scheme: `<registry>/<namespace>/<env>/<app>:<tag>`. Both the app name and namespace get lowercased — Docker image references must be all-lowercase, and org/app names aren't guaranteed to be. |
| CD: `Docker Image Pull` / `Stop and Remove` / `Run the Docker` / `Docker-List` | Same-named steps | Port/volume mapping table copied 1:1 from the Jenkins `if/else` chain. |
| `Nginx-Restart` | `Restart nginx (demo)` step | Installs and restarts nginx **on the ephemeral runner** just to prove the command runs. On a self-hosted runner this becomes your real nginx restart. |
| `post { success/failure }` Slack | `Notify Slack` step (`if: always()`) | Uses `slackapi/slack-github-action`; swap `SLACK_WEBHOOK_URL` for your channel's webhook. |

## Stage-by-stage mapping (Windows CI/CD)

These two are more different in *kind* than the Linux pair: CI is a .NET/MSBuild build that publishes into an IIS folder, and CD is actually an **Ansible deploy driven from a Linux control node** (`spanansible-t990-spt-stg`), not a Windows build at all.

| Jenkins stage | GitHub Actions step | Notes |
|---|---|---|
| `agent { label 'Build-Tax990-1' }` | `runs-on: windows-latest` | `windows-latest` ships with the .NET SDK and MSBuild preinstalled, so the `.netCore*` path works with zero setup. |
| `Nuget restore` | `NuGet restore` step (`dotnet restore`) | Only runs `.netCore*`; the `.netFrameWork` branch is stubbed with a note (see **Known gaps**). |
| `Build Code` / `Publish Code` | `Build` / `Publish` steps (`dotnet build` / `dotnet publish`) | Same `mode_type` (Release/Debug) passed through as `-c`. |
| `Backup Existing code` / `Delete Existing code` / `Move latest code to AppLocation` | `Backup existing deployment (simulated)` / `Delete existing deployment (simulated)` / `Move published code...` steps | Real Jenkins wrote to `D:\Application\<env>\<project>\<app>\`, a live IIS site. No IIS exists on a GitHub-hosted runner, so these three steps run the same backup→delete→copy sequence against a local `deploy-target\` folder instead. |
| `Add robots.txt` | `Add robots.txt` step | 1:1. |
| `Push Code to Nexus` / `Delete nexus zip` | `Zip build output` → `Upload artifact` → `Delete local zip` | Zips the same folder; uploads it as a **GitHub Actions artifact** as the demo stand-in for the real Nexus push. |
| `post { success/failure }` Slack | `Notify Slack` step | Same pattern as the Linux jobs. |
| **CD:** `agent { label 'spanansible-t990-spt-stg' }` | `runs-on: ubuntu-latest` | This is the important gotcha — the real CD job for "Windows" apps runs on a **Linux** Ansible control box, not a Windows runner. |
| `ansible-playbook -i Sprint ./Tax990/<type>/<type>.yml --extra-vars '...'` | `Run deployment playbook` step | Same `applicationType` resolution (`APIWEB` / `APIWEB-FT` / `WIWO`) and the same `--extra-vars` shape, run against a stand-in playbook (`ansible/deploy-demo.yml`) targeting `localhost` instead of your real WinRM-managed hosts. |

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

For the Windows pair:

5. Run **CI - Build and Publish (Windows) [Demo]** with:
   - `program_type`: `.netCore8.0`
   - `mode_type`: `Release`
   - `nuget_restore`: `Yes`
   - `app_env`: `Tax990-Api`
   - `application`: `quickformapi.expresstaxexempt.com`
   - `build_number`: e.g. `1`
   - `env_type`: `sprint`
   - Leave `solution_file` at its default (`apps/dotnet-demo-app/DemoApp.csproj`)
   
   Download the resulting workflow artifact from the run summary to see the zipped, "deployed" output — that's the stand-in for the Nexus push.
6. Run **CD - Deploy via Ansible (Windows targets) [Demo]** with:
   - `artifact_date`: e.g. `demo1`
   - `module_type`: `Tax990`
   - `app_env`: `Tax990-Api`
   - `application`: `api.expresstaxexempt.com`
   
   Check the run log for `Show deployment marker` — it prints the file the demo playbook wrote, proving the `latest_version`/`app_name`/`env_repo` variables flowed through exactly like the real `ansible-playbook --extra-vars` call.

No self-hosted runner or real credentials required — that's the point of this first pass.

## Known gaps vs. the real Jenkins jobs (by design, for a safe demo)

- **No persistent host (Linux CD).** GitHub-hosted runners are thrown away after each run, so unlike your Jenkins `Tax990-APIWEB` box, the deployed container/nginx state doesn't survive between runs. This validates the *logic*; the real cutover needs a **self-hosted runner** on the actual Docker host.
- **No cascading dropdown.** `workflow_dispatch` can't make `application`'s options depend on `app_env` the way the Jenkins `CascadeChoiceParameter` did. We validate the pair server-side instead and fail the run if they don't match — same guardrail, less friendly UI. (If this matters a lot, a small custom GitHub App/Action-triggered form, or moving parameter selection into a `.github/workflows` reusable-workflow-per-app pattern, can restore the guided experience.)
- **`.env copy` is stubbed (Linux CI).** Real per-environment secrets need a real source once you're off the Jenkins host's local filesystem — options: GitHub encrypted secrets (fine for small env files), AWS Secrets Manager/Vault pulled at deploy time, or simply keeping the self-hosted runner on the same box so the existing path still works.
- **No IIS site (Windows CI).** The backup/delete/move stages run against a plain folder (`deploy-target\`) instead of a real IIS application, since a GitHub-hosted Windows runner has no IIS site configured. On a **self-hosted Windows runner** with IIS already set up the same PowerShell would work against the real `D:\Application\...` path with no logic changes.
- **`.netFrameWork` path is stubbed (Windows CI).** The demo app targets `net8.0` so the `.netCore*` path is what actually runs. The `.netFrameWork` branch is left as a documented no-op — `windows-latest` does ship MSBuild under `Program Files (x86)\Microsoft Visual Studio\...\MSBuild\Current\Bin`, so wiring that branch up for real is a matter of pointing at your actual `.sln`/`.csproj`, not a platform limitation.
- **Nexus push is a GitHub Actions artifact (both CI jobs).** Swap the `actions/upload-artifact` step for a real `docker push` (Linux) or a `curl`/Nexus CLI upload of the zip (Windows) once you're pointing at your real Nexus instance.
- **Ansible targets localhost (Windows CD).** The real playbooks live in a private ops repo and manage real IIS/service hosts over WinRM. This demo runs a stand-in playbook against `localhost` to prove the variable plumbing (`latest_version`/`app_name`/`form_type`/`env_repo`) works identically — swap in your real playbook path and inventory once you're ready, and make sure the runner (self-hosted, most likely) has WinRM connectivity/credentials to those hosts.

## Roadmap for the rest of the migration

With both the Linux and Windows CI/CD pairs validated, the same patterns extend to the remaining two:

1. **`WEBHOOK/Jenkinsfile-Linux` / `-Windows`** — bigger version of these same patterns: multi-app matrix build (`app()`/`wift()` type-mapping tables become a JSON/YAML lookup consumed by a `strategy: matrix`), plus the Ansible "Start PDF Worker Service" stage becomes a real `ansible-playbook` step run from a self-hosted runner that already has SSH/WinRM access to those hosts — you've now seen both the matrix-build shape (Linux CI) and the Ansible-extra-vars shape (Windows CD) needed to build it.
2. **`WEBHOOK/Jenkinsfile-EKS`** — Docker build → ECR push (`aws-actions/amazon-ecr-login`) → a **manual approval gate** using GitHub **Environments** with required reviewers (replaces the Jenkins `input` timeout/approval step) → commit the new image tag to your GitOps repo (`peter-evans/create-pull-request` or a direct `git push` step) — Argo CD/Flux then rolls it out, same as today.

I'd suggest WEBHOOK Linux next since it's the biggest complexity jump (matrix builds + real Ansible), then EKS last since it has the approval gate and GitOps push that need the most care.
