"""CTFd plugin entrypoint for dynamic Kubernetes instances."""

import os

from CTFd.plugins import register_plugin_assets_directory
from CTFd.plugins.challenges import CHALLENGE_CLASSES
from CTFd.models import db

from .python.k8s import K8sChallenge
from .models import K8sChallengeConfig, K8sInstanceSession
from .routes.k8s import k8s_blueprint


def load(app):
    # Register the custom challenge type
    CHALLENGE_CLASSES["k8s"] = K8sChallenge

    # Backend API routes used by the frontend
    app.register_blueprint(k8s_blueprint, url_prefix="/plugins/dynamic_instances")

    # Create plugin tables and optionally purge sessions on startup
    with app.app_context():
        db.create_all()
        if os.getenv("CLEAR_K8S_SESSIONS_ON_START", "false").lower() in {"1", "true", "yes"}:
            db.session.query(K8sInstanceSession).delete()
            db.session.commit()

    # Static assets (JS/CSS) exposed to the browser
    register_plugin_assets_directory(
        app,
        base_path="/plugins/dynamic_instances/static",
    )
