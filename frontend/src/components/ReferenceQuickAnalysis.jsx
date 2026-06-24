export default function ReferenceQuickAnalysis({ referenceVideo }) {
  const profile = referenceVideo?.reference_profile || {};
  const targets = referenceVideo?.benchmark_targets || {};
  const keywords = profile.top_keywords || [];
  const items = [
    {
      label: "말하기 속도",
      value: profile.speech_rate_summary || targets.speech_rate || "영상 음성 기준으로 속도를 분석합니다.",
    },
    {
      label: "화법",
      value: profile.speaking_style || profile.tone || targets.speaking_style || "설명 방식과 말투 흐름을 분석합니다.",
    },
    {
      label: "쉬는 타이밍",
      value: profile.pause_timing_summary || targets.pause_timing || "중요한 문장 뒤 쉬는 타이밍을 분석합니다.",
    },
    {
      label: "강조 방식",
      value: profile.emphasis_summary || targets.emphasis || "핵심어를 어떻게 강조하는지 분석합니다.",
    },
  ];

  return (
    <>
      <div className="reference-analysis-note">
        <strong>Reference Profile</strong>
        <p>{referenceVideo.analysis_note || "영상 레퍼런스 기준을 만들었습니다."}</p>
        {keywords.length ? (
          <div>
            {keywords.slice(0, 6).map((keyword) => (
              <span key={keyword}>{keyword}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="reference-analysis-grid">
        {items.map((item) => (
          <div className="reference-analysis-item" key={item.label}>
            <span>{item.label}</span>
            <p>{item.value}</p>
          </div>
        ))}
      </div>
    </>
  );
}
