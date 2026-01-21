def serialize_challenge(challenge):
    return {
        "id": challenge['id'] if isinstance(challenge, dict) else challenge.id,
        "name": challenge['name'] if isinstance(challenge, dict) else challenge.name,
        "description": challenge['description'] if isinstance(challenge, dict) else challenge.description,
        "value": challenge['value'] if isinstance(challenge, dict) else challenge.value,
        "category": challenge['category'] if isinstance(challenge, dict) else challenge.category,
        "type": challenge['type'] if isinstance(challenge, dict) else challenge.type,
        "template": getattr(challenge, "template", None),
        "state": challenge['state'] if isinstance(challenge, dict) else challenge.state
    }
