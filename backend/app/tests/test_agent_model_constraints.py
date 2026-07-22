"""Tests for external-agent model-level DB constraints."""

from sqlalchemy import CheckConstraint

from app.models.agent_credential import AgentCredential


def test_agent_credential_declares_surface_status_and_business_binding_constraints():
    constraints = {
        constraint.name: str(constraint.sqltext)
        for constraint in AgentCredential.__table__.constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert "ck_agent_credentials_surface" in constraints
    assert "tenant" in constraints["ck_agent_credentials_surface"]
    assert "platform" in constraints["ck_agent_credentials_surface"]
    assert "ck_agent_credentials_status" in constraints
    assert "active" in constraints["ck_agent_credentials_status"]
    assert "revoked" in constraints["ck_agent_credentials_status"]
    assert "ck_agent_credentials_business_binding" in constraints
    assert "business_id IS NOT NULL" in constraints["ck_agent_credentials_business_binding"]
    assert "business_id IS NULL" in constraints["ck_agent_credentials_business_binding"]
