# CTFd dynamic instances (Kubernetes)

A CTFd plugin that launches per-user, per-challenge Kubernetes deployments/services on demand.

## Features

- Start/stop dynamic Kubernetes instances from the challenge view
- Per-user, per-challenge isolation with unique deployments/services
- Optional TTL (auto-expire) and extend button
- Image pull secrets support (private registries)
- Server-side session tracking (survives browser storage clears)
- Mock mode for UI development/testing (bypasses Kubernetes)
- Optional session cleanup on CTFd startup (development/test helper)

## Requirements

- CTFd (running in Docker or Kubernetes)
- Kubernetes cluster access (in-cluster or kubeconfig)
- Python Kubernetes client (already in requirements)

## Installation

1) Place this plugin folder inside CTFd’s plugins directory:

- `CTFd/plugins/dynamic_instances/`

2) Restart CTFd.

## Configuration

Set these environment variables **on the main CTFd container/service** (e.g., in your CTFd docker-compose service `environment:` block). See [.env.example](.env.example) for a template.

### Core

- `KUBECONFIG` (optional): path to kubeconfig file (used when not running in-cluster)
- `K8S_NAMESPACE`: namespace where instances are created (default: `per-user`)
- `K8S_SERVICE_TYPE`: `LoadBalancer`, `NodePort`, or `ClusterIP` (default: `LoadBalancer`)

### Instance lifecycle

- `K8S_TTL_SECONDS`: time-to-live in seconds (default: `1800`, set `0` to disable)
- `K8S_TTL_MAX_SECONDS`: maximum lifetime cap in seconds (default: `3600`)
- `K8S_EXTEND_SECONDS`: default extension seconds (default: `300`)

### Private registry access

- `K8S_IMAGE_PULL_SECRETS`: comma-separated Kubernetes secret names

### Testing & maintenance

- `MOCK_K8S`: `true` to bypass Kubernetes for UI testing
- `CLEAR_K8S_SESSIONS_ON_START`: `true` to wipe stored sessions on CTFd startup

## Private registry example (GitLab)

Create a secret (use a PAT with `read_registry`) in the same namespace as instances:

```bash
kubectl create secret docker-registry gitlab-registry \
	--docker-server=registry.gitlab.com \
	--docker-username=YOUR_GITLAB_USERNAME \
	--docker-password=YOUR_GITLAB_PAT \
	--docker-email=you@example.com \
	--namespace per-user
```

Set:

```
K8S_IMAGE_PULL_SECRETS=gitlab-registry
```

## Usage

1) In CTFd Admin, create a challenge with type `k8s`.
2) Set the image and (optional) tag and port.
	 - Example image: `registry.gitlab.com/group/project/image`
	 - Example tag: `latest`
3) Open the challenge as a user and click **Start Instance**.

The UI shows the connection endpoint and TTL. Click **Stop Instance** to clean up.

## Notes

- Instances are created as Kubernetes Deployments and Services, labeled by user and challenge.
- If you run CTFd in Docker, mount your kubeconfig into the container and set `KUBECONFIG` to the container path.

## Troubleshooting

- **403 pulling image**: ensure `K8S_IMAGE_PULL_SECRETS` is set and the secret exists in the correct namespace.
- **Config not available**: set `KUBECONFIG` or run CTFd inside the cluster.

