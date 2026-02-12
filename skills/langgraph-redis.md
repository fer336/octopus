# LangGraph con Redis Checkpointer - AI Agent Skill

> **Skill para implementar agentes conversacionales con estado persistente**

---

## 🎯 Propósito

Este skill define cómo implementar el **AI Agent** usando **LangGraph** con **Redis** como checkpointer para:

- ✅ Estado persistente de conversaciones
- ✅ Multi-turn conversations con contexto
- ✅ Rollback y time-travel de estados
- ✅ Multi-usuario con sesiones aisladas
- ✅ Performance optimizado (Redis in-memory)

---

## 🏗️ Arquitectura

### Stack Tecnológico

```yaml
Framework: LangGraph (no LangChain tradicional)
LLM Provider: OpenRouter API
Modelo: google/gemini-flash-1.5-8b
Checkpointer: Redis (in-memory)
State: TypedDict con MessagesState
Tools: langchain_core.tools.tool decorator
```

### Estructura de Archivos

```
backend/app/services/agent/
├── __init__.py
├── graph.py         # 🔄 Definición del grafo (workflow)
├── state.py         # 💾 Estado tipado del agente
├── nodes.py         # 🎯 Nodos del grafo (funciones)
├── tools.py         # 🛠️ Herramientas (function calling)
└── prompts.py       # 📝 System prompts

backend/app/core/
└── redis_client.py  # 🔌 Cliente Redis singleton
```

---

## 📋 Componentes del Sistema

### 1. Estado del Agente (state.py)

```python
from typing import TypedDict, List, Optional, Annotated
from langgraph.graph import MessagesState
from langchain_core.messages import BaseMessage

class AgentState(MessagesState):
    """
    Estado del agente financiero
    
    Hereda de MessagesState para tener:
    - messages: List[BaseMessage]  # Historial de mensajes
    
    Agrega campos específicos del dominio financiero
    """
    
    # Identificación del usuario
    user_id: str
    session_id: str
    
    # Contexto financiero
    transaction_context: Optional[dict]  # Última transacción consultada
    budget_context: Optional[dict]       # Presupuestos activos
    goal_context: Optional[dict]         # Objetivos de ahorro
    
    # Estado de la conversación
    intent: Optional[str]                # Intención detectada
    pending_confirmation: Optional[dict] # Acción pendiente de confirmar
    
    # Alertas y notificaciones
    budget_alerts: List[dict]            # Alertas de presupuesto
    payment_reminders: List[dict]        # Recordatorios de pago
    
    # Metadata
    tool_calls: List[dict]               # Tools ejecutados
    conversation_summary: Optional[str]  # Resumen de conversación
```

**Ventajas del estado tipado**:
- ✅ Type safety
- ✅ Autocomplete en IDE
- ✅ Validación automática
- ✅ Documentación integrada

---

### 2. Grafo del Agente (graph.py)

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.redis import RedisSaver
from app.core.redis_client import get_redis_client
from .state import AgentState
from .nodes import (
    process_user_input,
    execute_tools,
    generate_response,
    should_continue
)

def create_agent_graph():
    """Crea y compila el grafo del agente"""
    
    # 1. Crear grafo con estado tipado
    workflow = StateGraph(AgentState)
    
    # 2. Agregar nodos (funciones que procesan el estado)
    workflow.add_node("process_input", process_user_input)
    workflow.add_node("execute_tools", execute_tools)
    workflow.add_node("generate_response", generate_response)
    
    # 3. Definir punto de entrada
    workflow.set_entry_point("process_input")
    
    # 4. Definir flujo lineal
    workflow.add_edge("process_input", "execute_tools")
    
    # 5. Flujo condicional (loop para múltiples tools)
    workflow.add_conditional_edges(
        "execute_tools",
        should_continue,  # Función que decide el siguiente paso
        {
            "continue": "execute_tools",  # Loop (más tools por ejecutar)
            "end": "generate_response"     # Continuar al response
        }
    )
    
    # 6. Conectar response al final
    workflow.add_edge("generate_response", END)
    
    # 7. Configurar Redis checkpointer
    redis_client = get_redis_client()
    checkpointer = RedisSaver(redis_client)
    
    # 8. Compilar grafo
    app = workflow.compile(checkpointer=checkpointer)
    
    return app

# Singleton del grafo
_agent_graph = None

def get_agent_graph():
    """Obtiene instancia singleton del grafo"""
    global _agent_graph
    if _agent_graph is None:
        _agent_graph = create_agent_graph()
    return _agent_graph
```

**Beneficios del grafo**:
- ✅ Flujo visual y entendible
- ✅ Fácil agregar nodos nuevos
- ✅ Debugging con inspector visual
- ✅ Condicionales y loops nativos

---

### 3. Nodos del Grafo (nodes.py)

Cada nodo es una función que procesa el estado:

```python
from .state import AgentState
from langchain_core.messages import HumanMessage, AIMessage

async def process_user_input(state: AgentState) -> dict:
    """
    Nodo 1: Procesa el input del usuario
    
    - Extrae intención
    - Detecta entidades (montos, fechas, categorías)
    - Actualiza contexto
    """
    messages = state["messages"]
    last_message = messages[-1].content if messages else ""
    
    # Analizar intención (puede usar LLM o regex)
    intent = await detect_intent(last_message)
    
    # Extraer entidades
    entities = extract_entities(last_message)
    
    return {
        "intent": intent,
        "transaction_context": entities.get("transaction"),
        "processed": True
    }

async def execute_tools(state: AgentState) -> dict:
    """
    Nodo 2: Ejecuta herramientas (function calling)
    
    - Llama a OpenRouter con tools disponibles
    - Ejecuta los tools que el LLM solicita
    - Actualiza mensajes con resultados
    """
    from .tools import get_available_tools
    from app.core.openrouter import call_openrouter_with_tools
    
    messages = state["messages"]
    user_id = state["user_id"]
    
    # Llamar a OpenRouter con function calling
    response = await call_openrouter_with_tools(
        messages=messages,
        tools=get_available_tools(),
        user_id=user_id
    )
    
    # Ejecutar tool calls si los hay
    tool_results = []
    if hasattr(response, 'tool_calls') and response.tool_calls:
        for tool_call in response.tool_calls:
            result = await execute_tool_call(tool_call, user_id)
            tool_results.append(result)
    
    return {
        "messages": messages + [response],
        "tool_calls": tool_results
    }

async def generate_response(state: AgentState) -> dict:
    """
    Nodo 3: Genera respuesta final al usuario
    
    - Formatea resultados de tools
    - Genera respuesta natural
    - Actualiza summary de conversación
    """
    messages = state["messages"]
    tool_calls = state.get("tool_calls", [])
    
    # Generar respuesta basada en tool results
    response = format_agent_response(messages, tool_calls)
    
    # Actualizar summary
    summary = await generate_conversation_summary(messages)
    
    return {
        "messages": messages + [AIMessage(content=response)],
        "conversation_summary": summary
    }

def should_continue(state: AgentState) -> str:
    """
    Función condicional: ¿Continuar ejecutando tools?
    
    Returns:
        "continue" si hay más tools por ejecutar
        "end" si ya terminó
    """
    last_message = state["messages"][-1] if state["messages"] else None
    
    # Si el último mensaje tiene tool_calls pendientes
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        return "continue"
    
    return "end"
```

---

### 4. Redis Client (redis_client.py)

```python
import redis.asyncio as redis
from typing import Optional
import os

# Singleton del cliente Redis
_redis_client: Optional[redis.Redis] = None

def get_redis_client() -> redis.Redis:
    """
    Obtiene cliente Redis singleton
    
    Returns:
        redis.Redis: Cliente Redis asíncrono
    """
    global _redis_client
    
    if _redis_client is None:
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        redis_db = int(os.getenv("REDIS_DB", "0"))
        redis_password = os.getenv("REDIS_PASSWORD")
        
        _redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            db=redis_db,
            password=redis_password,
            decode_responses=False,  # ✅ LangGraph maneja encoding
            socket_connect_timeout=5,
            socket_timeout=5
        )
    
    return _redis_client

async def close_redis_client():
    """Cierra la conexión de Redis (cleanup)"""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
```

**Configuración en .env**:
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=  # Opcional
```

---

### 5. Herramientas (tools.py)

```python
from langchain_core.tools import tool
from typing import Optional
import httpx

@tool
async def get_monthly_summary(mes: int, anio: int, user_id: str) -> dict:
    """
    Obtiene resumen financiero mensual del usuario
    
    Args:
        mes: Mes (1-12)
        anio: Año (ej: 2026)
        user_id: ID del usuario
    
    Returns:
        dict: {
            "total_ingresos": float,
            "total_gastos": float,
            "balance": float,
            "top_categorias": List[dict]
        }
    """
    # Llamar al endpoint interno
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"http://localhost:8000/api/v1/transacciones/estadisticas",
            params={"mes": mes, "anio": anio},
            headers={"X-User-ID": user_id}
        )
        return response.json()

@tool
async def get_credit_card_debt(user_id: str) -> dict:
    """
    Obtiene deuda pendiente de tarjetas de crédito
    
    Args:
        user_id: ID del usuario
    
    Returns:
        dict: {
            "deuda_total_pesos": float,
            "deuda_total_dolares": float,
            "detalle_por_tarjeta": List[dict]
        }
    """
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"http://localhost:8000/api/v1/transacciones/tarjetas/deuda",
            headers={"X-User-ID": user_id}
        )
        return response.json()

@tool
async def create_transaction(
    descripcion: str,
    monto: float,
    tipo: str,
    user_id: str,
    categoria: Optional[str] = None,
    metodo_pago: Optional[str] = None
) -> dict:
    """
    Crea una nueva transacción - REQUIERE CONFIRMACIÓN DEL USUARIO
    
    Args:
        descripcion: Descripción de la transacción
        monto: Monto (siempre positivo)
        tipo: 'ingreso' o 'gasto'
        user_id: ID del usuario
        categoria: Nombre de la categoría (opcional)
        metodo_pago: Nombre del método de pago (opcional)
    
    Returns:
        dict: Transacción creada
    
    Note:
        Esta tool requiere confirmación explícita del usuario antes de ejecutarse
    """
    # Marcar como pendiente de confirmación
    return {
        "status": "pending_confirmation",
        "action": "create_transaction",
        "data": {
            "descripcion": descripcion,
            "monto": monto,
            "tipo": tipo,
            "categoria": categoria,
            "metodo_pago": metodo_pago
        },
        "message": f"¿Confirmas crear {tipo} de ${monto:,.2f} - {descripcion}?"
    }

# Lista de tools disponibles
def get_available_tools():
    """Retorna lista de herramientas disponibles para el agente"""
    return [
        get_monthly_summary,
        get_credit_card_debt,
        get_spending_by_category,
        get_budget_status,
        get_pending_payments,
        create_transaction,
        # ... más tools
    ]
```

---

## 🔄 Flujo de Ejecución

### Request Completo

```python
# 1. Usuario envía mensaje
POST /api/v1/agent/chat
{
    "message": "¿Cuánto gasté en comida este mes?",
    "thread_id": "user-123-session-456"  # Sesión persistente
}

# 2. Backend carga estado desde Redis
agent_graph = get_agent_graph()
current_state = await agent_graph.aget_state(
    config={"configurable": {"thread_id": "user-123-session-456"}}
)

# 3. Ejecutar grafo con nuevo mensaje
result = await agent_graph.ainvoke(
    {
        "messages": current_state["messages"] + [HumanMessage(content="¿Cuánto gasté en comida este mes?")],
        "user_id": "123"
    },
    config={"configurable": {"thread_id": "user-123-session-456"}}
)

# 4. Redis guarda estado automáticamente (checkpointer)

# 5. Retornar respuesta
return {
    "response": result["messages"][-1].content,
    "tool_calls": result["tool_calls"],
    "session_id": "user-123-session-456"
}
```

### Persistencia Automática

```python
# LangGraph con Redis checkpointer guarda automáticamente:
- ✅ Todos los mensajes (historial completo)
- ✅ Estado del agente (contexto, intención, etc)
- ✅ Tool calls ejecutados
- ✅ Resultados de herramientas
- ✅ Metadata de la conversación

# Usuario puede:
- ✅ Cerrar la app y volver → conversación continúa
- ✅ Ver historial completo
- ✅ Hacer rollback a estados anteriores (debugging)
```

---

## 🎯 Patterns y Best Practices

### Pattern 1: Nodos como Funciones Puras

```python
# ✅ CORRECTO - Función pura que retorna nuevo estado
async def my_node(state: AgentState) -> dict:
    """Procesa estado y retorna cambios"""
    # Leer del estado
    messages = state["messages"]
    user_id = state["user_id"]
    
    # Procesar
    result = await do_something(messages, user_id)
    
    # Retornar SOLO los campos que cambian
    return {
        "intent": result.intent,
        "transaction_context": result.context
    }
    # ✅ No mutar state directamente

# ❌ INCORRECTO - Mutar estado directamente
async def bad_node(state: AgentState) -> dict:
    state["intent"] = "new_intent"  # ❌ NO mutar
    return state
```

### Pattern 2: Conditional Edges

```python
def should_continue(state: AgentState) -> str:
    """Decide el siguiente paso basado en el estado"""
    
    # Si hay tool calls pendientes
    last_message = state["messages"][-1]
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        return "continue"  # Ejecutar más tools
    
    # Si hay confirmación pendiente
    if state.get("pending_confirmation"):
        return "wait_confirmation"
    
    # Si terminó
    return "end"

# Uso en grafo
workflow.add_conditional_edges(
    "execute_tools",
    should_continue,
    {
        "continue": "execute_tools",
        "wait_confirmation": "request_confirmation",
        "end": "generate_response"
    }
)
```

### Pattern 3: Thread ID por Usuario

```python
def get_thread_id(user_id: str, session_type: str = "chat") -> str:
    """
    Genera thread_id único por usuario y tipo de sesión
    
    Args:
        user_id: ID del usuario (UUID)
        session_type: Tipo de sesión ('chat', 'analysis', 'planning')
    
    Returns:
        str: Thread ID en formato "user-{user_id}-{session_type}"
    """
    return f"user-{user_id}-{session_type}"

# Uso
thread_id = get_thread_id("123", "chat")
# Output: "user-123-chat"

# Ejecutar grafo con thread_id
result = await agent_graph.ainvoke(
    {"messages": [...]},
    config={"configurable": {"thread_id": thread_id}}
)
```

### Pattern 4: Herramientas con Confirmación

```python
@tool
async def create_transaction(descripcion: str, monto: float, tipo: str, user_id: str):
    """Crea transacción - REQUIERE CONFIRMACIÓN"""
    
    # En lugar de ejecutar directamente, retornar acción pendiente
    return {
        "status": "pending_confirmation",
        "action": "create_transaction",
        "data": {...},
        "confirmation_message": f"¿Confirmas crear {tipo} de ${monto}?"
    }

# En el nodo que procesa tool results
async def handle_tool_result(state: AgentState) -> dict:
    """Procesa resultado de tool"""
    
    for tool_result in state["tool_calls"]:
        if tool_result.get("status") == "pending_confirmation":
            # Guardar en estado para próxima interacción
            return {
                "pending_confirmation": tool_result,
                "messages": state["messages"] + [
                    AIMessage(content=tool_result["confirmation_message"])
                ]
            }
    
    # Si no hay confirmaciones pendientes, continuar normal
    return {}
```

---

## 🚀 Endpoints del API Agent

### POST /agent/chat

```python
@router.post("/chat")
async def agent_chat(
    request: AgentChatRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db)
):
    """Chat con el agente IA"""
    
    # 1. Generar thread_id
    thread_id = get_thread_id(current_user.id, "chat")
    
    # 2. Obtener grafo
    agent_graph = get_agent_graph()
    
    # 3. Cargar estado actual (si existe)
    try:
        current_state = await agent_graph.aget_state(
            config={"configurable": {"thread_id": thread_id}}
        )
        messages = current_state.values.get("messages", [])
    except:
        messages = []
    
    # 4. Agregar mensaje del usuario
    messages.append(HumanMessage(content=request.message))
    
    # 5. Ejecutar grafo
    result = await agent_graph.ainvoke(
        {
            "messages": messages,
            "user_id": str(current_user.id),
            "session_id": thread_id
        },
        config={"configurable": {"thread_id": thread_id}}
    )
    
    # 6. Retornar respuesta
    return {
        "response": result["messages"][-1].content,
        "tool_calls": result.get("tool_calls", []),
        "session_id": thread_id
    }
```

---

## 💾 Redis: Configuración y Deployment

### Docker Compose

```yaml
services:
  redis:
    image: redis:7-alpine
    container_name: finanzas_redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  redis_data:
```

### Variables de Entorno

```bash
# backend/.env
REDIS_HOST=localhost  # En producción: nombre del servicio
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=  # Dejar vacío en dev, configurar en prod
```

### Dependencias Python

```toml
# pyproject.toml
dependencies = [
    "langgraph>=0.2.0",
    "langchain-core>=0.3.0",
    "redis[hiredis]>=5.0.0",
]
```

O en requirements.txt:
```txt
langgraph>=0.2.0
langchain-core>=0.3.0
redis[hiredis]>=5.0.0
```

---

## 🔍 Debugging y Monitoreo

### Ver Estado en Redis

```python
# Obtener estado actual de una sesión
from langgraph.checkpoint.redis import RedisSaver

async def debug_session(thread_id: str):
    """Debug de una sesión específica"""
    redis_client = get_redis_client()
    checkpointer = RedisSaver(redis_client)
    
    # Obtener todos los checkpoints
    checkpoints = await checkpointer.alist(
        config={"configurable": {"thread_id": thread_id}}
    )
    
    for checkpoint in checkpoints:
        print(f"Checkpoint ID: {checkpoint.id}")
        print(f"Timestamp: {checkpoint.ts}")
        print(f"Messages: {len(checkpoint.values['messages'])}")
```

### Limpiar Sesiones Viejas

```python
async def cleanup_old_sessions(days_old: int = 30):
    """Elimina sesiones antiguas de Redis"""
    import time
    
    redis_client = get_redis_client()
    cutoff_timestamp = time.time() - (days_old * 24 * 60 * 60)
    
    # Buscar keys antiguas
    keys = await redis_client.keys("checkpoint:*")
    
    for key in keys:
        ttl = await redis_client.ttl(key)
        # Eliminar si es vieja
        # ... lógica de limpieza
```

### Logs de Tool Execution

```python
import logging

logger = logging.getLogger(__name__)

async def execute_tools(state: AgentState) -> dict:
    """Ejecuta tools con logging"""
    
    logger.info(f"Ejecutando tools para user_id: {state['user_id']}")
    
    for tool_call in tool_calls:
        logger.info(f"  Tool: {tool_call.name}")
        logger.info(f"  Args: {tool_call.args}")
        
        result = await execute_tool_call(tool_call)
        
        logger.info(f"  Result: {result}")
    
    return {...}
```

---

## 📊 Ventajas vs LangChain Tradicional

| Feature | LangChain | LangGraph + Redis |
|---------|-----------|-------------------|
| **Flujo** | Linear/secuencial | ✅ Grafo (ciclos, condicionales) |
| **Estado** | Cadena de mensajes | ✅ Estado tipado + persistencia |
| **Debugging** | Logs | ✅ Inspector visual + checkpoints |
| **Rollback** | No | ✅ Sí (time-travel) |
| **Multi-turn** | Complicado | ✅ Nativo |
| **Persistencia** | Manual | ✅ Automática (Redis) |
| **Multi-usuario** | Complicado | ✅ Thread IDs |
| **Performance** | OK | ✅ Mejor (Redis in-memory) |

---

## ✅ Checklist de Implementación

Para implementar LangGraph + Redis:

### Fase 1: Setup
- [ ] Agregar dependencias (langgraph, redis)
- [ ] Configurar Redis en Docker Compose
- [ ] Crear `redis_client.py`
- [ ] Crear estructura `app/services/agent/`

### Fase 2: Estado y Grafo
- [ ] Definir `AgentState` en `state.py`
- [ ] Crear nodos en `nodes.py`
- [ ] Crear grafo en `graph.py`
- [ ] Configurar checkpointer

### Fase 3: Herramientas
- [ ] Migrar tools existentes a `tools.py`
- [ ] Agregar decorador `@tool`
- [ ] Implementar function calling

### Fase 4: Integración
- [ ] Actualizar endpoint `/agent/chat`
- [ ] Implementar thread_id por usuario
- [ ] Testing completo

### Fase 5: Deployment
- [ ] Actualizar Dockerfile
- [ ] Agregar Redis a docker-compose.yml
- [ ] Deploy a producción

---

## 🎓 Recursos

- [LangGraph Docs](https://langchain-ai.github.io/langgraph/)
- [LangGraph Checkpointer](https://langchain-ai.github.io/langgraph/concepts/persistence/)
- [Redis Python Client](https://redis.io/docs/clients/python/)
- [LangGraph vs LangChain](https://blog.langchain.dev/langgraph-vs-langchain/)

---

**Última Actualización**: 2026-02-07  
**Versión**: v3.0  
**Autor**: Sistema Financiero Personal Team
