from CTFd.plugins.challenges import BaseChallenge
from CTFd.utils import serializers
from CTFd.models import db, Challenges

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

        # Save custom field
        challenge.template = data.get("template")

        db.session.add(challenge)
        db.session.commit()
        return {
            "success": True,
            "data": serializers.serialize_challenge(challenge)
        }


    @staticmethod
    def read(challenge):
        return challenge


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
        return challenge


    @staticmethod
    def delete(challenge):
        db.session.delete(challenge)
        db.session.commit()

