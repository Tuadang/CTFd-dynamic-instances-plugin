def serialize_challenge(challenge):
    # If it's already a dict, just return it
    if isinstance(challenge, dict):
        return challenge

    # Otherwise it's a SQLAlchemy model
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
