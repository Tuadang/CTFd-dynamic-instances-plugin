from flask import Blueprint, request, jsonify

def load_routes(app):
    bp = Blueprint("dynamic_instances", __name__, url_prefix="/plugins/dynamic_instances")

    @bp.route("/start", methods=["POST"])
    def start_instance():
        data = request.get_json()
        challenge_type = data.get("challenge_type")
        # TODO: call provisioning service
        return jsonify({
            "status": "starting",
            "instance_id": "placeholder",
            "ip": None,
            "port": None,
            "expires_at": None,
            "type": challenge_type
        })

    @bp.route("/stop", methods=["POST"])
    def stop_instance():
        data = request.get_json()
        instance_id = data.get("instance_id")
        # TODO: call provisioning service
        return jsonify({
            "status": "stopped",
            "instance_id": instance_id
        })

    @bp.route("/status", methods=["POST"])
    def instance_status():
        data = request.get_json()
        instance_id = data.get("instance_id")
        # TODO: call provisioning service
        return jsonify({
            "status": "running",
            "instance_id": instance_id,
            "ip": "10.0.0.42",
            "port": 31337,
            "expires_at": "2026-01-21T11:15:00Z"
        })

    app.register_blueprint(bp)
