export default function ReferenceQuickAnalysis({ referenceVideo, onPracticeWithStyle }) {
  const profile = referenceVideo?.reference_profile || {};
  const targets = referenceVideo?.benchmark_targets || {};
  const keywords = profile.top_keywords || [];
  const keywordList = (keywords.length
    ? keywords
    : ["경제 해설", "고밀도 설명", "짧은 쉼", "음량 강조"]
  ).slice(0, 6);

  const features = [
    {
      label: "속도",
      value: profile.speech_rate_summary || targets.speech_rate || "기준 영상처럼 이해 가능한 말하기 속도를 목표로 봅니다.",
    },
    {
      label: "화법",
      value: profile.speaking_style || profile.tone || targets.speaking_style || "기준 발표와 비슷하게 설명 흐름이 자연스러운지 봅니다.",
    },
    {
      label: "쉼",
      value: profile.pause_timing_summary || targets.pause_timing || "중요한 문장 뒤에 짧은 멈춤이 들어가는지 봅니다.",
    },
    {
      label: "강조",
      value: profile.emphasis_summary || targets.emphasis || "핵심 단어를 분명하게 강조하는지 봅니다.",
    },
  ];

  return (
    <div className="reference-analysis-layout">
      <div className="reference-analysis-main">
        <div className="reference-analysis-note">
          <strong>Reference Profile</strong>
          <div>
            {keywordList.map((keyword) => (
              <span key={keyword}>{keyword}</span>
            ))}
          </div>
        </div>
        <div className="reference-analysis-grid compact">
          {features.map((item) => (
            <div className="reference-analysis-item" key={item.label}>
              <span>{item.label}</span>
              <p>{item.value}</p>
            </div>
          ))}
        </div>
      </div>
      {onPracticeWithStyle ? (
        <aside className="reference-practice-cta" aria-label="레퍼런스 스타일 적용">
          <button className="primary-button" type="button" onClick={onPracticeWithStyle}>
            이 스타일로 연습하기
          </button>
          <p>선택한 발표자의 말하기 속도, 쉬는 타이밍, 강조 방식을 현재 발표 피드백 기준으로 반영합니다.</p>
        </aside>
      ) : null}
    </div>
  );
}
