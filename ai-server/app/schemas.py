from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field


T = TypeVar("T")


class ApiError(BaseModel):
    code: str
    message: str


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: ApiError | None = None

    @classmethod
    def ok(cls, data: T) -> "ApiResponse[T]":
        return cls(success=True, data=data, error=None)

    @classmethod
    def fail(cls, code: str, message: str) -> "ApiResponse[None]":
        return cls(success=False, data=None, error=ApiError(code=code, message=message))


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, description="Gemini에 전달할 사용자 요청")
    system_instruction: str | None = Field(
        default=None,
        description="Gemini에 함께 전달할 시스템 지시문",
    )
    model: str | None = Field(
        default=None,
        description="요청마다 덮어쓸 Gemini 모델명",
    )


class GenerateData(BaseModel):
    text: str
    model: str


class CodeFlowRequest(BaseModel):
    source_code: str = Field(..., min_length=1, description="시각화할 소스코드")
    language: str = Field(default="java", description="소스코드 언어")
    model: str | None = Field(default=None, description="요청마다 덮어쓸 Gemini 모델명")


class CodeFlowData(BaseModel):
    mermaid: str
    model: str


class LearningBlankRequest(BaseModel):
    problem_id: str = Field(..., min_length=1, description="Java 백엔드의 문제 ID")
    answer_code: str = Field(..., min_length=1, description="DB에서 조회한 원본 정답 코드")
    stage: str = Field(default="blank", description="학습 단계")
    blank_count: int = Field(default=3, ge=1, le=10, description="뚫을 빈칸 개수")
    language: str = Field(default="java", description="정답 코드 언어")
    model: str | None = Field(default=None, description="요청마다 덮어쓸 Gemini 모델명")


class LearningBlankData(BaseModel):
    problem_id: str
    skeleton_code: str
    model: str


class HintAnalysisRequest(BaseModel):
    wrong_code: str = Field(..., min_length=1, description="사용자의 오답 코드")
    error_log: str = Field(..., min_length=1, description="Piston 실행 결과 또는 StackTrace")
    problem_title: str | None = Field(default=None, description="문제 제목")
    language: str = Field(default="java", description="코드 언어")
    model: str | None = Field(default=None, description="요청마다 덮어쓸 Gemini 모델명")


class HintAnalysisData(BaseModel):
    hintLevel1: str
    concept: str
    model: str


class VariantProblemRequest(BaseModel):
    problem_id: str = Field(..., min_length=1, description="원본 문제 ID")
    problem_statement: str = Field(..., min_length=1, description="원본 문제 지문")
    pseudocode: str | None = Field(default=None, description="원본 의사코드")
    core_algorithm: str = Field(..., min_length=1, description="유지할 핵심 알고리즘")
    model: str | None = Field(default=None, description="요청마다 덮어쓸 Gemini 모델명")


class VariantProblemData(BaseModel):
    problem_id: str
    variant: dict[str, Any]
    model: str


class ReviewScoreRequest(BaseModel):
    code: str = Field(..., min_length=1, description="리뷰 대상 코드")
    selected_line: int = Field(..., ge=1, description="리뷰어가 선택한 라인 번호")
    review_text: str = Field(..., min_length=1, description="리뷰어가 작성한 리뷰")
    language: str = Field(default="java", description="코드 언어")
    model: str | None = Field(default=None, description="요청마다 덮어쓸 Gemini 모델명")


class ReviewScoreData(BaseModel):
    score: int = Field(..., ge=0, le=100)
    feedback: str
    model: str
