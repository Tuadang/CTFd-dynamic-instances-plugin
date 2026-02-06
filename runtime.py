# plugins/dynamic_instances/runtime.py

import os
import time
import uuid
from kubernetes import client, config
from kubernetes.client import ApiException

_core = None
_apps = None


def _load():
    """Initialize Kubernetes clients once per process."""
    global _core, _apps
    if _core and _apps:
        return
    try:
        config.load_incluster_config()
    except Exception:
        # Load from kubeconfig as fallback
        kubeconfig_path = os.getenv("KUBECONFIG")
        if kubeconfig_path:
            config.load_kube_config(config_file=kubeconfig_path)
        else:
            config.load_kube_config()
    _core = client.CoreV1Api()
    _apps = client.AppsV1Api()


def _ns():
    """Namespace for user instances."""
    return os.getenv("K8S_NAMESPACE", "per-user")


def _name(user_id, challenge_id):
    """Stable-ish resource name per user/challenge instance."""
    return f"ctf-u{user_id}-c{challenge_id}-{uuid.uuid4().hex[:6]}"


def _instance_labels(user_id, challenge_id, name=None):
    """Common labels used for lookup and cleanup."""
    labels = {
        "component": "user-instance",
        "user_id": str(user_id),
        "challenge_id": str(challenge_id),
    }
    if name:
        labels["app"] = name
    return labels


def _image_pull_secrets():
    """Parse imagePullSecrets from env (comma-separated)."""
    raw = os.getenv("K8S_IMAGE_PULL_SECRETS", "").strip()
    if not raw:
        return None
    names = [name.strip() for name in raw.split(",") if name.strip()]
    if not names:
        return None
    return [client.V1LocalObjectReference(name=n) for n in names]


def _ensure_namespace():
    """Create namespace if it doesn't exist."""
    _load()
    ns = _ns()
    try:
        _core.read_namespace(ns)
    except ApiException as exc:
        if getattr(exc, "status", None) == 404:
            body = client.V1Namespace(metadata=client.V1ObjectMeta(name=ns))
            _core.create_namespace(body)
        else:
            raise


def _ttl_seconds():
    """Base TTL for new instances."""
    try:
        value = int(os.getenv("K8S_TTL_SECONDS", "1800"))
        return value if value > 0 else None
    except (TypeError, ValueError):
        return None


def _ttl_max_seconds():
    """Maximum cap for total lifetime."""
    try:
        value = int(os.getenv("K8S_TTL_MAX_SECONDS", "3600"))
        return value if value > 0 else None
    except (TypeError, ValueError):
        return None


def _extend_seconds():
    """Default extend window."""
    try:
        value = int(os.getenv("K8S_EXTEND_SECONDS", "300"))
        return value if value > 0 else 300
    except (TypeError, ValueError):
        return 300


def start_instance(*, user_id, challenge_id, image, tag=None, port=80):
    """Create a deployment + service for a user challenge instance."""
    _load()
    _ensure_namespace()
    ns = _ns()
    name = _name(user_id, challenge_id)
    full_image = f"{image}:{tag}" if tag else image
    now = str(int(time.time()))

    labels = _instance_labels(user_id, challenge_id, name)

    ttl = _ttl_seconds()
    ttl_max = _ttl_max_seconds()
    if ttl and ttl_max:
        ttl = min(ttl, ttl_max)
    annotations = {"created_at": now, "last_seen": now}
    if ttl:
        annotations["expires_at"] = str(int(now) + ttl)

    dep = client.V1Deployment(
        metadata=client.V1ObjectMeta(
            name=name,
            labels=labels,
            annotations=annotations,
        ),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(match_labels={"app": name}),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels=labels),
                spec=client.V1PodSpec(
                    image_pull_secrets=_image_pull_secrets(),
                    containers=[
                        client.V1Container(
                            name="instance",
                            image=full_image,
                            ports=[client.V1ContainerPort(container_port=port)],
                        )
                    ]
                ),
            ),
        ),
    )

    svc = client.V1Service(
        metadata=client.V1ObjectMeta(name=name, labels=labels),
        spec=client.V1ServiceSpec(
            type=os.getenv("K8S_SERVICE_TYPE", "LoadBalancer"),
            selector={"app": name},
            ports=[client.V1ServicePort(port=port, target_port=port)],
        ),
    )

    _apps.create_namespaced_deployment(ns, dep)
    _core.create_namespaced_service(ns, svc)

    response = {"instance_id": name, "status": "starting", "port": port}
    if ttl:
        response["expires_at"] = int(now) + ttl
        response["ttl_remaining"] = ttl
    if ttl_max and response.get("ttl_remaining"):
        response["ttl_remaining"] = min(response["ttl_remaining"], ttl_max)
        response["ttl_max"] = ttl_max
    return response


def stop_instance(instance_id):
    """Delete deployment and service by instance id."""
    _load()
    ns = _ns()
    try:
        _apps.delete_namespaced_deployment(instance_id, ns)
    except ApiException:
        pass
    try:
        _core.delete_namespaced_service(instance_id, ns)
    except ApiException:
        pass


def stop_instances_for(user_id, challenge_id):
    """Delete all deployments/services for a user+challenge label set."""
    _load()
    ns = _ns()
    selector = ",".join(
        [
            "component=user-instance",
            f"user_id={user_id}",
            f"challenge_id={challenge_id}",
        ]
    )
    try:
        deps = _apps.list_namespaced_deployment(ns, label_selector=selector)
        for dep in deps.items:
            try:
                _apps.delete_namespaced_deployment(dep.metadata.name, ns)
            except ApiException:
                pass
    except ApiException:
        pass
    try:
        svcs = _core.list_namespaced_service(ns, label_selector=selector)
        for svc in svcs.items:
            try:
                _core.delete_namespaced_service(svc.metadata.name, ns)
            except ApiException:
                pass
    except ApiException:
        pass


def find_existing_instance(user_id, challenge_id):
    """Find the newest instance for a user+challenge."""
    _load()
    ns = _ns()
    selector = ",".join(
        [
            "component=user-instance",
            f"user_id={user_id}",
            f"challenge_id={challenge_id}",
        ]
    )
    deployments = _apps.list_namespaced_deployment(ns, label_selector=selector)
    if not deployments.items:
        return None

    def _created_at(dep):
        annotations = dep.metadata.annotations or {}
        try:
            return int(annotations.get("created_at", 0))
        except (TypeError, ValueError):
            return 0

    deployments.items.sort(key=_created_at, reverse=True)
    return deployments.items[0].metadata.name


def extend_instance(instance_id, seconds=None):
    """Extend TTL on an existing instance."""
    _load()
    ns = _ns()
    extend_by = seconds if seconds is not None else _extend_seconds()
    now = int(time.time())

    dep = _apps.read_namespaced_deployment(instance_id, ns)
    annotations = (dep.metadata.annotations or {}).copy()
    try:
        created_at = int(annotations.get("created_at", now))
    except (TypeError, ValueError):
        created_at = now
    current_expires = int(annotations.get("expires_at", now))
    base = current_expires if current_expires > now else now
    new_expires = base + extend_by
    ttl_max = _ttl_max_seconds()
    if ttl_max:
        new_expires = min(new_expires, created_at + ttl_max)
    annotations["last_seen"] = str(now)
    annotations["expires_at"] = str(new_expires)

    patch = {"metadata": {"annotations": annotations}}
    _apps.patch_namespaced_deployment(instance_id, ns, patch)
    remaining = max(new_expires - now, 0)
    ttl_max = _ttl_max_seconds()
    if ttl_max:
        remaining = min(remaining, ttl_max)
    response = {"instance_id": instance_id, "expires_at": new_expires, "ttl_remaining": remaining}
    if ttl_max:
        response["ttl_max"] = ttl_max
    return response


def get_status(instance_id):
    """Return status, connection info, and TTL data for an instance."""
    _load()
    ns = _ns()

    try:
        dep = _apps.read_namespaced_deployment(instance_id, ns)
    except ApiException:
        return {"instance_id": instance_id, "status": "stopped", "ttl_remaining": 0}

    annotations = dep.metadata.annotations or {}
    now = int(time.time())
    expires_at = annotations.get("expires_at")
    if expires_at is not None:
        try:
            expires_at_int = int(expires_at)
        except (TypeError, ValueError):
            expires_at_int = None
    else:
        expires_at_int = None

    if expires_at_int is not None and now >= expires_at_int:
        stop_instance(instance_id)
        return {"instance_id": instance_id, "status": "expired", "ttl_remaining": 0, "expires_at": expires_at_int}

    svc = _core.read_namespaced_service(instance_id, ns)
    pods = _core.list_namespaced_pod(ns, label_selector=f"app={instance_id}")

    ip = None
    if svc.status and svc.status.load_balancer and svc.status.load_balancer.ingress:
        ip = svc.status.load_balancer.ingress[0].ip

    pod = pods.items[0] if pods.items else None

    response = {
        "instance_id": instance_id,
        "ip": ip,
        "pod_phase": pod.status.phase if pod else None,
        "port": (svc.spec.ports[0].port if svc and svc.spec and svc.spec.ports else None),
    }
    ttl_max = _ttl_max_seconds()
    if expires_at_int is not None:
        response["expires_at"] = expires_at_int
        remaining = max(expires_at_int - now, 0)
        response["ttl_remaining"] = min(remaining, ttl_max) if ttl_max else remaining
        if ttl_max:
            response["ttl_max"] = ttl_max
    return response
