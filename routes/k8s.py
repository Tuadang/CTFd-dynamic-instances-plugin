# plugins/dynamic_instances/routes.py

import logging
import os
import time
import uuid

from flask import Blueprint, request, jsonify
from kubernetes.config.config_exception import ConfigException
from sqlalchemy.exc import IntegrityError
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user
from CTFd.models import Challenges, db

from ..runtime import (
    start_instance,
    stop_instance,
    stop_instances_for,
    get_status,
    extend_instance,
    find_existing_instance,
)
from ..python.k8s import _unpack_connection_info
from ..models import K8sChallengeConfig, K8sInstanceSession

k8s_blueprint = Blueprint("dynamic_instances", __name__)
logger = logging.getLogger("dynamic_instances")


def _mock_enabled():
    """Enable mock responses for UI testing without Kubernetes."""
    return os.getenv("MOCK_K8S", "false").lower() in {"1", "true", "yes"}


def _get_session(user_id, challenge_id):
    """Fetch the active instance session for a user+challenge."""
    return K8sInstanceSession.query.filter_by(user_id=user_id, challenge_id=challenge_id).first()


def _set_session(user_id, challenge_id, instance_id):
    """Upsert the instance session for a user+challenge."""
    session = _get_session(user_id, challenge_id)
    if session:
        session.instance_id = instance_id
    else:
        session = K8sInstanceSession(user_id=user_id, challenge_id=challenge_id, instance_id=instance_id)
    db.session.add(session)
    db.session.commit()
    return session


def _clear_session(user_id, challenge_id, instance_id=None):
    """Remove matching sessions (optionally filtered by instance id)."""
    query = K8sInstanceSession.query.filter_by(user_id=user_id, challenge_id=challenge_id)
    if instance_id:
        query = query.filter_by(instance_id=instance_id)
    sessions = query.all()
    for session in sessions:
        db.session.delete(session)
    if sessions:
        db.session.commit()


@k8s_blueprint.route("/dynamic/start", methods=["POST"])
@authed_only
def start():
    """Start a new instance or return the current one if it exists."""
    user = get_current_user()
    data = request.get_json()
    logger.info("/dynamic/start called", extra={"user_id": user.id, "payload": data})
    if _mock_enabled():
        instance_id = f"mock-u{user.id}-c{data['challenge_id']}-{int(time.time())}"
        _set_session(user.id, data["challenge_id"], instance_id)
        return jsonify({"instance_id": instance_id, "status": "starting"})
    challenge = Challenges.query.get_or_404(data["challenge_id"])
    config = K8sChallengeConfig.query.filter_by(challenge_id=challenge.id).first()
    if config:
        image, tag, port = config.image, config.tag, config.port
    else:
        image, tag, port = _unpack_connection_info(challenge.connection_info)
    try:
        session = _get_session(user.id, challenge.id)
        if session:
            if session.instance_id.startswith("starting"):
                return jsonify({"status": "starting", "instance_id": session.instance_id})
            existing_status = get_status(session.instance_id)
            existing_state = existing_status.get("status") or existing_status.get("pod_phase")
            if existing_state in {"starting", "creating", "pending", "Pending"}:
                stop_instance(session.instance_id)
                _clear_session(user.id, challenge.id, session.instance_id)
                return jsonify({"status": "stopped_existing", "instance_id": session.instance_id})
            if existing_state not in {"stopped", "expired"}:
                return jsonify({"status": "already-running", **existing_status})
        existing_id = find_existing_instance(user.id, challenge.id)
        if existing_id:
            existing_status = get_status(existing_id)
            existing_state = existing_status.get("status") or existing_status.get("pod_phase")
            if existing_state in {"starting", "creating", "pending", "Pending"}:
                stop_instance(existing_id)
                return jsonify({"status": "stopped_existing", "instance_id": existing_id})
            if existing_state not in {"stopped", "expired"}:
                _set_session(user.id, challenge.id, existing_id)
                return jsonify({"status": "already-running", **existing_status})
        try:
            lock_id = f"starting:{uuid.uuid4().hex[:8]}"
            _set_session(user.id, challenge.id, lock_id)
        except IntegrityError:
            db.session.rollback()
            session = _get_session(user.id, challenge.id)
            if session:
                if session.instance_id.startswith("starting"):
                    return jsonify({"status": "starting", "instance_id": session.instance_id})
                return jsonify({"status": "already-running", "instance_id": session.instance_id})
        result = start_instance(
            user_id=user.id,
            challenge_id=challenge.id,
            image=image,
            tag=tag,
            port=port or 80,
        )
        if result.get("instance_id"):
            _set_session(user.id, challenge.id, result["instance_id"])
        return jsonify(result)
    except ConfigException as exc:
        logger.warning("Kubernetes config not available", exc_info=exc)
        return jsonify({"status": "error", "message": "Kubernetes config not available"}), 503
    except Exception:
        _clear_session(user.id, challenge.id)
        raise


@k8s_blueprint.route("/dynamic/status", methods=["GET"])
@authed_only
def status():
    """Return instance status and reconcile stale sessions."""
    user = get_current_user()
    instance_id = request.args.get("instance_id")
    challenge_id = request.args.get("challenge_id")
    logger.info(
        "/dynamic/status called",
        extra={"instance_id": instance_id, "challenge_id": challenge_id, "args": dict(request.args)},
    )
    if _mock_enabled():
        if not instance_id and challenge_id:
            session = _get_session(user.id, int(challenge_id))
            instance_id = session.instance_id if session else None
        return jsonify({"instance_id": instance_id, "status": "running", "ip": "127.0.0.1"})
    try:
        if not instance_id and challenge_id:
            session = _get_session(user.id, int(challenge_id))
            if session and session.instance_id.startswith("starting"):
                return jsonify({"status": "starting", "instance_id": session.instance_id})
            instance_id = session.instance_id if session else None
        if not instance_id and challenge_id:
            instance_id = find_existing_instance(user.id, int(challenge_id))
            if instance_id:
                _set_session(user.id, int(challenge_id), instance_id)
        if not instance_id:
            return jsonify({"status": "stopped", "ttl_remaining": 0})
        result = get_status(instance_id)
        state = result.get("status") or result.get("pod_phase")
        if challenge_id and state in {"expired", "stopped"}:
            _clear_session(user.id, int(challenge_id), instance_id)
        return jsonify(result)
    except ConfigException as exc:
        logger.warning("Kubernetes config not available", exc_info=exc)
        return jsonify({"status": "error", "message": "Kubernetes config not available"}), 503


@k8s_blueprint.route("/dynamic/stop", methods=["POST"])
@authed_only
def stop():
    """Stop and clean up an instance for a user+challenge."""
    payload = request.get_json() or {}
    logger.info("/dynamic/stop called", extra={"payload": payload})
    if _mock_enabled():
        if payload.get("challenge_id"):
            _clear_session(get_current_user().id, payload["challenge_id"], payload.get("instance_id"))
        return jsonify({"status": "stopped"})
    try:
        instance_id = payload.get("instance_id")
        challenge_id = payload.get("challenge_id")
        if not instance_id and challenge_id:
            session = _get_session(get_current_user().id, challenge_id)
            instance_id = session.instance_id if session else None
        if instance_id:
            stop_instance(instance_id)
        if challenge_id:
            stop_instances_for(get_current_user().id, challenge_id)
        if challenge_id:
            _clear_session(get_current_user().id, challenge_id, instance_id)
    except ConfigException as exc:
        logger.warning("Kubernetes config not available", exc_info=exc)
        return jsonify({"status": "error", "message": "Kubernetes config not available"}), 503
    return jsonify({"status": "stopped"})


@k8s_blueprint.route("/dynamic/extend", methods=["POST"])
@authed_only
def extend():
    """Extend an instance TTL for a user+challenge."""
    payload = request.get_json() or {}
    instance_id = payload.get("instance_id")
    extend_seconds = payload.get("extend_seconds")
    logger.info("/dynamic/extend called", extra={"payload": payload})
    if not instance_id:
        challenge_id = payload.get("challenge_id")
        if challenge_id:
            session = _get_session(get_current_user().id, challenge_id)
            instance_id = session.instance_id if session else None
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
