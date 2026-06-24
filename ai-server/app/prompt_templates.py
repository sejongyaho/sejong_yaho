def code_flow_prompt(source_code: str, language: str) -> str:
    return f"""
아래 {language} 코드의 실행 흐름을 Mermaid.js graph LR 문법으로만 그려줘.

규칙:
- 출력은 Mermaid 스크립트 텍스트만 포함한다.
- Markdown 코드블록, 설명, 주석, React 코드는 절대 포함하지 않는다.
- 첫 줄은 반드시 graph LR 이어야 한다.
- 조건문, 반복문, 메서드 호출, 반환 흐름이 보이게 한다.
- 노드 라벨은 짧고 읽기 쉽게 작성한다.

소스코드:
{source_code}
""".strip()


def learning_blank_prompt(
    answer_code: str,
    stage: str,
    blank_count: int,
    language: str,
) -> str:
    return f"""
아래 {language} 정답 코드로 점진적 코딩 학습용 빈칸 문제를 만들어줘.

규칙:
- 현재 단계: {stage}
- 핵심 로직 {blank_count}곳을 ______ 로 바꾼다.
- 문법 구조는 최대한 유지한다.
- 정답 코드 전체를 공개하지 않는다.
- 출력은 스켈레톤 코드 텍스트만 포함한다.
- Markdown 코드블록이나 설명은 포함하지 않는다.

정답 코드:
{answer_code}
""".strip()


def hint_analysis_prompt(
    wrong_code: str,
    error_log: str,
    language: str,
    problem_title: str | None,
) -> str:
    title = problem_title or "제목 없음"
    return f"""
너는 코딩 학습 튜터다. 사용자가 채점에 실패했다.

규칙:
- 정답 코드는 절대 알려주지 않는다.
- 직접 수정 코드를 제시하지 않는다.
- 에러 원인을 간접적인 소크라테스식 질문으로 유도한다.
- 출력은 JSON 객체 하나만 포함한다.
- JSON 형식은 반드시 {{"hintLevel1": "...", "concept": "..."}} 이다.

문제 제목:
{title}

언어:
{language}

오답 코드:
{wrong_code}

에러 로그:
{error_log}
""".strip()


def variant_problem_prompt(
    problem_statement: str,
    pseudocode: str | None,
    core_algorithm: str,
) -> str:
    pseudo = pseudocode or "제공되지 않음"
    return f"""
아래 원본 문제와 같은 핵심 알고리즘을 유지하되, 현실 세계의 다른 비즈니스 상황으로 변형 문제를 만들어줘.

규칙:
- 핵심 알고리즘은 반드시 유지한다: {core_algorithm}
- 지문 배경은 원본과 다르게 만든다.
- 출력은 JSON 객체 하나만 포함한다.
- Markdown 코드블록이나 설명은 포함하지 않는다.
- JSON 형식은 반드시 다음 키를 포함한다:
  - title
  - story
  - inputDescription
  - outputDescription
  - constraints
  - testCases: 배열, 각 원소는 input과 expectedOutput 포함
  - coreAlgorithm

원본 지문:
{problem_statement}

원본 의사코드:
{pseudo}
""".strip()


def review_score_prompt(
    code: str,
    selected_line: int,
    review_text: str,
    language: str,
) -> str:
    return f"""
너는 10년 차 시니어 개발자다. 코드 리뷰 훈련에서 리뷰어의 코멘트를 채점해줘.

규칙:
- 선택한 라인의 실제 문제를 잘 짚었는지 평가한다.
- 점수는 0부터 100 사이 정수다.
- 출력은 JSON 객체 하나만 포함한다.
- JSON 형식은 반드시 {{"score": 85, "feedback": "..."}} 이다.
- Markdown 코드블록이나 설명은 포함하지 않는다.

언어:
{language}

선택 라인:
{selected_line}

리뷰 텍스트:
{review_text}

코드:
{code}
""".strip()
