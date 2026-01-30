# plugins/dynamic_instances/routes.py

from flask import Blueprint, request, jsonify
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user
from CTFd.models import Challenges

from ..runtime import start_instance, stop_instance, get_status
from ..python.k8s import _unpack_connection_info

k8s_blueprint = Blueprint("dynamic_instances", __name__)


@k8s_blueprint.route("/dynamic/start", methods=["POST"])
@authed_only
def start():
    user = get_current_user()
    data = request.get_json()
    challenge = Challenges.query.get_or_404(data["challenge_id"])

    image, tag, port = _unpack_connection_info(challenge.connection_info)

    return jsonify(
        start_instance(
            user_id=user.id,
            challenge_id=challenge.id,
            image=image,
            tag=tag,
            port=port or 80,
        )
    )


@k8s_blueprint.route("/dynamic/status", methods=["GET"])
@authed_only
def status():
    return jsonify(get_status(request.args["instance_id"]))


@k8s_blueprint.route("/dynamic/stop", methods=["POST"])
@authed_only
def stop():
    stop_instance(request.json["instance_id"])
    return jsonify({"status": "stopped"})
