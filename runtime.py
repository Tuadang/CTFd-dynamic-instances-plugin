# plugins/dynamic_instances/runtime.py

import os
import time
import uuid
from kubernetes import client, config
from kubernetes.client import ApiException

_core = None
_apps = None


def _load():
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
    return os.getenv("K8S_NAMESPACE", "per-user")


def _name(user_id, challenge_id):
    return f"ctf-u{user_id}-c{challenge_id}-{uuid.uuid4().hex[:6]}"


def _image_pull_secrets():
    raw = os.getenv("K8S_IMAGE_PULL_SECRETS", "").strip()
    if not raw:
        return None
    names = [name.strip() for name in raw.split(",") if name.strip()]
    if not names:
        return None
    return [client.V1LocalObjectReference(name=n) for n in names]


def _ensure_namespace():
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
    try:
        value = int(os.getenv("K8S_TTL_SECONDS", "900"))
        return value if value > 0 else None
    except (TypeError, ValueError):
        return None


def _extend_seconds():
    try:
        value = int(os.getenv("K8S_EXTEND_SECONDS", "300"))
        return value if value > 0 else 300
    except (TypeError, ValueError):
        return 300


def start_instance(*, user_id, challenge_id, image, tag=None, port=80):
    _load()
    _ensure_namespace()
    ns = _ns()
    name = _name(user_id, challenge_id)
    full_image = f"{image}:{tag}" if tag else image
    now = str(int(time.time()))

    ttl = _ttl_seconds()
    annotations = {"created_at": now, "last_seen": now}
    if ttl:
        annotations["expires_at"] = str(int(now) + ttl)

    dep = client.V1Deployment(
        metadata=client.V1ObjectMeta(
            name=name,
            labels={"app": name, "component": "user-instance"},
            annotations=annotations,
        ),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(match_labels={"app": name}),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels={"app": name}),
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
        metadata=client.V1ObjectMeta(name=name),
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
    return response


def stop_instance(instance_id):
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


def extend_instance(instance_id, seconds=None):
    _load()
    ns = _ns()
    extend_by = seconds if seconds is not None else _extend_seconds()
    now = int(time.time())

    dep = _apps.read_namespaced_deployment(instance_id, ns)
    annotations = (dep.metadata.annotations or {}).copy()
    current_expires = int(annotations.get("expires_at", now))
    base = current_expires if current_expires > now else now
    new_expires = base + extend_by
    annotations["last_seen"] = str(now)
    annotations["expires_at"] = str(new_expires)

    patch = {"metadata": {"annotations": annotations}}
    _apps.patch_namespaced_deployment(instance_id, ns, patch)
    return {"instance_id": instance_id, "expires_at": new_expires, "ttl_remaining": new_expires - now}


def get_status(instance_id):
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
    }
    if expires_at_int is not None:
        response["expires_at"] = expires_at_int
        response["ttl_remaining"] = max(expires_at_int - now, 0)
    return response
