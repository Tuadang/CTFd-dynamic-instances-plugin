from CTFd.plugins.challenges import BaseChallenge
from CTFd.models import db, Challenges
from CTFd.utils.user import get_current_user
from ..utils import serialize_challenge

class K8sChallenge(BaseChallenge):
    id = "k8s"
    name = "k8s"

    templates = {
        "create": "/plugins/dynamic_instances/templates/k8s_create.html",
        "update": "/plugins/dynamic_instances/templates/k8s_update.html",
        "view": "/plugins/dynamic_instances/templates/k8s_view.html",
    }

    scripts = {
        "create": "/plugins/dynamic_instances/static/js/k8s_create.js",
        "update": "/plugins/dynamic_instances/static/js/k8s_update.js",
        "view": "/plugins/dynamic_instances/static/js/k8s_view.js",
    }

    @staticmethod
    def create(request):
        data = request.get_json()

        challenge = Challenges(
            name=data["name"],
            description=data["description"],
            value=data["value"],
            category=data["category"],
            type="k8s",
        )

        challenge.template = data.get("template")

        db.session.add(challenge)
        db.session.commit()

        return {"success": True, "data": serialize_challenge(challenge)}

    @classmethod
    def read(cls, challenge):
        """
        This method is in used to access the data of a challenge in a format processable by the front end.

        :param challenge:
        :return: Challenge object, data dictionary to be returned to the user
        """
        # Accept either model instance or dict (CTFd may pass a dict in some flows)
        if isinstance(challenge, dict):
            base = dict(challenge)
        else:
            base = {
                "id": challenge.id,
                "name": challenge.name,
                "value": challenge.value,
                "description": challenge.description,
                "attribution": challenge.attribution,
                "connection_info": challenge.connection_info,
                "next_id": challenge.next_id,
                "category": challenge.category,
                "state": challenge.state,
                "max_attempts": challenge.max_attempts,
                "logic": challenge.logic,
                "initial": challenge.initial if challenge.function != "static" else None,
                "decay": challenge.decay if challenge.function != "static" else None,
                "minimum": challenge.minimum if challenge.function != "static" else None,
                "function": challenge.function,
                "template": getattr(challenge, "template", None),
                "type": challenge.type,
            }

        base["type_data"] = {
            "id": cls.id,
            "name": cls.name,
            "templates": cls.templates,
            "scripts": cls.scripts,
        }

        return base

    @staticmethod
    def update(challenge, request):
        data = request.get_json()
        challenge.name = data["name"]
        challenge.description = data["description"]
        challenge.value = data["value"]
        challenge.category = data["category"]
        challenge.template = data.get("template")
        db.session.commit()

        return {"success": True, "data": serialize_challenge(challenge)}

    @staticmethod
    def delete(challenge):
        db.session.delete(challenge)
        db.session.commit()
