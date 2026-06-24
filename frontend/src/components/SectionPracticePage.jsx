import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Mic2, RefreshCcw, Save, TimerReset } from "lucide-react";
import { referenceProfiles, sectionImprovements } from "../data/referencePractice";

const sectionOrder = ["intro", "body", "closing"];

export default function SectionPracticePage({
  activeSection = "intro",
  onBack,
  onComplete,
  onGoRecords,
  record,
  topNavigation,
}) {
  const [currentSection, setCurrentSection] = useState(sectionImprovements[activeSection] ? activeSection : "intro");
  const [completedSection, setCompletedSection] = useState("");
  const section = sectionImprovements[currentSection];
  const profile = referenceProfiles[record?.referenceType] || referenceProfiles.startupPitch;
  const scorePreview = useMemo(() => {
    const before = record?.scores?.pause || 66;
    return {
      before,
      after: Math.min(100, before + 12),
    };
  }, [record]);

  const completePractice = () => {
    onComplete?.(currentSection);
    setCompletedSection(currentSection);
  };

  return (
    <>
      {topNavigation}
      <header className="section-practice-header">
        <button className="icon-button ghost" type="button" onClick={onBack} title="돌아가기">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="eyebrow">Section rehearsal</p>
          <h1>구간별 발표 연습</h1>
          <p>레퍼런스 발표와 비교해 부족한 구간만 다시 연습할 수 있습니다.</p>
        </div>
      </header>

      <section className="section-practice-shell">
        <aside className="section-practice-context">
          <span>기준 스타일</span>
          <h2>{profile.name}</h2>
          <p>{profile.description}</p>
          <div className="reference-targets">
            {profile.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <div className="section-score-preview">
            <TimerReset size={18} />
            <div>
              <strong>쉬는 타이밍 {scorePreview.before}점{" -> "}{scorePreview.after}점</strong>
              <p>완료하면 내 기록에 개선 점수로 반영됩니다.</p>
            </div>
          </div>
        </aside>

        <div className="section-practice-main">
          <div className="section-tabs" aria-label="연습 구간">
            {sectionOrder.map((sectionId) => (
              <button
                className={currentSection === sectionId ? "active" : ""}
                key={sectionId}
                type="button"
                onClick={() => setCurrentSection(sectionId)}
              >
                {sectionImprovements[sectionId].label}
              </button>
            ))}
          </div>

          <article className="section-practice-card">
            <div className="section-practice-card-head">
              <div>
                <span>{section.label}</span>
                <h2>{section.mission}</h2>
              </div>
              <Mic2 size={24} />
            </div>

            <div className="section-practice-grid">
              <div>
                <strong>레퍼런스 특징</strong>
                <p>{section.referenceFeature}</p>
              </div>
              <div>
                <strong>내 발표 문제</strong>
                <p>{section.myProblem}</p>
              </div>
            </div>

            <div className="mission-list">
              <strong>연습 미션</strong>
              <ol>
                {section.practiceMissions.map((mission) => <li key={mission}>{mission}</li>)}
              </ol>
            </div>

            <div className="section-practice-actions">
              <button className="secondary-button" type="button">
                <Mic2 size={17} />
                {section.label} 다시 녹음하기
              </button>
              <button className="primary-button" type="button" onClick={completePractice}>
                <Save size={17} />
                연습 완료
              </button>
            </div>
          </article>

          {completedSection ? (
            <section className="practice-complete-panel">
              <CheckCircle2 size={22} />
              <div>
                <strong>연습 결과가 저장되었습니다. 이전보다 쉬는 타이밍 점수가 12점 개선되었습니다.</strong>
                <p>{sectionImprovements[completedSection].label} 기록이 내 발표 성장 기록에 반영되었습니다.</p>
              </div>
              <div className="practice-complete-actions">
                <button className="secondary-button" type="button" onClick={() => setCompletedSection("")}>
                  <RefreshCcw size={17} />
                  한 번 더 연습하기
                </button>
                <button className="primary-button" type="button" onClick={onGoRecords}>
                  내 기록에서 변화 보기
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </>
  );
}
