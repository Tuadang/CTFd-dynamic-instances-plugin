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
        config.load_kube_config()
    _core = client.CoreV1Api()
    _apps = client.AppsV1Api()


def _ns():
    return os.getenv("K8S_NAMESPACE", "dynamic-instances")


def _name(user_id, challenge_id):
    return f"ctf-u{user_id}-c{challenge_id}-{uuid.uuid4().hex[:6]}"


def start_instance(*, user_id, challenge_id, image, tag=None, port=80):
    _load()
    ns = _ns()
    name = _name(user_id, challenge_id)
    full_image = f"{image}:{tag}" if tag else image
    now = str(int(time.time()))

    dep = client.V1Deployment(
        metadata=client.V1ObjectMeta(
            name=name,
            labels={"app": name, "component": "user-instance"},
            annotations={"created_at": now, "last_seen": now},
        ),
        spec=client.V1DeploymentSpec(
            replicas=1,
            selector=client.V1LabelSelector(match_labels={"app": name}),
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels={"app": name}),
                spec=client.V1PodSpec(
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
            type=os.getenv("K8S_SERVICE_TYPE", "ClusterIP"),
            selector={"app": name},
            ports=[client.V1ServicePort(port=port, target_port=port)],
        ),
    )

    _apps.create_namespaced_deployment(ns, dep)
    _core.create_namespaced_service(ns, svc)

    return {"instance_id": name, "status": "starting", "port": port}


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


def get_status(instance_id):
    _load()
    ns = _ns()

    svc = _core.read_namespaced_service(instance_id, ns)
    pods = _core.list_namespaced_pod(ns, label_selector=f"app={instance_id}")

    ip = None
    if svc.status and svc.status.load_balancer and svc.status.load_balancer.ingress:
        ip = svc.status.load_balancer.ingress[0].ip

    pod = pods.items[0] if pods.items else None

    return {
        "instance_id": instance_id,
        "ip": ip,
        "pod_phase": pod.status.phase if pod else None,
    }
