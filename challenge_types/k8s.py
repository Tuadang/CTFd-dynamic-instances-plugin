from CTFd.plugins.challenges import BaseChallenge
from CTFd.models import db, Challenges
from flask import render_template

class K8sChallenge(BaseChallenge):
    id = "k8s"
    name = "Kubernetes Challenge"
    templates = {
        "create": "/plugins/dynamic_instances/templates/k8s_challenge.html",
        "update": "/plugins/dynamic_instances/templates/k8s_challenge.html",
        "view": "/plugins/dynamic_instances/templates/k8s_challenge.html"
    }
    scripts = {
        "create": "/plugins/dynamic_instances/static/js/k8s.js",
        "update": "/plugins/dynamic_instances/static/js/k8s.js",
        "view": "/plugins/dynamic_instances/static/js/k8s.js"
    }

    @staticmethod
    def create(request):
        data = request.form
        challenge = Challenges(
            name=data["name"],
            description=data["description"],
            value=data["value"],
            category=data["category"],
            type="k8s"
        )
        db.session.add(challenge)
        db.session.commit()
        return challenge

    @staticmethod
    def read(challenge):
        return challenge

    @staticmethod
    def update(challenge, request):
        data = request.form
        challenge.name = data["name"]
        challenge.description = data["description"]
        challenge.value = data["value"]
        challenge.category = data["category"]
        db.session.commit()
        return challenge

    @staticmethod
    def delete(challenge):
        db.session.delete(challenge)
        db.session.commit()
