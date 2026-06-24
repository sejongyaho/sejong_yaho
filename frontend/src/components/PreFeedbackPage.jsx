import { useRef, useState } from "react";
import {
  BarChart3,
  Check,
  Clipboard,
  Copy,
  FilePlus2,
  FilePenLine,
  Flag,
  Link,
  Loader2,
  Pencil,
  Save,
  SquarePlay,
  Target,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  referenceOptions,
  referenceProfiles,
} from "../data/referencePractice";
import ReferenceQuickAnalysis from "./ReferenceQuickAnalysis";

function suggestionNeedle(suggestion) {
  return suggestion.status === "applied" ? suggestion.replacement : suggestion.original;
}

function nextPendingSuggestion(suggestions, currentId) {
  const pending = suggestions.filter((suggestion) => suggestion.status === "pending");
  if (!pending.length) return null;
  const currentIndex = pending.findIndex((suggestion) => suggestion.id === currentId);
  return pending[currentIndex + 1]?.id || pending[0].id;
}

const referenceContextSuggestions = {
  ted: [
    {
      id: "ted-context-1",
      type: "reference-context",
      label: "레퍼런스 맥락 수정",
      original: "Pitch up은 발표를 혼자 연습할 때 생기는 한계를 해결하기 위한 서비스입니다.",
      replacement: "혼자 발표를 연습할 때, 가장 막막한 순간은 내가 무엇을 고쳐야 하는지 모를 때입니다.",
      reason: "TED 스타일은 기능 소개보다 청중이 공감할 문제 장면으로 시작할 때 몰입도가 높습니다.",
      color: "green",
      status: "pending",
    },
    {
      id: "ted-context-2",
      type: "reference-context",
      label: "스토리 흐름 조정",
      original: "그래서 저희는 발표 연습을 데이터 기반으로 바꾸고자 했습니다.",
      replacement: "그래서 저희는 막연한 반복 연습을, 스스로 성장 과정을 확인하는 경험으로 바꾸고자 했습니다.",
      reason: "기술 설명을 사용자의 변화 경험으로 바꾸면 TED식 메시지가 더 선명해집니다.",
      color: "green",
      status: "pending",
    },
    {
      id: "ted-context-3",
      type: "reference-context",
      label: "마무리 메시지 강화",
      original: "저희 Pitch up은 발표를 단순 연습이 아니라, 분석하고 개선하고 실전에 대비하는 과정으로 바꾸는 AI 발표 코치입니다.",
      replacement: "Pitch up은 발표 연습을 혼자 견디는 시간이 아니라, 나아지고 있다는 확신을 얻는 과정으로 바꿉니다.",
      reason: "마지막 문장을 감정과 핵심 메시지 중심으로 압축하면 더 오래 남습니다.",
      color: "yellow",
      status: "pending",
    },
  ],
  startupPitch: [
    {
      id: "startup-context-1",
      type: "reference-context",
      label: "피칭 구조 조정",
      original: "Pitch up은 발표를 혼자 연습할 때 생기는 한계를 해결하기 위한 서비스입니다.",
      replacement: "Pitch up은 발표 연습에서 가장 큰 문제인 객관적 피드백 부재를 해결하는 AI 코칭 서비스입니다.",
      reason: "스타트업 피칭 스타일은 첫 문장에서 문제와 해결책을 바로 연결해야 전달력이 강해집니다.",
      color: "green",
      status: "pending",
    },
    {
      id: "startup-context-2",
      type: "reference-context",
      label: "핵심 가치 압축",
      original: "Pitch up의 주요 기능은 네 가지입니다.",
      replacement: "Pitch up은 레퍼런스 분석, 비교 피드백, AI 청중 시뮬레이션으로 발표 준비의 전 과정을 한 번에 줄입니다.",
      reason: "기능 나열보다 해결 흐름과 사용자 효용을 먼저 말하면 피칭의 속도감이 살아납니다.",
      color: "green",
      status: "pending",
    },
    {
      id: "startup-context-3",
      type: "reference-context",
      label: "임팩트 문장 강화",
      original: "Pitch up을 통해 사용자는 감으로만 하던 발표 연습에서 벗어나,",
      replacement: "Pitch up은 막연한 반복 연습을 데이터 기반 발표 개선으로 바꾸고,",
      reason: "투자/창업 발표에서는 변화 전후가 선명한 문장이 더 강하게 들립니다.",
      color: "yellow",
      status: "pending",
    },
  ],
  academic: [
    {
      id: "academic-context-1",
      type: "reference-context",
      label: "논리 구조 조정",
      original: "저희가 주목한 문제는 바로 이 부분입니다.",
      replacement: "저희가 정의한 핵심 문제는 발표 연습 과정에서 객관적인 피드백 기준이 부족하다는 점입니다.",
      reason: "학술 발표 스타일은 지시어보다 명확한 문제 정의가 먼저 나와야 논리 흐름이 안정됩니다.",
      color: "green",
      status: "pending",
    },
    {
      id: "academic-context-2",
      type: "reference-context",
      label: "근거 중심 표현",
      original: "점수 계산 방식도 단순하고 명확하게 설계했습니다.",
      replacement: "평가 기준은 말 속도, 구조와 흐름, 습관어, 설득력, 마무리의 다섯 항목으로 분리했습니다.",
      reason: "평가 항목을 먼저 제시하면 분석 방식의 근거가 더 분명해집니다.",
      color: "green",
      status: "pending",
    },
    {
      id: "academic-context-3",
      type: "reference-context",
      label: "의의 정리",
      original: "이를 통해 사용자는 실제 발표장에서 느낄 긴장감과 예상치 못한 질문을 미리 경험할 수 있습니다.",
      replacement: "이를 통해 사용자는 발표 전 단계에서 청중 반응과 질의응답 리스크를 사전에 점검할 수 있습니다.",
      reason: "학술 발표에서는 경험 묘사보다 활용 가능성과 검증 관점이 더 적합합니다.",
      color: "yellow",
      status: "pending",
    },
  ],
  custom: [
    {
      id: "custom-context-1",
      type: "reference-context",
      label: "레퍼런스 흐름 반영",
      original: "첫 번째는 레퍼런스 분석입니다.",
      replacement: "먼저 기준 발표를 분석해 말하기 속도와 구조를 수치로 확인합니다.",
      reason: "업로드한 레퍼런스처럼 설명 흐름을 짧게 끊어 핵심 정보부터 전달합니다.",
      color: "green",
      status: "pending",
    },
    {
      id: "custom-context-2",
      type: "reference-context",
      label: "전환 문장 조정",
      original: "두 번째는 비교 피드백입니다.",
      replacement: "다음으로 내 발표를 기준 발표와 비교해 속도, 흐름, 강조 차이를 바로 보여줍니다.",
      reason: "레퍼런스의 전환 방식처럼 앞 기능과 다음 기능의 연결을 분명하게 만듭니다.",
      color: "green",
      status: "pending",
    },
    {
      id: "custom-context-3",
      type: "reference-context",
      label: "강조 방식 조정",
      original: "마지막으로 예상 질문과 최종 피드백을 받아 발표를 개선합니다.",
      replacement: "마지막에는 예상 질문과 최종 피드백으로 실전 전에 고칠 지점을 확정합니다.",
      reason: "업로드한 레퍼런스의 결론 밀도에 맞춰 마지막 행동과 효용을 짧게 압축합니다.",
      color: "yellow",
      status: "pending",
    },
  ],
};

function buildReferenceCorrection(correction, referenceId) {
  const baseSuggestions = (correction.suggestions || [])
    .filter((suggestion) => suggestion.type !== "spacing" && suggestion.type !== "grammar")
    .filter((suggestion) => !suggestion.label.includes("맞춤법"))
    .map((suggestion) => ({
      ...suggestion,
      label: suggestion.type === "habit" ? "표현 밀도 조정" : "문맥 수정",
      status: "pending",
    }));
  const referenceSuggestions = referenceContextSuggestions[referenceId] || referenceContextSuggestions.custom;
  return {
    ...correction,
    suggestions: [...referenceSuggestions, ...baseSuggestions].slice(0, 9),
  };
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
        <button className="complete" type="button" onClick={onComplete}><Check size={17} />발표 시작</button>
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
  const pendingCount = suggestions.filter((suggestion) => suggestion.status === "pending").length;

  return (
    <aside className="suggestion-panel">
      <div className="suggestion-panel-head">
        <div>
          <span>수정 제안</span>
          <h2>레퍼런스 맥락 제안 {pendingCount}개</h2>
        </div>
        <strong>{pendingCount}개 남음</strong>
      </div>
      <div className="suggestion-legend">
        <span className="green">맥락 수정</span>
        <span className="yellow">표현 밀도</span>
        <span className="blue">용어 조정</span>
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

export function ScriptCorrectionWorkspace({ correction, onBackToReference, onCompleteCorrection, sourceScript }) {
  const initialScript = sourceScript?.trim() || correction.script;
  const [scriptText, setScriptText] = useState(initialScript);
  const [suggestions, setSuggestions] = useState(correction.suggestions);
  const [selectedId, setSelectedId] = useState(correction.suggestions[0]?.id || null);
  const [autoScroll, setAutoScroll] = useState(true);
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
  };

  const completeCorrection = () => {
    onCompleteCorrection?.(scriptText);
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
          onBack={onBackToReference}
          onComplete={completeCorrection}
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
    </section>
  );
}

function ReferenceSetupSection({
  customReferenceReady,
  isLoadingReference,
  onAnalyzeReferenceFile,
  onAnalyzeReferenceUrl,
  onSaveAnalysis,
  referenceVideo,
  referenceVideoUrl,
  selectedReference,
  setCustomReferenceReady,
  setReferenceVideoUrl,
  setSelectedReference,
  savedRecord,
}) {
  const selectReference = (profileId) => {
    setSelectedReference(profileId);
    if (profileId === "custom") {
      setCustomReferenceReady(false);
    }
    if (profileId !== "custom") {
      setCustomReferenceReady(false);
      onSaveAnalysis?.(profileId);
    }
  };

  const handleAnalyzeCustomReference = async () => {
    setSelectedReference("custom");
    const analyzed = await onAnalyzeReferenceUrl?.();
    if (analyzed) {
      setCustomReferenceReady(true);
      onSaveAnalysis?.("custom");
    }
  };

  const handleReferenceFile = async (event) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";
    if (!file) return;
    setSelectedReference("custom");
    const analyzed = await onAnalyzeReferenceFile?.(file);
    if (analyzed) {
      setCustomReferenceReady(true);
      onSaveAnalysis?.("custom");
    }
  };

  const handleReferenceUrlChange = (event) => {
    setCustomReferenceReady(false);
    setReferenceVideoUrl(event.target.value);
  };

  const showCustomReferenceResult = customReferenceReady && isAnalyzedCustomReference(referenceVideo);

  return (
    <section className="reference-setup-section">
      <div className="pre-section-heading">
        <span><Target size={16} /> 발표 레퍼런스 설정</span>
        <h2>어떤 발표 스타일을 기준으로 연습할까요?</h2>
        <p>원하는 발표 스타일을 선택하면, AI가 해당 스타일을 기준으로 내 발표의 속도, 쉼, 강조, 구조를 비교 분석합니다.</p>
      </div>

      <div className="reference-choice-grid">
        {referenceOptions.map((profile) => {
          const selected = selectedReference === profile.id;
          return (
            <button
              className={`reference-choice-card ${selected ? "selected" : ""}`}
              key={profile.id}
              type="button"
              onClick={() => selectReference(profile.id)}
            >
              <span className="reference-check">{selected ? <Check size={16} /> : <SquarePlay size={16} />}</span>
              <strong>{profile.name}</strong>
              <p>{profile.description}</p>
              <div>
                {profile.tags.map((tag) => <em key={tag}>{tag}</em>)}
              </div>
            </button>
          );
        })}
      </div>

      {selectedReference === "custom" ? (
        <section className="custom-reference-panel">
          <div>
            <span>custom reference</span>
            <h3>레퍼런스 발표 업로드</h3>
            <p>원하는 발표자의 영상 또는 음성을 업로드하면, AI가 말하기 속도, 쉬는 타이밍, 강조 방식, 발표 구조를 분석해 연습 기준을 만듭니다.</p>
          </div>
          <div className="custom-reference-controls">
            <label className="reference-upload-box">
              <Upload size={20} />
              <strong>영상/음성 파일 업로드</strong>
              <span>mp4, mov, mp3, wav</span>
              <input type="file" accept="audio/*,video/*" onChange={handleReferenceFile} />
            </label>
            <label className="reference-url-input">
              <Link size={17} />
              <input
                type="url"
                value={referenceVideoUrl}
                onChange={handleReferenceUrlChange}
                placeholder="유튜브 링크 입력"
              />
            </label>
            <button className="primary-button" type="button" onClick={handleAnalyzeCustomReference} disabled={isLoadingReference}>
              {isLoadingReference ? <Loader2 className="spin" size={17} /> : <BarChart3 size={17} />}
              {isLoadingReference ? "분석 중" : "레퍼런스 분석하기"}
            </button>
          </div>
          {showCustomReferenceResult ? (
            <div className="custom-reference-result">
              <div className="reference-card">
                {referenceVideo.thumbnail_url ? <img src={referenceVideo.thumbnail_url} alt="" /> : <SquarePlay size={38} />}
                <div>
                  <strong>{referenceVideo.title || "직접 업로드한 레퍼런스"}</strong>
                  <span>{referenceVideo.author_name || "커스텀 레퍼런스"}</span>
                  <span>{referenceVideo.status_label || referenceVideo.analysis_note || "레퍼런스 프로파일 생성 완료"}</span>
                </div>
              </div>
              <ReferenceQuickAnalysis
                referenceVideo={referenceVideo}
              />
            </div>
          ) : (
            <p className="saved-analysis-note">파일을 업로드하거나 유튜브 링크를 분석하면 아래에 레퍼런스 발표 프로파일이 생성됩니다.</p>
          )}
        </section>
      ) : null}

      {savedRecord ? (
        <p className="saved-analysis-note">
          <Save size={16} />
          이번 분석 결과가 내 기록에 저장되었습니다. 이전 발표와 비교해 성장 흐름을 확인할 수 있어요.
        </p>
      ) : null}
    </section>
  );
}

function ReferenceProfileCard({ profile }) {
  return (
    <section className="reference-profile-card">
      <div className="records-card-heading">
        <div>
          <h2>레퍼런스 발표 프로파일</h2>
          <p>{profile.name} 기준으로 이번 발표를 비교합니다.</p>
        </div>
        <span className="grade-pill">{profile.name}</span>
      </div>
      <div className="profile-chip-grid">
        <ProfileChip label="평균 말하기 속도" value={profile.speed} />
        <ProfileChip label="쉬는 타이밍" value={profile.pause} />
        <ProfileChip label="강조 방식" value={profile.emphasis} />
        <ProfileChip label="발표 구조" value={profile.structure} />
        <ProfileChip label="톤" value={profile.tone} />
        <div className="profile-chip">
          <span>스타일 태그</span>
          <div className="reference-targets">
            {profile.tags.map((tag) => <em key={tag}>{tag}</em>)}
          </div>
        </div>
      </div>
    </section>
  );
}

function ReferenceReadyPanel({ onStartRevision, profile }) {
  return (
    <section className="reference-ready-panel">
      <div>
        <span>다음 단계</span>
        <h2>{profile.name} 기준으로 대본을 다듬어보세요</h2>
        <p>맞춤법 검사는 제외하고, 선택한 레퍼런스의 구조와 말투에 맞는 문맥 수정만 제안합니다.</p>
      </div>
      <button className="primary-button" type="button" onClick={onStartRevision}>
        <FilePenLine size={17} />
        대본 수정 시작하기
      </button>
    </section>
  );
}

function profileFromReferenceVideo(referenceVideo) {
  if (!isAnalyzedCustomReference(referenceVideo)) return null;
  const rawProfile = referenceVideo.reference_profile || {};
  const targets = referenceVideo.benchmark_targets || {};
  const keywords = rawProfile.top_keywords || [];
  const title = referenceVideo.title || "직접 업로드한 레퍼런스";
  return {
    id: "custom",
    name: title,
    description: referenceVideo.analysis_note || "사용자가 등록한 발표를 기준으로 분석",
    speed: rawProfile.words_per_minute ? `${rawProfile.words_per_minute} WPM` : targets.speech_rate || "분석 기준 생성 완료",
    pause: rawProfile.pause_timing_summary || targets.pause_timing || "핵심 문장 전후의 쉼을 비교",
    emphasis: rawProfile.emphasis_summary || targets.emphasis || "핵심 키워드와 전환 문장에서 강조",
    structure: rawProfile.word_choice_summary || "업로드한 레퍼런스의 흐름을 기준으로 비교",
    tone: rawProfile.speaking_style || rawProfile.tone || targets.speaking_style || "커스텀 발표 스타일",
    tags: (keywords.length ? keywords : ["맞춤형", "개인화", "레퍼런스 분석"]).slice(0, 6),
  };
}

function isAnalyzedCustomReference(referenceVideo) {
  return referenceVideo?.source === "upload" || referenceVideo?.source === "youtube";
}

function ProfileChip({ label, value }) {
  return (
    <div className="profile-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function PreFeedbackPage({
  data,
  onAnalyzeReferenceFile,
  onAnalyzeReferenceUrl,
  onSaveAnalysis,
  onStartPractice,
  onUpdateScript,
  referenceVideo,
  referenceVideoUrl,
  setReferenceVideoUrl,
  sourceScript,
  topNavigation,
  isLoadingReference,
}) {
  const [stage, setStage] = useState("reference");
  const [selectedReference, setSelectedReference] = useState("");
  const [customReferenceReady, setCustomReferenceReady] = useState(false);
  const [savedRecord, setSavedRecord] = useState(null);
  const pageTopRef = useRef(null);
  const customProfile = selectedReference === "custom" && customReferenceReady ? profileFromReferenceVideo(referenceVideo) : null;
  const profile = selectedReference === "custom" ? customProfile : selectedReference ? referenceProfiles[selectedReference] : null;
  const revisionCorrection = buildReferenceCorrection(data.correction, selectedReference || "custom");

  const saveAnalysis = (profileId) => {
    const nextRecord = onSaveAnalysis?.(profileId);
    if (nextRecord) setSavedRecord(nextRecord);
  };

  const startRevision = () => {
    if (!profile) return;
    setStage("correction");
    window.requestAnimationFrame(() => {
      pageTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const backToReference = () => {
    setStage("reference");
    window.requestAnimationFrame(() => {
      pageTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const completeCorrection = (nextScript) => {
    onUpdateScript?.(nextScript);
    onStartPractice?.(nextScript);
  };

  return (
    <>
      {topNavigation}
      <div ref={pageTopRef} />
      {stage === "reference" ? (
        <>
          <ReferenceSetupSection
            customReferenceReady={customReferenceReady}
            isLoadingReference={isLoadingReference}
            onAnalyzeReferenceFile={onAnalyzeReferenceFile}
            onAnalyzeReferenceUrl={onAnalyzeReferenceUrl}
            onSaveAnalysis={saveAnalysis}
            referenceVideo={referenceVideo}
            referenceVideoUrl={referenceVideoUrl}
            savedRecord={savedRecord}
            selectedReference={selectedReference}
            setCustomReferenceReady={setCustomReferenceReady}
            setReferenceVideoUrl={setReferenceVideoUrl}
            setSelectedReference={setSelectedReference}
          />
          {profile ? (
            <>
              <ReferenceProfileCard profile={profile} />
              <ReferenceReadyPanel profile={profile} onStartRevision={startRevision} />
            </>
          ) : null}
        </>
      ) : (
        <ScriptCorrectionWorkspace
          correction={revisionCorrection}
          onBackToReference={backToReference}
          onCompleteCorrection={completeCorrection}
          sourceScript={sourceScript}
        />
      )}
    </>
  );
}
