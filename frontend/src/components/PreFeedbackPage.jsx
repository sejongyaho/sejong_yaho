import { useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Clipboard,
  Copy,
  FilePlus2,
  FilePenLine,
  Flag,
  Pencil,
  Route,
  SquarePlay,
  Undo2,
  X,
} from "lucide-react";

function suggestionNeedle(suggestion) {
  return suggestion.status === "applied" ? suggestion.replacement : suggestion.original;
}

function nextPendingSuggestion(suggestions, currentId) {
  const pending = suggestions.filter((suggestion) => suggestion.status === "pending");
  if (!pending.length) return null;
  const currentIndex = pending.findIndex((suggestion) => suggestion.id === currentId);
  return pending[currentIndex + 1]?.id || pending[0].id;
}

function correctionCountByLabel(suggestions) {
  return suggestions.reduce((counts, suggestion) => {
    if (suggestion.status === "ignored") return counts;
    counts[suggestion.label] = (counts[suggestion.label] || 0) + 1;
    return counts;
  }, {});
}

function copyText(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

export function HighlightedText({ text, suggestions, selectedId, onSelectSuggestion }) {
  const paragraphs = text.split(/\n{2,}/);

  return (
    <div className="correction-text">
      {paragraphs.map((paragraph, paragraphIndex) => {
        const matches = suggestions
          .filter((suggestion) => suggestion.status !== "ignored")
          .map((suggestion) => ({
            suggestion,
            index: paragraph.indexOf(suggestionNeedle(suggestion)),
            text: suggestionNeedle(suggestion),
          }))
          .filter((match) => match.index >= 0 && match.text)
          .sort((a, b) => a.index - b.index || b.text.length - a.text.length);

        const nodes = [];
        let cursor = 0;
        matches.forEach((match) => {
          if (match.index < cursor) return;
          if (match.index > cursor) {
            nodes.push(paragraph.slice(cursor, match.index));
          }
          nodes.push(
            <button
              className={`script-highlight ${match.suggestion.color} ${selectedId === match.suggestion.id ? "active" : ""} ${match.suggestion.status === "applied" ? "applied" : ""}`}
              key={`${match.suggestion.id}-${paragraphIndex}`}
              type="button"
              onClick={() => onSelectSuggestion(match.suggestion.id)}
            >
              {match.text}
            </button>,
          );
          cursor = match.index + match.text.length;
        });
        nodes.push(paragraph.slice(cursor));

        return <p key={`${paragraph.slice(0, 16)}-${paragraphIndex}`}>{nodes}</p>;
      })}
    </div>
  );
}

export function CorrectionToolbar({
  autoScroll,
  onBack,
  onCopy,
  onCopyAll,
  onReset,
  onToggleAutoScroll,
  onComplete,
}) {
  return (
    <div className="correction-toolbar">
      <button className={`auto-scroll-toggle ${autoScroll ? "on" : ""}`} type="button" onClick={onToggleAutoScroll}>
        <span>자동스크롤</span>
        <i />
      </button>
      <div className="correction-toolbar-actions">
        <button type="button" onClick={onReset}><FilePlus2 size={17} />새로쓰기</button>
        <button type="button" onClick={onBack}><Undo2 size={17} />돌아가기</button>
        <button type="button" onClick={onCopy}><Copy size={17} />복사하기</button>
        <button type="button" onClick={onCopyAll}><Clipboard size={17} />전체복사</button>
        <button className="complete" type="button" onClick={onComplete}><Check size={17} />교정 완료</button>
      </div>
    </div>
  );
}

export function ScriptEditor({
  autoScroll,
  selectedId,
  scriptText,
  suggestions,
  onBack,
  onComplete,
  onCopy,
  onCopyAll,
  onReset,
  onSelectSuggestion,
  onToggleAutoScroll,
}) {
  const activeCount = suggestions.filter((suggestion) => suggestion.status === "pending").length;

  return (
    <section className="script-editor-panel">
      <div className="script-editor-head">
        <div>
          <span>AI Correction Workspace</span>
          <h2>교정 문서</h2>
        </div>
        <strong>{activeCount}개 검토 필요</strong>
      </div>
      <div className="correction-document" data-auto-scroll={autoScroll ? "on" : "off"}>
        <HighlightedText
          text={scriptText}
          suggestions={suggestions}
          selectedId={selectedId}
          onSelectSuggestion={onSelectSuggestion}
        />
      </div>
      <CorrectionToolbar
        autoScroll={autoScroll}
        onBack={onBack}
        onComplete={onComplete}
        onCopy={onCopy}
        onCopyAll={onCopyAll}
        onReset={onReset}
        onToggleAutoScroll={onToggleAutoScroll}
      />
    </section>
  );
}

export function SuggestionCard({ suggestion, selected, onApply, onIgnore, onReport, onSelect }) {
  const disabled = suggestion.status !== "pending";

  return (
    <article className={`suggestion-card ${suggestion.color} ${selected ? "selected" : ""} ${suggestion.status}`} onClick={onSelect}>
      <div className="suggestion-card-top">
        <span className="suggestion-type">{suggestion.label}</span>
        <button type="button" title="오류 제보" onClick={(event) => { event.stopPropagation(); onReport(suggestion.id); }}>
          <Flag size={16} />
        </button>
      </div>
      <div className="suggestion-pair">
        <div>
          <small>입력 내용</small>
          <strong>{suggestion.original}</strong>
        </div>
        <div>
          <small>대치어</small>
          <strong>{suggestion.replacement}</strong>
        </div>
      </div>
      <p>{suggestion.reason}</p>
      <div className="suggestion-actions">
        <button type="button" disabled={disabled} onClick={(event) => { event.stopPropagation(); onApply(suggestion.id); }}>
          <Pencil size={16} />
          {suggestion.status === "applied" ? "적용 완료" : "적용하기"}
        </button>
        <button type="button" disabled={disabled} onClick={(event) => { event.stopPropagation(); onIgnore(suggestion.id); }}>
          <X size={16} />
          {suggestion.status === "ignored" ? "무시됨" : "무시하기"}
        </button>
      </div>
    </article>
  );
}

export function SuggestionPanel({ selectedId, suggestions, onApply, onIgnore, onReport, onSelectSuggestion }) {
  const counts = correctionCountByLabel(suggestions);
  const pendingCount = suggestions.filter((suggestion) => suggestion.status === "pending").length;

  return (
    <aside className="suggestion-panel">
      <div className="suggestion-panel-head">
        <div>
          <span>수정 제안</span>
          <h2>맞춤법/문법 오류 {counts["맞춤법/문법 오류"] || 0}개</h2>
        </div>
        <strong>{pendingCount}개 남음</strong>
      </div>
      <div className="suggestion-legend">
        <span className="red">어법 오류</span>
        <span className="green">문맥상 오류</span>
        <span className="yellow">습관어</span>
        <span className="blue">확인 필요</span>
      </div>
      <div className="suggestion-card-list">
        {suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            selected={selectedId === suggestion.id}
            onApply={onApply}
            onIgnore={onIgnore}
            onReport={onReport}
            onSelect={() => onSelectSuggestion(suggestion.id)}
          />
        ))}
      </div>
    </aside>
  );
}

export function ScriptCorrectionWorkspace({ correction, onStartPractice, sourceScript, time, flow }) {
  const initialScript = sourceScript?.trim() || correction.script;
  const [scriptText, setScriptText] = useState(initialScript);
  const [suggestions, setSuggestions] = useState(correction.suggestions);
  const [selectedId, setSelectedId] = useState(correction.suggestions[0]?.id || null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [nextStepsOpen, setNextStepsOpen] = useState(false);
  const completedCount = suggestions.filter((suggestion) => suggestion.status === "applied").length;
  const ignoredCount = suggestions.filter((suggestion) => suggestion.status === "ignored").length;

  const applySuggestion = (id) => {
    const target = suggestions.find((suggestion) => suggestion.id === id);
    if (!target || target.status !== "pending") return;
    setScriptText((current) => current.replace(target.original, target.replacement));
    setSuggestions((current) =>
      current.map((suggestion) => suggestion.id === id ? { ...suggestion, status: "applied" } : suggestion),
    );
    setSelectedId(nextPendingSuggestion(suggestions.map((suggestion) => suggestion.id === id ? { ...suggestion, status: "applied" } : suggestion), id));
  };

  const ignoreSuggestion = (id) => {
    const nextSuggestions = suggestions.map((suggestion) => suggestion.id === id ? { ...suggestion, status: "ignored" } : suggestion);
    setSuggestions(nextSuggestions);
    setSelectedId(nextPendingSuggestion(nextSuggestions, id));
  };

  const resetCorrection = () => {
    setScriptText(initialScript);
    setSuggestions(correction.suggestions);
    setSelectedId(correction.suggestions[0]?.id || null);
    setNextStepsOpen(false);
  };

  return (
    <section className="script-correction-section">
      <div className="pre-section-heading">
        <span><FilePenLine size={16} /> 선택형 대본 교정</span>
        <h2>필요한 수정만 골라 반영하세요</h2>
      </div>
      <div className="correction-summary-strip">
        <span>적용 {completedCount}개</span>
        <span>무시 {ignoredCount}개</span>
        <span>검토 대상 {suggestions.length}개</span>
      </div>
      <div className="correction-workspace">
        <ScriptEditor
          autoScroll={autoScroll}
          selectedId={selectedId}
          scriptText={scriptText}
          suggestions={suggestions}
          onBack={() => window.history.back()}
          onComplete={() => setNextStepsOpen(true)}
          onCopy={() => copyText(scriptText)}
          onCopyAll={() => copyText(scriptText)}
          onReset={resetCorrection}
          onSelectSuggestion={setSelectedId}
          onToggleAutoScroll={() => setAutoScroll((current) => !current)}
        />
        <SuggestionPanel
          selectedId={selectedId}
          suggestions={suggestions}
          onApply={applySuggestion}
          onIgnore={ignoreSuggestion}
          onReport={(id) => console.info(`Correction report queued: ${id}`)}
          onSelectSuggestion={setSelectedId}
        />
      </div>
      <div className={`post-correction-reveal ${nextStepsOpen ? "open" : ""}`}>
        <div>
          <section className="post-correction-inner">
            <div className="post-correction-note">
              <span>교정 완료 후 다음 단계</span>
              <h2>이제 시간과 흐름만 확인하고 발표 연습으로 넘어가세요</h2>
            </div>
            <div className="pre-feedback-two-column">
              <TimeAnalysis time={time} />
              <FlowDiagram flow={flow} />
            </div>
            <div className="practice-start-row">
              <button className="primary-button" type="button" onClick={onStartPractice}>
                발표 연습 시작하기 <ArrowRight size={17} />
              </button>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

export function TimeAnalysis({ time }) {
  return (
    <section className="pre-feedback-section time-analysis-section">
      <div className="pre-section-heading">
        <span><Clock3 size={16} /> 시간 점검</span>
        <h2>예상 발표 시간 분석</h2>
      </div>
      <div className="time-analysis-card">
        <div className="time-meter">
          <span>예상 발표 시간</span>
          <strong>{time.estimated}</strong>
          <p>목표 발표 시간 {time.target}보다 <b>{time.overage}</b> 길게 예상됩니다.</p>
        </div>
        <div className="trim-targets">
          <strong>줄이면 좋은 구간</strong>
          {time.trimTargets.map((target) => (
            <div className="trim-row" key={target.label}>
              <span>{target.label}</span>
              <em>{target.saving}</em>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FlowDiagram({ flow }) {
  return (
    <section className="pre-feedback-section flow-section">
      <div className="pre-section-heading">
        <span><Route size={16} /> 흐름 점검</span>
        <h2>발표 흐름 도식화</h2>
      </div>
      <div className="flow-comparison">
        <FlowLane title="현재 발표 흐름" steps={flow.current} />
        <FlowLane title="권장 발표 흐름" steps={flow.recommended} recommended />
      </div>
    </section>
  );
}

function FlowLane({ title, steps, recommended = false }) {
  return (
    <article className={`flow-lane ${recommended ? "recommended" : ""}`}>
      <h3>{title}</h3>
      <div className="flow-steps">
        {steps.map((step, index) => (
          <div className="flow-step" key={`${step}-${index}`}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

export function FeedbackActionButtons({ onRewriteScript, onShortenScript, onSuggestSlideCopy, onStartPractice }) {
  return (
    <section className="feedback-action-panel" aria-label="다음 행동">
      <div>
        <span>다음 행동</span>
        <h2>고칠 방향이 정해졌다면 바로 이어가세요</h2>
      </div>
      <div className="feedback-actions">
        <button type="button" className="secondary-button" onClick={onRewriteScript}>이 피드백으로 대본 수정하기</button>
        <button type="button" className="secondary-button" onClick={onShortenScript}>3분 발표용으로 줄이기</button>
        <button type="button" className="secondary-button" onClick={onSuggestSlideCopy}>슬라이드별 문구 추천받기</button>
        <button type="button" className="primary-button" onClick={onStartPractice}>발표 연습 시작하기 <ArrowRight size={17} /></button>
      </div>
    </section>
  );
}

export function ReferenceStyleBanner({ selectedReferenceStyle }) {
  if (!selectedReferenceStyle) return null;

  const speakerName = selectedReferenceStyle.speakerName || "선택한 레퍼런스";

  return (
    <section className="selected-reference-banner" aria-label="적용된 레퍼런스 스타일">
      <SquarePlay size={18} />
      <div>
        <strong>{speakerName} 발표 스타일이 피드백 기준으로 설정되었습니다.</strong>
        <p>말하기 속도, 쉬는 타이밍, 강조 방식을 이 레퍼런스 기준으로 비교합니다.</p>
      </div>
    </section>
  );
}

export default function PreFeedbackPage({
  data,
  onRewriteScript,
  onShortenScript,
  onSuggestSlideCopy,
  onStartPractice,
  selectedReferenceStyle,
  sourceScript,
  topNavigation,
}) {
  return (
    <>
      {topNavigation}
      <ReferenceStyleBanner selectedReferenceStyle={selectedReferenceStyle} />
      <ScriptCorrectionWorkspace
        correction={data.correction}
        flow={data.flow}
        sourceScript={sourceScript}
        time={data.time}
        onStartPractice={onStartPractice}
      />
    </>
  );
}
