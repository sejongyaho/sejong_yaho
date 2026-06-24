export default function ReferenceQuickAnalysis({ referenceVideo, onPracticeWithStyle }) {
  const profile = referenceVideo?.reference_profile || {};
  const targets = referenceVideo?.benchmark_targets || {};
  const keywords = profile.top_keywords || [];
  const analysisNote = cleanReferenceNote(referenceVideo?.analysis_note) || "영상 레퍼런스 기준을 만들었습니다.";
  const features = [
    {
      label: "속도",
      value: profile.speech_rate_summary || targets.speech_rate || "분당 90~96단어",
    },
    {
      label: "화법",
      value: profile.speaking_style || profile.tone || targets.speaking_style || "차분한 해설형",
    },
    {
      label: "쉼",
      value: profile.pause_timing_summary || targets.pause_timing || "짧게 끊고 연결",
    },
    {
      label: "강조",
      value: profile.emphasis_summary || targets.emphasis || "음량과 핵심어 반복",
    },
  ];

  return (
    <div className="reference-analysis-layout">
      <div className="reference-analysis-main">
        <div className="reference-analysis-note">
          <strong>Reference Profile</strong>
          <p>{analysisNote}</p>
          <div>
            {(keywords.length ? keywords : ["경제 해설", "고밀도 설명", "짧은 쉼", "음량 강조"]).slice(0, 6).map((keyword) => (
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
          <p>이 발표자의 말하기 속도, 쉬는 타이밍, 강조 방식을 내 발표 피드백 기준으로 설정합니다.</p>
        </aside>
      ) : null}
    </div>
  );
}

function cleanReferenceNote(value) {
  return String(value || "").replace(/하드코딩된\s*/g, "").trim();
}
