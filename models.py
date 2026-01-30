from CTFd.models import db


class K8sChallengeConfig(db.Model):
    __tablename__ = "k8s_challenge_config"

    id = db.Column(db.Integer, primary_key=True)
    challenge_id = db.Column(db.Integer, db.ForeignKey("challenges.id"), unique=True, nullable=False)
    image = db.Column(db.String(256), nullable=True)
    tag = db.Column(db.String(128), nullable=True)
    port = db.Column(db.Integer, nullable=True)

    challenge = db.relationship("Challenges", lazy="joined")
