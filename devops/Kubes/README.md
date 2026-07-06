# Legacy Deployment Artifact

Do not deploy these manifests directly.

`devops/Helm` is the only deployment source of truth. These manifests remain only as compatibility references and must keep placeholder application image tags.

The local `kustomization.yaml` intentionally keeps `resources: []` so `kubectl apply -k` does not deploy these legacy artifacts.
