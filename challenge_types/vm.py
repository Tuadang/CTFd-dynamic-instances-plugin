from CTFd.plugins.challenges import BaseChallenge
from CTFd.models import db, Challenges

class VMChallenge(BaseChallenge):
    id = "vm"
    name = "VM Challenge"
    templates = {
        "create": "/plugins/dynamic_instances/templates/vm_challenge.html",
        "update": "/plugins/dynamic_instances/templates/vm_challenge.html",
        "view": "/plugins/dynamic_instances/templates/vm_challenge.html"
    }
    scripts = {
        "create": "/plugins/dynamic_instances/static/js/vm.js",
        "update": "/plugins/dynamic_instances/static/js/vm.js",
        "view": "/plugins/dynamic_instances/static/js/vm.js"
    }

    @staticmethod
    def create(request):
        data = request.form
        challenge = Challenges(
            name=data["name"],
            description=data["description"],
            value=data["value"],
            category=data["category"],
            type="vm"
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
