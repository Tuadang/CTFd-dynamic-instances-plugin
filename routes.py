import os
from typing import Any, Dict

import requests
from flask import Blueprint, current_app, jsonify, request

def _settings(prefix: str) -> Dict[str, str]:
    """Resolve service configuration with sensible fallbacks."""
    env_base = os.getenv(f"{prefix}_API_BASE", "")
    env_token = os.getenv(f"{prefix}_API_TOKEN", "")
    cfg_base = current_app.config.get(f"{prefix}_API_BASE", env_base)
    cfg_token = current_app.config.get(f"{prefix}_API_TOKEN", env_token)
    return {
        "base": cfg_base.rstrip("/"),
        "token": cfg_token,
    }


def _call_service(base: str, path: str, payload: Dict[str, Any], token: str = "", method: str = "POST") -> Dict[str, Any]:
    if not base:
        raise RuntimeError(f"Missing API base for {path}")

    url = f"{base}/{path.lstrip('/') }"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    response = requests.request(method=method, url=url, json=payload, headers=headers, timeout=15)
    response.raise_for_status()
    return response.json()


def _make_connection_string(data: Dict[str, Any]) -> str:
    ip = data.get("ip")
    port = data.get("port")
    if ip and port:
        return f"nc {ip} {port}"
    if ip:
        return str(ip)
    return ""


def load_routes(app):
    bp = Blueprint("dynamic_instances", __name__, url_prefix="/plugins/dynamic_instances")

    # Kubernetes-backed endpoints
    @bp.route("/k8s/start", methods=["POST"])
    def k8s_start():
        data = request.get_json() or {}
        cfg = _settings("K8S")
        try:
            svc_resp = _call_service(cfg["base"], "start", data, token=cfg["token"])
        except Exception as exc:  # pragma: no cover - passthrough error handling
            return jsonify({"status": "error", "message": str(exc)}), 502

        return jsonify({
            "status": svc_resp.get("status", "starting"),
            "instance_id": svc_resp.get("instance_id"),
            "ip": svc_resp.get("ip"),
            "port": svc_resp.get("port"),
            "expires_at": svc_resp.get("expires_at"),
            "connection_string": svc_resp.get("connection_string") or _make_connection_string(svc_resp),
            "type": "k8s",
        })

    @bp.route("/k8s/stop", methods=["POST"])
    def k8s_stop():
        data = request.get_json() or {}
        cfg = _settings("K8S")
        try:
            svc_resp = _call_service(cfg["base"], "stop", data, token=cfg["token"])
        except Exception as exc:
            return jsonify({"status": "error", "message": str(exc)}), 502

        return jsonify({
            "status": svc_resp.get("status", "stopped"),
            "instance_id": svc_resp.get("instance_id"),
            "type": "k8s",
        })

    @bp.route("/k8s/status", methods=["GET", "POST"])
    def k8s_status():
        data = request.get_json(silent=True) or request.args.to_dict() or {}
        cfg = _settings("K8S")
        if not cfg["base"]:
            return jsonify({"status": "error", "message": "K8S_API_BASE is not configured"}), 500
        try:
            svc_resp = _call_service(cfg["base"], "status", data, token=cfg["token"])
        except Exception as exc:
            return jsonify({"status": "error", "message": str(exc)}), 502

        return jsonify({
            "status": svc_resp.get("status", "unknown"),
            "instance_id": svc_resp.get("instance_id"),
            "ip": svc_resp.get("ip"),
            "port": svc_resp.get("port"),
            "expires_at": svc_resp.get("expires_at"),
            "connection_string": svc_resp.get("connection_string") or _make_connection_string(svc_resp),
            "type": "k8s",
        })

    # Proxmox-backed endpoints
    @bp.route("/vm/start", methods=["POST"])
    def vm_start():
        data = request.get_json() or {}
        cfg = _settings("PROXMOX")
        try:
            svc_resp = _call_service(cfg["base"], "start", data, token=cfg["token"])
        except Exception as exc:
            return jsonify({"status": "error", "message": str(exc)}), 502

        return jsonify({
            "status": svc_resp.get("status", "starting"),
            "instance_id": svc_resp.get("instance_id"),
            "ip": svc_resp.get("ip"),
            "port": svc_resp.get("port"),
            "expires_at": svc_resp.get("expires_at"),
            "connection_string": svc_resp.get("connection_string") or _make_connection_string(svc_resp),
            "type": "vm",
        })

    @bp.route("/vm/stop", methods=["POST"])
    def vm_stop():
        data = request.get_json() or {}
        cfg = _settings("PROXMOX")
        try:
            svc_resp = _call_service(cfg["base"], "stop", data, token=cfg["token"])
        except Exception as exc:
            return jsonify({"status": "error", "message": str(exc)}), 502

        return jsonify({
            "status": svc_resp.get("status", "stopped"),
            "instance_id": svc_resp.get("instance_id"),
            "type": "vm",
        })

    @bp.route("/vm/status", methods=["GET", "POST"])
    def vm_status():
        data = request.get_json(silent=True) or request.args.to_dict() or {}
        cfg = _settings("PROXMOX")
        if not cfg["base"]:
            return jsonify({"status": "error", "message": "PROXMOX_API_BASE is not configured"}), 500
        try:
            svc_resp = _call_service(cfg["base"], "status", data, token=cfg["token"])
        except Exception as exc:
            return jsonify({"status": "error", "message": str(exc)}), 502

        return jsonify({
            "status": svc_resp.get("status", "unknown"),
            "instance_id": svc_resp.get("instance_id"),
            "ip": svc_resp.get("ip"),
            "port": svc_resp.get("port"),
            "expires_at": svc_resp.get("expires_at"),
            "connection_string": svc_resp.get("connection_string") or _make_connection_string(svc_resp),
            "type": "vm",
        })

    app.register_blueprint(bp)
