# Deployment Source Policy

Canonical deployment source:

- Helm chart: `devops/Helm`
- Backend image: `chefbeom/fileinnoutdrive-backend:<tag>`
- Frontend image: `chefbeom/fileinnoutdrive-frontend:<tag>`
- WebSocket image: `chefbeom/fileinnoutdrive-websocket:<tag>`

Tag policy:

- CI build tags use `v<BUILD_NUMBER>`.
- `latest` can be pushed as a convenience tag, but production deploys must pin an explicit build tag.
- Helm deploys must override image tags with `--set-string <component>.image.tag=<tag>` or set `--set-string <component>.image.digest=sha256:<digest>` through a private values file.
- `devops/Helm` intentionally defaults application `tag` and `digest` values to empty strings and fails rendering unless each app image has a non-`latest` tag or a valid sha256 digest.
- Backend Jenkins deploys require explicit frontend and websocket image tags; empty values and `latest` fail before Helm deploy.
- Docker Compose deployment/smoke files require `COMPOSE_IMAGE_TAG`; app images no longer fall back to `latest`, Redis/MariaDB are pinned to explicit versions, and MinIO requires `MINIO_IMAGE_TAG`.
- `devops/Helm/values.production.example.yaml` documents the production overlay shape for explicit tags or digest-based deploys.

Secret ownership:

- Public/non-sensitive backend values live under `backend.env` and render into a ConfigMap.
- Sensitive backend values live under `backend.secretEnv` and render into a Kubernetes Secret.
- Private deployment values must be supplied through a private values file or CI secret injection, not committed defaults.

Source ownership:

- `devops/Helm` is the only deployment source of truth.
- `backend/helm`, `devops/Kubes`, and `frontend/k8s` are quarantined legacy compatibility artifacts. Do not deploy them directly and do not add new behavior there.
- Legacy deployment YAMLs must carry the `Legacy deployment artifact: do not deploy directly.` marker and must not use real application image tags.
- While legacy directories remain, `devops/LEGACY_DEPLOYMENT_LOCK.json` pins their normalized file hashes so accidental drift fails verification.
- Jenkins defaults should point at this repository and `devops/Helm`.

Do not add new legacy image references. Use the `chefbeom/fileinnoutdrive-*` repositories above unless a registry migration is intentionally planned.

Verification:

```powershell
node .\devops\scripts\verify-deployment-source.mjs
```

This check fails when application deployments reference `latest`, old `lumisia/*` repositories, bypass the canonical Helm tag/digest guard, default Jenkins or Docker Compose deploy parameters to `latest`, render Helm sanity checks without explicit image tags, use legacy roots as deployment command inputs, omit legacy quarantine markers, make legacy kustomization entrypoints deploy resources, drift from the legacy quarantine lock, or add known static password/OAuth dummy defaults to public deployment automation.

Legacy artifact policy:

- `backend/helm`, `devops/Kubes`, and `frontend/k8s` are not deployment inputs.
- Their application images must stay as placeholders such as `REPLACE_WITH_EXPLICIT_TAG` or be guarded by Helm's required image tag helper.
- `devops/Kubes/kustomization.yaml` and `frontend/k8s/kustomization.yaml` must keep `resources: []` so `kubectl apply -k` cannot deploy legacy artifacts.
- Prefer deleting these directories once no external caller depends on their paths. Until explicit deletion is approved, this verifier keeps them quarantined, hash-locked, and non-authoritative.