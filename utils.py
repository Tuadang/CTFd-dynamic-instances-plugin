def serialize_challenge(challenge):
    return {
        "id": challenge.id,
        "name": challenge.name,
        "description": challenge.description,
        "value": challenge.value,
        "category": challenge.category,
        "type": challenge.type,
        "template": getattr(challenge, "template", None),
        "state": challenge.state
    }
