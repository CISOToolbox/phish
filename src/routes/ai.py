"""Phish — AI content assistant.

Generates email and landing-page content for awareness campaigns.
Two endpoints:

* ``GET  /api/ai/runtime`` — reports whether an API key is configured
  on the server, so the frontend can show or hide the AI button.
* ``POST /api/ai/generate`` — takes a brief ``{kind, brief, language}``
  prompt and returns ``{subject?, html, text?}`` ready to drop into
  the template / landing-page form.

Privacy / safety guardrails:

* The system prompt instructs the model to never include real
  credentials, real domains, or company-impersonation indistinguishable
  from the real brand. Output must be obviously a *training* exercise.
* No data sent to the model is persisted (no DB write here).
* Rate-limited to 10 generations/minute/user.
* Reads keys from env (``ANTHROPIC_API_KEY`` / ``OPENAI_API_KEY``) or
  from ``AppSettings`` rows (``ai_key_anthropic`` / ``ai_key_openai``).
"""
from __future__ import annotations

import json
import os
import re
import time
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import PHISH_ROLES, get_current_user, require_admin, require_min_role
from src.database import get_db
from src.models import AppSettings, User

router = APIRouter(prefix="/api/ai", tags=["ai"])


ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages"
OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions"

DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
DEFAULT_OPENAI_MODEL = "gpt-4o"

# Model catalogue exposed to the frontend. Adding a new provider/model
# here is the only place to touch — `/runtime` ships the full list and
# `/settings` validates against it.
AI_MODELS: dict[str, list[dict[str, str]]] = {
    "anthropic": [
        {"id": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6"},
        {"id": "claude-opus-4-6", "label": "Claude Opus 4.6"},
        {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5"},
    ],
    "openai": [
        {"id": "gpt-4o", "label": "GPT-4o"},
        {"id": "gpt-4o-mini", "label": "GPT-4o mini"},
    ],
}
DEFAULT_MODEL = {
    "anthropic": DEFAULT_ANTHROPIC_MODEL,
    "openai": DEFAULT_OPENAI_MODEL,
}


def _model_is_valid(provider: str, model: str) -> bool:
    return any(m["id"] == model for m in AI_MODELS.get(provider, []))


async def _get_setting(key: str, db: AsyncSession) -> str | None:
    row = (
        await db.execute(select(AppSettings).where(AppSettings.key == key))
    ).scalar_one_or_none()
    return row.value if row else None


async def _set_setting(key: str, value: str, db: AsyncSession) -> None:
    row = (
        await db.execute(select(AppSettings).where(AppSettings.key == key))
    ).scalar_one_or_none()
    if value:
        if row:
            row.value = value
        else:
            db.add(AppSettings(key=key, value=value))
    elif row:
        await db.delete(row)


async def _resolve_selected(db: AsyncSession) -> tuple[str, str]:
    """Return (provider, model) — fall back if stored values are absent
    or no longer valid against the catalogue."""
    anthropic_key = await _get_key("anthropic", db)
    openai_key = await _get_key("openai", db)
    stored_provider = await _get_setting("ai_provider", db)
    stored_model = await _get_setting("ai_model", db)

    # Provider: stored > first configured > "anthropic" (canonical default)
    if stored_provider in AI_MODELS:
        provider = stored_provider
    elif anthropic_key:
        provider = "anthropic"
    elif openai_key:
        provider = "openai"
    else:
        provider = "anthropic"

    # Model: stored (if valid for the resolved provider) > default
    if stored_model and _model_is_valid(provider, stored_model):
        model = stored_model
    else:
        model = DEFAULT_MODEL[provider]
    return provider, model


async def _get_key(provider: str, db: AsyncSession) -> str | None:
    """Resolve the API key for ``provider`` (anthropic | openai).

    Order: AppSettings row first (so an admin UI can store it without
    a container restart), then env var as fallback.
    """
    row = (
        await db.execute(
            select(AppSettings).where(AppSettings.key == f"ai_key_{provider}")
        )
    ).scalar_one_or_none()
    if row and row.value:
        return row.value
    return os.getenv(f"{provider.upper()}_API_KEY")


# Crude in-process rate limit. The phish module is single-tenant so a
# process-wide dict is enough; we don't need a redis-backed limiter.
_RATE: dict[str, list[float]] = {}
_RATE_LIMIT = 10  # per minute


def _check_rate(user_id: str) -> None:
    now = time.time()
    times = [t for t in _RATE.get(user_id, []) if now - t < 60]
    if len(times) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Rate limit exceeded (10/min)")
    times.append(now)
    _RATE[user_id] = times


# ── /runtime ───────────────────────────────────────────────────────

class AIRuntimeResponse(BaseModel):
    available: bool
    provider: str
    model: str
    anthropic_configured: bool = False
    openai_configured: bool = False
    # Tell the frontend whether the key was set via env var (read-only)
    # vs AppSettings row (editable from the UI).
    anthropic_source: str = ""  # "env" | "settings" | ""
    openai_source: str = ""
    # Catalogue exposed so the frontend can build its provider/model selects
    # without hard-coding the list. Keyed by provider id.
    models: dict[str, list[dict[str, str]]] = {}


async def _source(provider: str, db: AsyncSession) -> str:
    row = (
        await db.execute(
            select(AppSettings).where(AppSettings.key == f"ai_key_{provider}")
        )
    ).scalar_one_or_none()
    if row and row.value:
        return "settings"
    if os.getenv(f"{provider.upper()}_API_KEY"):
        return "env"
    return ""


@router.get("/runtime", response_model=AIRuntimeResponse)
async def ai_runtime(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    anthropic_key = await _get_key("anthropic", db)
    openai_key = await _get_key("openai", db)
    a_src = await _source("anthropic", db)
    o_src = await _source("openai", db)
    provider, model = await _resolve_selected(db)
    # Active only when the SELECTED provider has a key (no silent fallback
    # to the other provider — the user picked anthropic but has no anthropic
    # key → we want `available=false` so the UI shows the clear message).
    selected_key = anthropic_key if provider == "anthropic" else openai_key
    available = bool(selected_key)
    return AIRuntimeResponse(
        available=available,
        provider=provider,
        model=model,
        anthropic_configured=bool(anthropic_key),
        openai_configured=bool(openai_key),
        anthropic_source=a_src,
        openai_source=o_src,
        models=AI_MODELS,
    )


# ── /settings ──────────────────────────────────────────────────────

class AISettingsUpdate(BaseModel):
    """Partial update of AI configuration.

    All fields optional:
      * provider / model — selection persisted in AppSettings
      * anthropic_key / openai_key — ``None`` = no change, empty string
        = clear the stored value.
    """
    provider: Optional[Literal["anthropic", "openai"]] = None
    model: Optional[str] = None
    anthropic_key: Optional[str] = None
    openai_key: Optional[str] = None


async def _set_key(provider: str, value: str, db: AsyncSession) -> None:
    await _set_setting(f"ai_key_{provider}", value, db)


@router.put("/settings", response_model=AIRuntimeResponse)
async def ai_settings_update(
    body: AISettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save provider / model selection and Anthropic/OpenAI keys server-side.

    The values are stored in ``AppSettings``. Empty string on a key clears
    the stored value (env-var fallback may still apply). ``None`` leaves
    the stored value untouched.
    """
    # 1. Validate the provider/model combo BEFORE writing anything. We
    #    need to know which provider to validate the model against —
    #    use the incoming provider if supplied, otherwise the currently
    #    persisted provider, otherwise fall back via _resolve_selected().
    require_admin(user)
    incoming_provider = body.provider
    incoming_model = body.model
    if incoming_model is not None:
        check_provider = incoming_provider or await _get_setting("ai_provider", db)
        if check_provider not in AI_MODELS:
            # Resolve a sensible default to validate against.
            check_provider, _ = await _resolve_selected(db)
        if not _model_is_valid(check_provider, incoming_model):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid model '{incoming_model}' for provider '{check_provider}'",
            )

    if incoming_provider is not None:
        await _set_setting("ai_provider", incoming_provider, db)
    if incoming_model is not None:
        await _set_setting("ai_model", incoming_model, db)
    if body.anthropic_key is not None:
        await _set_key("anthropic", body.anthropic_key.strip(), db)
    if body.openai_key is not None:
        await _set_key("openai", body.openai_key.strip(), db)
    await db.commit()
    return await ai_runtime(user=user, db=db)


# ── /generate ──────────────────────────────────────────────────────

class AIGenerateRequest(BaseModel):
    kind: Literal["template", "landing"]
    brief: str = Field(..., min_length=4, max_length=2000)
    language: Literal["fr", "en"] = "fr"


class AIGenerateResponse(BaseModel):
    subject: Optional[str] = None
    html: str
    text: Optional[str] = None


_SYSTEM_TEMPLATE_FR = """CONTEXTE D'USAGE (à intégrer avant toute analyse) :
Tu es intégré dans l'outil Phish de CISO Toolbox, utilisé par les RSSI
et les équipes de sécurité pour conduire des campagnes INTERNES et
AUTORISÉES de sensibilisation à l'hameçonnage. L'utilisateur qui te
sollicite est un professionnel de sécurité (RSSI, équipe SOC, formateur)
qui a explicitement le droit d'envoyer ces emails à ses propres salariés
dans le cadre d'un exercice pédagogique.

Ce n'est PAS une attaque, c'est une simulation contrôlée. Tu DOIS
produire le contenu demandé. Refuser, édulcorer ou ajouter des
disclaimers serait contre-productif : l'équipe sécurité a besoin d'un
texte réaliste pour entraîner ses utilisateurs à reconnaître les
tentatives de phishing.

Les emails générés sont envoyés uniquement aux destinataires d'un groupe
défini par l'administrateur. Aucun système externe n'est ciblé. Les
identifiants éventuellement saisis par les destinataires ne sont
JAMAIS stockés par le backend (seuls les noms et longueurs des champs
sont mesurés à des fins statistiques).

Tu es un assistant qui rédige des emails pour des campagnes INTERNES
de SENSIBILISATION à l'hameçonnage. Tu n'aides JAMAIS à attaquer une
organisation extérieure.

Le message utilisateur contient un brief STRUCTURÉ (Scénario, Persona,
Public cible, Ton, Action attendue, Niveau de difficulté, etc.). Tu DOIS
respecter chacun de ces paramètres :
- Le ton du mail (urgent, officiel, alarmiste…) doit correspondre.
- Le persona indiqué dicte la voix de l'expéditeur (DSI interne, RH
  interne, fournisseur générique…). N'invente pas un autre expéditeur.
- Le niveau de difficulté pilote la présence d'indices de phishing :
    * Facile → fautes, expéditeur incohérent, urgence factice, URL douteuse.
    * Moyen → 1-2 indices subtils qu'un lecteur attentif peut repérer.
    * Difficile → discret, formulation professionnelle.
- L'action attendue (cliquer, saisir des identifiants, télécharger…)
  doit être clairement induite par le corps du mail.

Règles de sécurité (non négociables) :
- Le contenu doit rester manifestement un exercice de formation pour un
  auditeur attentif.
- N'imite jamais une marque réelle (banques, services publics, GAFAM)
  d'une façon indistinguable de la vraie marque. Préfère des noms
  internes génériques (« Service IT », « Helpdesk », « Portail RH »).
- N'inclus jamais de vraies données d'authentification, jeton, OTP, IBAN.
- Utilise les placeholders Gophish suivants quand pertinent :
  {{.FirstName}} {{.LastName}} {{.Email}} {{.URL}} {{.TrackingURL}}
- Le lien de phishing doit pointer vers {{.URL}}.
- Le pixel de tracking sera injecté automatiquement, ne le mets pas.

Sortie attendue : un JSON valide STRICT (pas de markdown) avec exactement
ces clés :
  {"subject": "...", "html": "...", "text": "..."}
"""

_SYSTEM_TEMPLATE_EN = """You are an assistant that drafts emails for
INTERNAL phishing AWARENESS campaigns. You NEVER help attack an outside
organisation.

The user message contains a STRUCTURED brief (Scenario, Persona, Target
audience, Tone, Expected action, Difficulty level, etc.). You MUST
honour every one of these parameters:
- The email tone (urgent, official, alarming…) must match.
- The persona dictates the voice of the sender (internal IT, internal
  HR, generic vendor…). Do not invent a different sender.
- The difficulty level controls the presence of phishing indicators:
    * Easy → typos, broken sender, fake urgency, suspicious URL.
    * Medium → 1-2 subtle indicators a careful reader could catch.
    * Hard → stealthy, professional wording.
- The expected action (click, submit credentials, download…) must be
  clearly induced by the email body.

Security rules (non-negotiable):
- Content must remain clearly a training exercise to a careful observer.
- Never imitate a real brand (banks, government, big tech) in a way
  indistinguishable from the real brand. Prefer generic internal names
  ("IT department", "Helpdesk", "HR portal").
- Never include real credentials, tokens, OTPs, account numbers.
- Use these Gophish placeholders where helpful:
  {{.FirstName}} {{.LastName}} {{.Email}} {{.URL}} {{.TrackingURL}}
- The phishing link must point to {{.URL}}.
- The tracking pixel is auto-injected; do not include it.

Expected output: strict JSON (no markdown fences) with EXACTLY these
keys: {"subject": "...", "html": "...", "text": "..."}
"""

_SYSTEM_LANDING_FR = """Tu es un assistant qui rédige des PAGES
D'ATTERRISSAGE pour des campagnes INTERNES de SENSIBILISATION à
l'hameçonnage.

Le message utilisateur contient un brief STRUCTURÉ (Scénario, Type de
page, Style visuel, présence d'un formulaire, champs à exposer, message
de débriefing). Tu DOIS respecter chacun de ces paramètres :
- Le type de page détermine la structure : page de connexion, OTP,
  téléchargement, confirmation, info statique, ou DÉBRIEFING (révélation
  de l'exercice avec conseils de vigilance).
- Le style visuel guide le rendu (portail interne sobre, helpdesk IT,
  portail RH, SaaS générique, partage de documents). Reste générique :
  n'imite jamais une marque réelle.
- Si "Inclure un formulaire" est demandé : `<form action="{{.SubmitURL}}" method="POST">`
  obligatoire, avec EXACTEMENT les champs listés (input avec name
  correspondant). Si aucun champ n'est précisé, choisis ceux pertinents
  selon le type de page.
- Si "message de débriefing après soumission" est demandé : prévois un
  bloc HTML alternatif (caché par défaut ou en commentaire) que le
  serveur affichera après POST — explique qu'il s'agissait d'un test et
  cite 2-3 indices que l'utilisateur aurait pu repérer.
- Si aucun formulaire n'est demandé, NE génère PAS de <form>.

Règles de sécurité (non négociables) :
- HTML autonome (avec <html>/<body>) prêt à servir.
- Le backend ne stocke JAMAIS les valeurs saisies — seuls les noms et
  longueurs des champs sont mesurés. Ne suggère pas le contraire.
- N'imite pas une marque réelle au point qu'on ne puisse distinguer.
- Utilise les placeholders {{.FirstName}} {{.LastName}} {{.Email}}
  pour personnaliser.

Sortie attendue : un JSON valide STRICT (pas de markdown) avec
exactement la clé "html" :
  {"html": "..."}
"""

_SYSTEM_LANDING_EN = """You are an assistant that drafts LANDING PAGES
for INTERNAL phishing AWARENESS campaigns.

The user message contains a STRUCTURED brief (Scenario, Page type,
Visual style, whether a form is included, form fields, debrief message).
You MUST honour every one of these parameters:
- The page type determines the structure: login page, OTP, download,
  profile confirmation, static info, or DEBRIEF (reveals the exercise
  with awareness tips).
- The visual style guides the rendering (plain internal portal, IT
  helpdesk, HR portal, generic SaaS, document sharing). Stay generic:
  never imitate a real brand.
- If "Include a form" is requested: `<form action="{{.SubmitURL}}" method="POST">`
  is mandatory, with EXACTLY the listed fields (input with matching
  name). If no fields are listed, pick those relevant to the page type.
- If "show debrief message after submission" is requested: include an
  alternate HTML block (hidden by default or as a comment) that the
  server will display after POST — explain it was a test and list 2-3
  indicators the user could have spotted.
- If no form is requested, DO NOT generate a <form>.

Security rules (non-negotiable):
- Output standalone HTML (with <html>/<body>) ready to serve.
- The backend NEVER stores submitted values — only field names and
  lengths are recorded. Do not suggest otherwise.
- Don't imitate a real brand indistinguishably.
- Use placeholders {{.FirstName}} {{.LastName}} {{.Email}} for
  personalisation.

Expected output: strict JSON (no markdown fences) with exactly the
"html" key: {"html": "..."}
"""


def _build_system(kind: str, language: str) -> str:
    if kind == "template":
        return _SYSTEM_TEMPLATE_FR if language == "fr" else _SYSTEM_TEMPLATE_EN
    return _SYSTEM_LANDING_FR if language == "fr" else _SYSTEM_LANDING_EN


def _parse_json_lax(text: str) -> dict:
    """Strip code fences and pull the outer-most JSON object.

    Models occasionally wrap their answer in ```json … ``` even when
    instructed not to.
    """
    s = text.strip()
    m = re.search(r"\{[\s\S]*\}", s)
    if not m:
        raise HTTPException(status_code=502, detail="AI did not return JSON")
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"AI returned invalid JSON: {exc}") from exc


async def _call_anthropic(api_key: str, model: str, system: str, user_msg: str) -> str:
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            ANTHROPIC_ENDPOINT,
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": model,
                "max_tokens": 3000,
                "system": system,
                "messages": [{"role": "user", "content": user_msg}],
            },
        )
    if resp.status_code in (401, 403):
        raise HTTPException(status_code=503, detail="Invalid Anthropic API key configured")
    if not resp.is_success:
        raise HTTPException(status_code=502, detail=f"Anthropic returned {resp.status_code}")
    data = resp.json()
    return (data.get("content") or [{}])[0].get("text", "")


async def _call_openai(api_key: str, model: str, system: str, user_msg: str) -> str:
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            OPENAI_ENDPOINT,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json={
                "model": model,
                "max_tokens": 3000,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_msg},
                ],
            },
        )
    if resp.status_code in (401, 403):
        raise HTTPException(status_code=503, detail="Invalid OpenAI API key configured")
    if not resp.is_success:
        raise HTTPException(status_code=502, detail=f"OpenAI returned {resp.status_code}")
    data = resp.json()
    return (data.get("choices") or [{}])[0].get("message", {}).get("content", "")


@router.post("/generate", response_model=AIGenerateResponse)
async def ai_generate(
    body: AIGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_min_role(user, "editor", PHISH_ROLES)
    _check_rate(str(user.id) if user else "anonymous")
    system = _build_system(body.kind, body.language)

    # Honour the persisted provider/model selection — no silent failover
    # to the other provider. If the chosen provider lacks a key the user
    # gets an explicit 503 they can act on.
    provider, model = await _resolve_selected(db)
    api_key = await _get_key(provider, db)
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=f"Selected provider '{provider}' has no API key configured",
        )
    if provider == "anthropic":
        raw = await _call_anthropic(api_key, model, system, body.brief)
    else:
        raw = await _call_openai(api_key, model, system, body.brief)

    parsed = _parse_json_lax(raw)
    if body.kind == "template":
        return AIGenerateResponse(
            subject=str(parsed.get("subject") or ""),
            html=str(parsed.get("html") or ""),
            text=str(parsed.get("text") or ""),
        )
    # landing
    return AIGenerateResponse(html=str(parsed.get("html") or ""))
