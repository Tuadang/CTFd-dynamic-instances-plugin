from CTFd.plugins.challenges import BaseChallenge
from CTFd.models import db, Challenges
from ..utils import serialize_challenge

class VMChallenge(BaseChallenge):
    id = "vm"
    name = "VM Challenge"
    templates = {
        "create": "/plugins/dynamic_instances/templates/vm_create.html",
        "update": "/plugins/dynamic_instances/templates/vm_update.html",
        "view": "/plugins/dynamic_instances/templates/vm_view.html"
    }
    scripts = {
        "create": "/plugins/dynamic_instances/static/js/vm_create.js",
        "update": "/plugins/dynamic_instances/static/js/vm_update.js",
        "view": "/plugins/dynamic_instances/static/js/vm_view.js"
    }

    @staticmethod
    def create(request):
        data = request.get_json()

        challenge = Challenges(
            name=data["name"],
            description=data["description"],
            value=data["value"],
            category=data["category"],
            type="vm"
        )

        challenge.template = data.get("template")

        db.session.add(challenge)
        db.session.commit()

        # Manual serialization
        return {
            "success": True,
            "data": serialize_challenge(challenge)
        }



    @staticmethod
    def read(challenge):
        return {
            "id": challenge.id,
            "name": challenge.name,
            "description": challenge.description,
            "value": challenge.value,
            "category": challenge.category,
            "type": challenge.type,
            "template": challenge.template
        }



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

