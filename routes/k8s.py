# plugins/dynamic_instances/routes.py

import logging
import os
import time

from flask import Blueprint, request, jsonify
from kubernetes.config.config_exception import ConfigException
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user
from CTFd.models import Challenges

from ..runtime import start_instance, stop_instance, get_status, extend_instance
from ..python.k8s import _unpack_connection_info
from ..models import K8sChallengeConfig

k8s_blueprint = Blueprint("dynamic_instances", __name__)
logger = logging.getLogger("dynamic_instances")


def _mock_enabled():
    return os.getenv("MOCK_K8S", "false").lower() in {"1", "true", "yes"}


@k8s_blueprint.route("/dynamic/start", methods=["POST"])
@authed_only
def start():
    user = get_current_user()
    data = request.get_json()
    logger.info("/dynamic/start called", extra={"user_id": user.id, "payload": data})
    if _mock_enabled():
        instance_id = f"mock-u{user.id}-c{data['challenge_id']}-{int(time.time())}"
        return jsonify({"instance_id": instance_id, "status": "starting"})
    challenge = Challenges.query.get_or_404(data["challenge_id"])
    config = K8sChallengeConfig.query.filter_by(challenge_id=challenge.id).first()
    if config:
        image, tag, port = config.image, config.tag, config.port
    else:
        image, tag, port = _unpack_connection_info(challenge.connection_info)
    try:
        return jsonify(
            start_instance(
                user_id=user.id,
                challenge_id=challenge.id,
                image=image,
                tag=tag,
                port=port or 80,
            )
        )
    except ConfigException as exc:
        logger.warning("Kubernetes config not available", exc_info=exc)
        return jsonify({"status": "error", "message": "Kubernetes config not available"}), 503


@k8s_blueprint.route("/dynamic/status", methods=["GET"])
@authed_only
def status():
    instance_id = request.args.get("instance_id")
    logger.info("/dynamic/status called", extra={"instance_id": instance_id, "args": dict(request.args)})
    if _mock_enabled():
        return jsonify({"instance_id": instance_id, "status": "running", "ip": "127.0.0.1"})
    try:
        return jsonify(get_status(instance_id))
    except ConfigException as exc:
        logger.warning("Kubernetes config not available", exc_info=exc)
        return jsonify({"status": "error", "message": "Kubernetes config not available"}), 503


@k8s_blueprint.route("/dynamic/stop", methods=["POST"])
@authed_only
def stop():
    payload = request.get_json() or {}
    logger.info("/dynamic/stop called", extra={"payload": payload})
    if _mock_enabled():
        return jsonify({"status": "stopped"})
    try:
        stop_instance(payload["instance_id"])
    except ConfigException as exc:
        logger.warning("Kubernetes config not available", exc_info=exc)
        return jsonify({"status": "error", "message": "Kubernetes config not available"}), 503
    return jsonify({"status": "stopped"})


@k8s_blueprint.route("/dynamic/extend", methods=["POST"])
@authed_only
def extend():
    payload = request.get_json() or {}
    instance_id = payload.get("instance_id")
    extend_seconds = payload.get("extend_seconds")
    logger.info("/dynamic/extend called", extra={"payload": payload})
    if not instance_id:
        return jsonify({"status": "error", "message": "instance_id required"}), 400
    if _mock_enabled():
        return jsonify({"instance_id": instance_id, "status": "extended"})
    try:
        result = extend_instance(instance_id, seconds=extend_seconds)
        return jsonify(result)
    except ConfigException as exc:
        logger.warning("Kubernetes config not available", exc_info=exc)
        return jsonify({"status": "error", "message": "Kubernetes config not available"}), 503
