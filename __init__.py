from CTFd.plugins import register_plugin_assets_directory
from CTFd.plugins.challenges import CHALLENGE_CLASSES
from .challenge_types.k8s import K8sChallenge
from .challenge_types.vm import VMChallenge
from .routes import load_routes

def load(app):
    # Register challenge types
    CHALLENGE_CLASSES["k8s"] = K8sChallenge
    CHALLENGE_CLASSES["vm"] = VMChallenge

    # Register routes
    load_routes(app)

    # Register static assets (JS/CSS)
    register_plugin_assets_directory(app, base_path="/plugins/dynamic_instances/static")
