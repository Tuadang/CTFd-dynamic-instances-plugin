from CTFd.plugins import register_plugin_assets_directory
from CTFd.plugins.challenges import CHALLENGE_CLASSES

from .python.k8s import K8sChallenge
from .routes.k8s import k8s_blueprint


def load(app):
    # Challenge type
    CHALLENGE_CLASSES["k8s"] = K8sChallenge

    # Backend routes (Python logic, hidden from users)
    app.register_blueprint(k8s_blueprint)

    # Frontend assets
    register_plugin_assets_directory(
        app,
        base_path="/plugins/dynamic_instances/static",
    )
