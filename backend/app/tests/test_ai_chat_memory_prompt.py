from app.services.ai_chat_service import _build_system_prompt


def test_build_system_prompt_includes_memory_context_and_guardrails():
    prompt = _build_system_prompt(
        "Fer",
        memory_context="Cliente X suele pedir reposición los viernes.",
    )

    assert "Contexto de memoria del negocio (Engram, no fuente de verdad)" in prompt
    assert "Cliente X suele pedir reposición los viernes." in prompt
    assert "NUNCA inventés precios ni stock" in prompt
    assert "confiá únicamente en la base de datos" in prompt
