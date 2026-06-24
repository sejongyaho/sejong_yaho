from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.gemini_client import GeminiClient, GeminiClientError
from app.prompt_templates import (
    code_flow_prompt,
    hint_analysis_prompt,
    learning_blank_prompt,
    review_score_prompt,
    variant_problem_prompt,
)
from app.response_parsers import normalize_mermaid, parse_json_object, strip_code_fence
from app.schemas import (
    ApiResponse,
    CodeFlowData,
    CodeFlowRequest,
    GenerateData,
    GenerateRequest,
    HintAnalysisData,
    HintAnalysisRequest,
    LearningBlankData,
    LearningBlankRequest,
    ReviewScoreData,
    ReviewScoreRequest,
    VariantProblemData,
    VariantProblemRequest,
)

app = FastAPI(title="Sejong Yaho AI Server")


@app.get("/health")
async def health() -> ApiResponse[dict[str, str]]:
    return ApiResponse.ok({"status": "ok"})


@app.post("/api/v1/generate", response_model=ApiResponse[GenerateData])
async def generate(
    request: GenerateRequest,
    settings: Settings = Depends(get_settings),
) -> ApiResponse[GenerateData]:
    client = GeminiClient(settings)

    try:
        text, model = await client.generate(request)
    except GeminiClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "GEMINI_API_ERROR",
                "message": str(exc),
            },
        ) from exc

    return ApiResponse.ok(GenerateData(text=text, model=model))


@app.post("/api/v1/code-flow", response_model=ApiResponse[CodeFlowData])
async def create_code_flow(
    request: CodeFlowRequest,
    settings: Settings = Depends(get_settings),
) -> ApiResponse[CodeFlowData]:
    text, model = await _generate_or_raise(
        settings=settings,
        prompt=code_flow_prompt(request.source_code, request.language),
        model=request.model,
    )
    return ApiResponse.ok(CodeFlowData(mermaid=_normalize_mermaid_or_raise(text), model=model))


@app.post("/api/v1/learning/blanks", response_model=ApiResponse[LearningBlankData])
async def create_learning_blanks(
    request: LearningBlankRequest,
    settings: Settings = Depends(get_settings),
) -> ApiResponse[LearningBlankData]:
    text, model = await _generate_or_raise(
        settings=settings,
        prompt=learning_blank_prompt(
            answer_code=request.answer_code,
            stage=request.stage,
            blank_count=request.blank_count,
            language=request.language,
        ),
        model=request.model,
    )
    return ApiResponse.ok(
        LearningBlankData(
            problem_id=request.problem_id,
            skeleton_code=strip_code_fence(text),
            model=model,
        )
    )


@app.post("/api/v1/hints/wrong-answer", response_model=ApiResponse[HintAnalysisData])
async def analyze_wrong_answer(
    request: HintAnalysisRequest,
    settings: Settings = Depends(get_settings),
) -> ApiResponse[HintAnalysisData]:
    text, model = await _generate_or_raise(
        settings=settings,
        prompt=hint_analysis_prompt(
            wrong_code=request.wrong_code,
            error_log=request.error_log,
            language=request.language,
            problem_title=request.problem_title,
        ),
        model=request.model,
    )
    parsed = _parse_json_or_raise(text)
    return ApiResponse.ok(
        HintAnalysisData(
            hintLevel1=str(parsed.get("hintLevel1") or ""),
            concept=str(parsed.get("concept") or ""),
            model=model,
        )
    )


@app.post("/api/v1/problems/variant", response_model=ApiResponse[VariantProblemData])
async def create_variant_problem(
    request: VariantProblemRequest,
    settings: Settings = Depends(get_settings),
) -> ApiResponse[VariantProblemData]:
    text, model = await _generate_or_raise(
        settings=settings,
        prompt=variant_problem_prompt(
            problem_statement=request.problem_statement,
            pseudocode=request.pseudocode,
            core_algorithm=request.core_algorithm,
        ),
        model=request.model,
    )
    return ApiResponse.ok(
        VariantProblemData(
            problem_id=request.problem_id,
            variant=_parse_json_or_raise(text),
            model=model,
        )
    )


@app.post("/api/v1/review/score", response_model=ApiResponse[ReviewScoreData])
async def score_code_review(
    request: ReviewScoreRequest,
    settings: Settings = Depends(get_settings),
) -> ApiResponse[ReviewScoreData]:
    text, model = await _generate_or_raise(
        settings=settings,
        prompt=review_score_prompt(
            code=request.code,
            selected_line=request.selected_line,
            review_text=request.review_text,
            language=request.language,
        ),
        model=request.model,
    )
    parsed = _parse_json_or_raise(text)
    score = max(0, min(100, int(parsed.get("score", 0))))
    return ApiResponse.ok(
        ReviewScoreData(
            score=score,
            feedback=str(parsed.get("feedback") or ""),
            model=model,
        )
    )


async def _generate_or_raise(
    settings: Settings,
    prompt: str,
    model: str | None = None,
) -> tuple[str, str]:
    client = GeminiClient(settings)

    try:
        return await client.generate_text(prompt=prompt, model=model)
    except GeminiClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "GEMINI_API_ERROR",
                "message": str(exc),
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "AI_RESPONSE_PARSE_ERROR",
                "message": str(exc),
            },
        ) from exc


def _parse_json_or_raise(text: str) -> dict:
    try:
        return parse_json_object(text)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "AI_RESPONSE_PARSE_ERROR",
                "message": str(exc),
            },
        ) from exc


def _normalize_mermaid_or_raise(text: str) -> str:
    try:
        return normalize_mermaid(text)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "AI_RESPONSE_PARSE_ERROR",
                "message": str(exc),
            },
        ) from exc


@app.exception_handler(HTTPException)
async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict):
        code = str(exc.detail.get("code", "HTTP_ERROR"))
        message = str(exc.detail.get("message", "요청 처리 중 오류가 발생했습니다."))
    else:
        code = "HTTP_ERROR"
        message = str(exc.detail)

    return JSONResponse(
        status_code=exc.status_code,
        content=ApiResponse.fail(code, message).model_dump(),
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=ApiResponse.fail("INVALID_REQUEST", "요청 값이 올바르지 않습니다.").model_dump(),
    )
