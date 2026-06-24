import os
from pathlib import Path


def load_env_file() -> None:
    env_paths = [
        Path(__file__).resolve().parents[2] / ".env",
        Path(__file__).resolve().parents[1] / ".env",
    ]
    for env_path in env_paths:
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


load_env_file()

MAX_PRESENTATION_UPLOAD_BYTES = int(os.getenv("MAX_PRESENTATION_UPLOAD_BYTES", str(20 * 1024 * 1024)))
MAX_PRESENTATION_UPLOAD_FILES = int(os.getenv("MAX_PRESENTATION_UPLOAD_FILES", "4"))
MAX_VISION_MATERIAL_IMAGES = int(os.getenv("MAX_VISION_MATERIAL_IMAGES", "6"))
MAX_VISION_PAGES_PER_FILE = int(os.getenv("MAX_VISION_PAGES_PER_FILE", "3"))
GEMINI_RATE_WINDOW_SECONDS = int(os.getenv("GEMINI_RATE_WINDOW_SECONDS", "3600"))
GEMINI_MAX_CALLS_PER_WINDOW = int(os.getenv("GEMINI_MAX_CALLS_PER_WINDOW", "6"))
GEMINI_STATUS_CACHE_SECONDS = int(os.getenv("GEMINI_STATUS_CACHE_SECONDS", "600"))
OPENAI_AUDIENCE_MODEL = os.getenv("OPENAI_AUDIENCE_MODEL", "gpt-5.4-nano").strip() or "gpt-5.4-nano"
OPENAI_AUDIENCE_RATE_WINDOW_SECONDS = int(os.getenv("OPENAI_AUDIENCE_RATE_WINDOW_SECONDS", "3600"))
OPENAI_AUDIENCE_MAX_CALLS_PER_WINDOW = int(os.getenv("OPENAI_AUDIENCE_MAX_CALLS_PER_WINDOW", "96"))
OPENAI_AUDIENCE_MIN_INTERVAL_SECONDS = int(os.getenv("OPENAI_AUDIENCE_MIN_INTERVAL_SECONDS", "3"))
OPENAI_AUDIENCE_MAX_SESSION_CALLS = int(os.getenv("OPENAI_AUDIENCE_MAX_SESSION_CALLS", "34"))
MAX_SCRIPT_FILE_BYTES = 10 * 1024 * 1024
TEXT_EXTENSIONS = {".txt", ".md", ".markdown", ".text", ".csv", ".srt"}
SUPPORTED_SCRIPT_EXTENSIONS = TEXT_EXTENSIONS | {".pdf", ".docx", ".pptx"}
SESSION_STORE_PATH = Path(
    os.getenv(
        "SESSION_STORE_PATH",
        str(Path(__file__).resolve().parent / ".runtime" / "sessions.sqlite3"),
    )
)


def get_gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite").strip() or "gemini-3.1-flash-lite"
