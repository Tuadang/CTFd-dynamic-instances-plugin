import json

from CTFd.plugins.challenges import BaseChallenge
from CTFd.models import db, Challenges
from CTFd.utils.user import get_current_user
from ..utils import serialize_challenge


def _parse_port(value):
    try:
        if value is None:
            return None
        if isinstance(value, str) and value.strip() == "":
            return None
        port = int(value)
        if 1 <= port <= 65535:
            return port
    except (TypeError, ValueError):
        return None
    return None


def _pack_connection_info(image, tag, port):
    # Store both values so older deployments that used connection_info for image keep working.
    payload = {"image": image, "tag": tag, "port": port}
    try:
        return json.dumps(payload)
    except Exception:
        return image


def _unpack_connection_info(raw):
    image = None
    port = None
    tag = None

    if isinstance(raw, str):
        # Try JSON first
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict):
                image = obj.get("image")
                port = _parse_port(obj.get("port"))
                tag = obj.get("tag")
        except Exception:
            # Legacy: raw was just the image string
            if _parse_port(raw) is None:
                image, tag = _split_image_tag(raw)
            else:
                port = _parse_port(raw)
    elif isinstance(raw, dict):
        image = raw.get("image")
        port = _parse_port(raw.get("port"))
        tag = raw.get("tag")

    return image, tag, port


def _split_image_tag(image_str):
    if not image_str:
        return None, None
    if "://" in image_str:
        return image_str, None
    last_slash = image_str.rfind("/")
    last_colon = image_str.rfind(":")
    if last_colon > last_slash:
        return image_str[:last_colon], image_str[last_colon + 1 :]
    return image_str, None


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
        image_input = data.get("template")
        image, tag = _split_image_tag(image_input)
        port = _parse_port(data.get("port"))

        if not image_input:
            return {"success": False, "errors": ["Image is required"]}, 400

        challenge = Challenges(
            name=data["name"],
            description=data["description"],
            value=data["value"],
            category=data["category"],
            type="k8s",
        )
        challenge.connection_info = _pack_connection_info(image, tag, port)
        if hasattr(challenge, "template"):
            challenge.template = image_input

        db.session.add(challenge)
        db.session.commit()
        # Return plain data; CTFd API wrapper will add success/data envelope
        return K8sChallenge.read(challenge)

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
            conn_raw = base.get("connection_info")
            image, tag, port = _unpack_connection_info(conn_raw)
            # Prefer template if explicitly set
            template_input = base.get("template")
            if template_input:
                image, tag = _split_image_tag(template_input)
            template_display = template_input or (f"{image}:{tag}" if image and tag else image)
            base["template"] = template_display
            base["image"] = image
            base["tag"] = tag
            base["port"] = port
            base["connection_info"] = None
        else:
            conn_raw = getattr(challenge, "connection_info", None)
            tpl = getattr(challenge, "template", None) if hasattr(challenge, "template") else None
            image, tag, port = _unpack_connection_info(conn_raw)
            if tpl:
                tpl_image, tpl_tag = _split_image_tag(tpl)
                image = tpl_image
                if tpl_tag:
                    tag = tpl_tag
            template_display = tpl or (f"{image}:{tag}" if image and tag else image)
            base = {
                "id": challenge.id,
                "name": challenge.name,
                "value": challenge.value,
                "description": challenge.description,
                "attribution": challenge.attribution,
                "connection_info": None,
                "next_id": challenge.next_id,
                "category": challenge.category,
                "state": challenge.state,
                "max_attempts": challenge.max_attempts,
                "logic": challenge.logic,
                "initial": challenge.initial if challenge.function != "static" else None,
                "decay": challenge.decay if challenge.function != "static" else None,
                "minimum": challenge.minimum if challenge.function != "static" else None,
                "function": challenge.function,
                "template": template_display,
                "image": image,
                "tag": tag,
                "port": port,
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
        if "template" in data and not data.get("template"):
            return {"success": False, "errors": ["Image is required"]}, 400
        if "name" in data:
            challenge.name = data["name"]
        if "description" in data:
            challenge.description = data["description"]
        if "value" in data:
            challenge.value = data["value"]
        if "category" in data:
            challenge.category = data["category"]
        if "template" in data:
            image_input = data.get("template")
            image, tag = _split_image_tag(image_input)
            if hasattr(challenge, "template"):
                challenge.template = image_input
        if "port" in data:
            port = _parse_port(data.get("port"))
        else:
            port = None

        # Always keep both in connection_info for compatibility
        current_image, current_tag, existing_port = _unpack_connection_info(challenge.connection_info)
        if "template" in data:
            current_image, current_tag = _split_image_tag(image_input)
        if "port" in data:
            existing_port = port

        challenge.connection_info = _pack_connection_info(current_image, current_tag, existing_port)
        db.session.commit()
        return K8sChallenge.read(challenge)

    @staticmethod
    def delete(challenge):
        db.session.delete(challenge)
        db.session.commit()
