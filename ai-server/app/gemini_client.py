import asyncio
from urllib.parse import quote

import httpx

from app.config import Settings
from app.schemas import GenerateRequest


class GeminiClientError(RuntimeError):
    pass


class GeminiClient:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def generate(self, request: GenerateRequest) -> tuple[str, str]:
        return await self.generate_text(
            prompt=request.prompt,
            system_instruction=request.system_instruction,
            model=request.model,
        )

    async def generate_text(
        self,
        prompt: str,
        system_instruction: str | None = None,
        model: str | None = None,
    ) -> tuple[str, str]:
        if not self.settings.gemini_api_key:
            raise GeminiClientError("GEMINI_API_KEY is not configured.")

        resolved_model = model or self.settings.gemini_model
        payload = self._build_payload(prompt, system_instruction)
        url = self._build_generate_url(resolved_model)

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await self._post_with_retry(client, url, payload)
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:500]
            raise GeminiClientError(f"Gemini API request failed: {detail}") from exc
        except httpx.HTTPError as exc:
            raise GeminiClientError("Could not connect to Gemini API.") from exc

        text = self._extract_text(response.json())
        return text, resolved_model

    async def _post_with_retry(
        self,
        client: httpx.AsyncClient,
        url: str,
        payload: dict,
    ) -> httpx.Response:
        retry_status_codes = {429, 500, 502, 503, 504}
        last_response: httpx.Response | None = None

        for attempt in range(3):
            response = await client.post(url, json=payload)
            last_response = response

            if response.status_code not in retry_status_codes:
                response.raise_for_status()
                return response

            if attempt < 2:
                await asyncio.sleep(1.5 * (attempt + 1))

        assert last_response is not None
        last_response.raise_for_status()
        return last_response

    def _build_generate_url(self, model: str) -> str:
        base_url = self.settings.gemini_base_url.rstrip("/")
        encoded_model = quote(model, safe="")
        return f"{base_url}/models/{encoded_model}:generateContent?key={self.settings.gemini_api_key}"

    def _build_payload(self, prompt: str, system_instruction: str | None) -> dict:
        payload: dict = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                }
            ]
        }

        if system_instruction:
            payload["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }

        return payload

    def _extract_text(self, data: dict) -> str:
        candidates = data.get("candidates") or []
        if not candidates:
            raise GeminiClientError("Gemini response has no candidates.")

        parts = candidates[0].get("content", {}).get("parts") or []
        text = "".join(part.get("text", "") for part in parts).strip()

        if not text:
            raise GeminiClientError("Gemini response text is empty.")

        return text
