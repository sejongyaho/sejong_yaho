import json
import re
from typing import Any


def strip_code_fence(text: str) -> str:
    value = text.strip()
    match = re.fullmatch(r"```(?:\w+)?\s*(.*?)\s*```", value, flags=re.DOTALL)
    if match:
        return match.group(1).strip()
    return value


def parse_json_object(text: str) -> dict[str, Any]:
    value = strip_code_fence(text)

    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        start = value.find("{")
        end = value.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("AI response is not a JSON object.") from None
        parsed = json.loads(value[start : end + 1])

    if not isinstance(parsed, dict):
        raise ValueError("AI response JSON must be an object.")
    return parsed


def normalize_mermaid(text: str) -> str:
    mermaid = strip_code_fence(text)
    lines = [line.rstrip() for line in mermaid.splitlines() if line.strip()]
    if not lines:
        raise ValueError("AI response mermaid text is empty.")

    if lines[0].strip() != "graph LR":
        lines.insert(0, "graph LR")

    return "\n".join(lines)
