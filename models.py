"""Database models for the dynamic instances plugin."""

from datetime import datetime

from CTFd.models import db


class K8sChallengeConfig(db.Model):
    """Per-challenge configuration stored in the CTFd database."""
    __tablename__ = "k8s_challenge_config"

    id = db.Column(db.Integer, primary_key=True)
    # Links config to a single challenge
    challenge_id = db.Column(db.Integer, db.ForeignKey("challenges.id"), unique=True, nullable=False)
    # Container image details set in the challenge editor
    image = db.Column(db.String(256), nullable=True)
    tag = db.Column(db.String(128), nullable=True)
    port = db.Column(db.Integer, nullable=True)

    challenge = db.relationship("Challenges", lazy="joined")


class K8sInstanceSession(db.Model):
    """Tracks the active instance id for a user+challenge pair."""
    __tablename__ = "k8s_instance_session"

    id = db.Column(db.Integer, primary_key=True)
    # Session key fields
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    challenge_id = db.Column(db.Integer, db.ForeignKey("challenges.id"), nullable=False)
    instance_id = db.Column(db.String(128), nullable=False)
    # Basic timestamps for housekeeping/debugging
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # One active session per user+challenge
    __table_args__ = (db.UniqueConstraint("user_id", "challenge_id", name="uq_k8s_instance_session"),)
