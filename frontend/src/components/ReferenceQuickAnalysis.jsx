export default function ReferenceQuickAnalysis({ referenceVideo }) {
  const profile = referenceVideo?.reference_profile || {};
  const keywords = profile.top_keywords || [];
  const features = [
    { label: "속도", value: "분당 90~96단어" },
    { label: "화법", value: "차분한 해설형" },
    { label: "쉼", value: "짧게 끊고 연결" },
    { label: "강조", value: "음량과 핵심어 반복" },
  ];

  return (
    <>
      <div className="reference-analysis-note">
        <strong>Reference Profile</strong>
        <div>
          {(keywords.length ? keywords : ["경제 해설", "고밀도 설명", "짧은 쉼", "음량 강조"]).slice(0, 4).map((keyword) => (
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
    </>
  );
}
