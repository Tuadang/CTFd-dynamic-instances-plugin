from CTFd.plugins.challenges import BaseChallenge
from CTFd.models import db, Challenges
from ..utils import serialize_challenge

class K8sChallenge(BaseChallenge):
    id = "k8s"
    name = "Kubernetes Challenge"
    templates = {
    "create": "/plugins/dynamic_instances/templates/k8s_create.html",
    "update": "/plugins/dynamic_instances/templates/k8s_update.html",
    "view": "/plugins/dynamic_instances/templates/k8s_view.html"
    }

    scripts = {
        "create": "/plugins/dynamic_instances/static/js/k8s_create.js",
        "update": "/plugins/dynamic_instances/static/js/k8s_update.js",
        "view": "/plugins/dynamic_instances/static/js/k8s_view.js"
    }

    @staticmethod
    def create(request):
        data = request.get_json()

        challenge = Challenges(
            name=data["name"],
            description=data["description"],
            value=data["value"],
            category=data["category"],
            type="k8s"
        )

        challenge.template = data.get("template")

        db.session.add(challenge)
        db.session.commit()
        
        # At this exact moment, challenge.id is available 
        print("New challenge ID:", challenge.id)

        # Manual serialization
        return {
            "success": True,
            "data": serialize_challenge(challenge)
        }




    @staticmethod
    def read(challenge):
        return serialize_challenge(challenge)


    @staticmethod
    def update(challenge, request):
        data = request.get_json()
        challenge.name = data["name"]
        challenge.description = data["description"]
        challenge.value = data["value"]
        challenge.category = data["category"]

        # Update custom field
        challenge.template = data.get("template")

        db.session.commit()
        return {
            "success": True,
            "data": serialize_challenge(challenge)
        }


    @staticmethod
    def delete(challenge):
        db.session.delete(challenge)
        db.session.commit()

