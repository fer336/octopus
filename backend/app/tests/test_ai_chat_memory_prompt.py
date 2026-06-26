from app.services.ai_chat_service import _build_system_prompt


def test_build_system_prompt_includes_memory_context_and_guardrails():
    prompt = _build_system_prompt(
        "Fer",
        memory_context="Cliente X suele pedir reposición los viernes.",
    )

    assert "🧠 MEMORIA DE CONVERSACIONES (NO son datos del catálogo)" in prompt
    assert "Cliente X suele pedir reposición los viernes." in prompt
    assert "NUNCA inventes productos, precios, stock ni datos" in prompt
    assert "Usá ÚNICAMENTE los datasets y herramientas" in prompt
