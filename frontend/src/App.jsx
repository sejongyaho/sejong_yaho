import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleGauge,
  Clock3,
  FileText,
  Home,
  LayoutDashboard,
  Leaf,
  Loader2,
  MessageSquareText,
  Mic2,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  SquarePlay,
  Upload,
} from "lucide-react";
import PreFeedbackPage from "./components/PreFeedbackPage";
import PracticePage from "./components/PracticePage";
import ReferenceQuickAnalysis from "./components/ReferenceQuickAnalysis";
import { audience, situationMessages } from "./data/audience";
import { preFeedbackMock } from "./data/preFeedbackMock";
import {
  buildPreparationSignature,
  clamp,
  formatReferenceStatus,
  getSituation,
  looksLikeScriptFile,
  reactionForAudience,
  reactionFromSituation,
  scriptOverlap,
  syllableCount,
  tokenCount,
  userDeliveryLabel,
  userPaceLabel,
  userSilenceLabel,
} from "./utils/presentation";
import {
  buildSelectedReferenceStyle,
  loadSelectedReferenceStyle,
  saveSelectedReferenceStyle,
} from "./utils/referenceStyle";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const SETUP_STORAGE_KEY = "presentation.setup.v1";
const LOCAL_SESSION_PREFIX = "local-practice";
const DEFAULT_PRACTICE_SCRIPT =
  "안녕하세요. 오늘은 발표 연습을 시작하겠습니다. 핵심 내용을 또렷하게 전달하고, 중요한 문장 뒤에는 잠깐 멈추며, 마지막에는 결론을 분명하게 정리해 보겠습니다.";
const DEFAULT_SCRIPT_FEEDBACK = {
  score: 82,
  status: "발표 가능 단계",
  summary: "전체 흐름은 자연스럽지만, 일부 문장이 길고 발표 초반의 문제 제기가 조금 약합니다.",
  strengths: [
    "발표 주제가 명확합니다.",
    "서비스 핵심 아이디어가 잘 드러납니다.",
  ],
  improvements: [
    "도입부에서 청중의 공감을 더 끌어낼 필요가 있습니다.",
    "긴 문장을 짧게 나누면 전달력이 좋아집니다.",
    "마지막 문장에서 서비스 가치를 더 강하게 정리하면 좋습니다.",
  ],
};

function loadStoredSetup() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SETUP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredSetup(payload) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(payload));
}

function clearStoredSetup() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SETUP_STORAGE_KEY);
}

function isLocalSession(sessionId) {
  return String(sessionId || "").startsWith(LOCAL_SESSION_PREFIX);
}

function pageFromPath(pathname) {
  if (pathname === "/pre-feedback" || pathname === "/feedback/pre") return "preFeedback";
  if (pathname === "/records") return "records";
  if (pathname === "/practice" || pathname === "/rehearsal") return "setup";
  return "setup";
}

const REFERENCE_VIDEO_TEMPLATE = {
  video_id: "reference-speaker",
  title: "경제 해설형 발표자 기준",
  author_name: "레퍼런스 기준 모델",
  thumbnail_url: "",
  analysis_note: "입력한 영상의 화면은 썸네일로 확인하고, 발표 분석은 경제 해설형 발표자 기준으로 비교합니다.",
  reference_profile: {
    transcript_source: "demo_profile",
    syllables_per_second: 5.8,
    words_per_minute: 92.9,
    average_sentence_words: 13,
    top_keywords: ["경제 해설", "고밀도 설명", "짧은 쉼", "음량 강조", "정보 전달"],
    speech_rate_summary: "분당 약 93단어 수준으로, 설명을 끊기지 않게 이어가는 고밀도 말하기 속도입니다.",
    speaking_style: "차분하지만 정보량이 많은 해설형 말투입니다. 핵심 개념을 짧은 문장으로 이어 붙이며 설명합니다.",
    pause_timing_summary: "평균 쉼은 약 0.54초로 짧습니다. 긴 침묵보다 문장 사이의 짧은 숨 고르기를 자주 사용합니다.",
    emphasis_summary: "큰 제스처보다 음량 변화와 단어 선택으로 중요한 정보를 강조하는 스타일입니다.",
  },
  benchmark_targets: {
    speech_rate: "분당 90~96단어 정도의 고밀도 설명 속도",
    speaking_style: "경제 해설처럼 논리와 근거를 빠르게 연결하는 말투",
    pause_timing: "핵심 문장 뒤 짧게 멈추고 바로 다음 설명으로 이어가는 방식",
    emphasis: "목소리 크기 변화와 핵심어 반복으로 강조",
  },
  status_label: "기준 분석 완료 · 경제 해설형 발표자",
};

function extractYoutubeVideoId(input) {
  const value = input.trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (host.endsWith("youtube.com")) {
      if (url.searchParams.get("v")) return url.searchParams.get("v") || "";
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0])) return parts[1] || "";
    }
  } catch {
    const match = value.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([a-zA-Z0-9_-]{6,})/);
    return match?.[1] || "";
  }

  return "";
}

async function fetchYoutubeMetadata(url) {
  try {
    const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    if (!response.ok) return {};
    const data = await response.json();
    return {
      title: typeof data.title === "string" ? data.title : "",
      author_name: typeof data.author_name === "string" ? data.author_name : "",
      thumbnail_url: typeof data.thumbnail_url === "string" ? data.thumbnail_url : "",
    };
  } catch {
    return {};
  }
}

async function buildReferenceVideoPreview(url) {
  const videoId = extractYoutubeVideoId(url);
  const metadata = videoId ? await fetchYoutubeMetadata(url) : {};
  const thumbnail = metadata.thumbnail_url || (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "");
  return {
    ...REFERENCE_VIDEO_TEMPLATE,
    video_id: videoId || REFERENCE_VIDEO_TEMPLATE.video_id,
    title: metadata.title || (videoId ? "YouTube 기준 영상" : REFERENCE_VIDEO_TEMPLATE.title),
    author_name: metadata.author_name || REFERENCE_VIDEO_TEMPLATE.author_name,
    thumbnail_url: thumbnail,
    source_url: url,
  };
}

function App() {
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname));
  const [script, setScript] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [isPresenting, setIsPresenting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcriptSegments, setTranscriptSegments] = useState([]);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [displayTranscript, setDisplayTranscript] = useState("");
  const [wordsPerMinute, setWordsPerMinute] = useState(0);
  const [syllablesPerSecond, setSyllablesPerSecond] = useState(0);
  const [articulationSyllablesPerSecond, setArticulationSyllablesPerSecond] = useState(0);
  const [pauseRatio, setPauseRatio] = useState(0);
  const [volume, setVolume] = useState(0);
  const [voiceActive, setVoiceActive] = useState(false);
  const [silenceSeconds, setSilenceSeconds] = useState(0);
  const [silenceStreak, setSilenceStreak] = useState(0);
  const [longestSilence, setLongestSilence] = useState(0);
  const [situation, setSituation] = useState("opening");
  const [reaction, setReaction] = useState("attentive");
  const [audienceReactions, setAudienceReactions] = useState({});
  const [chat, setChat] = useState([]);
  const [report, setReport] = useState(null);
  const [scriptFeedback, setScriptFeedback] = useState(null);
  const [materialFeedback, setMaterialFeedback] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState("");
  const [referenceVideo, setReferenceVideo] = useState(null);
  const [selectedReferenceStyle, setSelectedReferenceStyle] = useState(() => loadSelectedReferenceStyle());
  const [isLoadingReference, setIsLoadingReference] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [recognitionStatus, setRecognitionStatus] = useState("대기 중");
  const [error, setError] = useState("");
  const [materialFiles, setMaterialFiles] = useState([]);
  const [preparedSignature, setPreparedSignature] = useState("");

  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const metricIntervalRef = useRef(null);
  const clockIntervalRef = useRef(null);
  const startTimeRef = useRef(0);
  const sessionIdRef = useRef("");
  const isPresentingRef = useRef(false);
  const transcriptRef = useRef("");
  const interimRef = useRef("");
  const lastInterimRef = useRef("");
  const displayTranscriptRef = useRef("");
  const volumeRef = useRef(0);
  const voiceActiveRef = useRef(false);
  const lastVoiceHeardAtRef = useRef(0);
  const lastRecognizedAtRef = useRef(0);
  const lastRecognizedWordCountRef = useRef(0);
  const silenceStreakRef = useRef(0);
  const silenceSecondsRef = useRef(0);
  const longestSilenceRef = useRef(0);
  const wordHistoryRef = useRef([]);
  const thresholdRef = useRef(0.022);
  const calibrationRef = useRef({ samples: [], done: false });
  const audienceReactionsRef = useRef({});
  const lastAudienceChatAtRef = useRef({});
  const lastGlobalAudienceChatAtRef = useRef(0);
  const lastEncouragementAtRef = useRef(0);
  const audienceChatPendingRef = useRef(false);
  const stableSituationRef = useRef("opening");
  const stableSituationChangedAtRef = useRef(0);
  const lastRawSituationRef = useRef("opening");
  const rawSituationSinceRef = useRef(0);
  const transcriptScrollRef = useRef(null);
  const setupRestoredRef = useRef(false);
  const activeScriptRef = useRef("");
  const metricsRef = useRef({
    elapsed: 0,
    transcript: "",
    wordsPerMinute: 0,
    syllablesPerSecond: 0,
    articulationSyllablesPerSecond: 0,
    pauseRatio: 0,
    silenceSeconds: 0,
    longestSilence: 0,
    volume: 0,
    reaction: "attentive",
    voiceActive: false,
  });

  const committedTranscript = useMemo(() => transcriptSegments.join(" ").trim(), [transcriptSegments]);
  const liveTranscript = displayTranscript || `${committedTranscript} ${interimTranscript}`.replace(/\s+/g, " ").trim();
  const overlap = useMemo(() => scriptOverlap(script, liveTranscript), [script, liveTranscript]);
  const spokenWords = useMemo(() => tokenCount(liveTranscript), [liveTranscript]);

  useEffect(() => {
    const stored = loadStoredSetup();
    if (stored) {
      setScript(stored.script || "");
      setReferenceVideoUrl(stored.referenceVideoUrl || "");
      setScriptFeedback(stored.scriptFeedback || null);
      setMaterialFeedback(stored.materialFeedback || null);
      setReferenceVideo(stored.referenceVideo || null);
      setPreparedSignature(stored.preparedSignature || "");
    }
    const restoreTimer = window.setTimeout(() => {
      setupRestoredRef.current = true;
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!setupRestoredRef.current) return;
    saveStoredSetup({
      script,
      referenceVideoUrl,
      scriptFeedback,
      materialFeedback,
      referenceVideo,
      preparedSignature,
    });
  }, [script, referenceVideoUrl, scriptFeedback, materialFeedback, referenceVideo, preparedSignature]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    isPresentingRef.current = isPresenting;
  }, [isPresenting]);

  useEffect(() => {
    metricsRef.current = {
      elapsed,
      transcript: liveTranscript,
      wordsPerMinute,
      syllablesPerSecond,
      articulationSyllablesPerSecond,
      pauseRatio,
      silenceSeconds,
      longestSilence,
      volume,
      reaction,
      voiceActive,
    };
  }, [
    elapsed,
    liveTranscript,
    wordsPerMinute,
    syllablesPerSecond,
    articulationSyllablesPerSecond,
    pauseRatio,
    silenceSeconds,
    longestSilence,
    volume,
    reaction,
    voiceActive,
  ]);

  useEffect(() => {
    setReaction(reactionFromSituation(situation));
  }, [situation]);

  useEffect(() => {
    const container = transcriptScrollRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 80) {
      container.scrollTop = container.scrollHeight;
    }
  }, [liveTranscript]);

  const resetRealtimeRefs = () => {
    transcriptRef.current = "";
    interimRef.current = "";
    lastInterimRef.current = "";
    displayTranscriptRef.current = "";
    volumeRef.current = 0;
    voiceActiveRef.current = false;
    lastVoiceHeardAtRef.current = Date.now();
    lastRecognizedAtRef.current = Date.now();
    lastRecognizedWordCountRef.current = 0;
    silenceStreakRef.current = 0;
    silenceSecondsRef.current = 0;
    longestSilenceRef.current = 0;
    wordHistoryRef.current = [];
    thresholdRef.current = 0.022;
    calibrationRef.current = { samples: [], done: false };
    audienceReactionsRef.current = {};
    lastAudienceChatAtRef.current = {};
    lastGlobalAudienceChatAtRef.current = 0;
    lastEncouragementAtRef.current = 0;
    audienceChatPendingRef.current = false;
    stableSituationRef.current = "opening";
    stableSituationChangedAtRef.current = Date.now();
    lastRawSituationRef.current = "opening";
    rawSituationSinceRef.current = Date.now();
  };

  const refreshAiStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/status?probe=true`);
      if (!response.ok) throw new Error("AI 상태를 확인하지 못했습니다.");
      setAiStatus(await response.json());
    } catch (err) {
      setAiStatus({
        configured: false,
        live: false,
        model: "unknown",
        message: err.message || "AI 상태 확인 실패",
      });
    }
  };

  const applyReferenceVideo = async () => {
    const url = referenceVideoUrl.trim();
    if (!url) {
      setReferenceVideo(null);
      return;
    }

    setIsLoadingReference(true);
    setError("");
    window.setTimeout(async () => {
      setReferenceVideo(await buildReferenceVideoPreview(url));
      setIsLoadingReference(false);
    }, 250);
  };

  const appendAudienceChat = (message, now, nextSituation) => {
    setChat((prev) => [
      ...prev.slice(-6),
      {
        id: message.id || `${now}-${nextSituation}`,
        name: message.name,
        text: message.text,
        reaction: message.reaction,
      },
    ]);
  };

  const localAudienceMessage = (nextSituation, now, person = null, nextReaction = "") => {
    const message = situationMessages[nextSituation] || situationMessages.opening;
    return {
      id: `${now}-${nextSituation}-${person?.name || "local"}`,
      name: person?.name || message.name,
      text: message.text,
      reaction: nextReaction || message.reaction,
    };
  };

  const pushChatForAudienceChange = (person, nextSituation, now, snapshot = {}, nextReaction = "") => {
    const lastPersonChatAt = lastAudienceChatAtRef.current[person.name] || 0;
    if (audienceChatPendingRef.current) return;
    if (now - lastGlobalAudienceChatAtRef.current < 3200) return;
    if (now - lastPersonChatAt < 7500) return;

    lastAudienceChatAtRef.current = {
      ...lastAudienceChatAtRef.current,
      [person.name]: now,
    };
    lastGlobalAudienceChatAtRef.current = now;

    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) {
      appendAudienceChat(localAudienceMessage(nextSituation, now, person, nextReaction), now, nextSituation);
      return;
    }

    audienceChatPendingRef.current = true;
    fetch(`${API_BASE_URL}/api/session/${currentSessionId}/audience/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        situation: nextSituation,
        elapsed_seconds: snapshot.elapsed ?? 0,
        transcript: snapshot.transcript ?? "",
        current_excerpt: snapshot.currentExcerpt ?? "",
        words_per_minute: snapshot.wordsPerMinute ?? 0,
        syllables_per_second: snapshot.syllablesPerSecond ?? 0,
        pause_ratio: snapshot.pauseRatio ?? 0,
        silence_streak: snapshot.silenceStreak ?? 0,
        overlap: snapshot.overlap ?? 0,
        voice_active: snapshot.voiceActive ?? false,
        seconds_since_recognized: snapshot.secondsSinceRecognized ?? 0,
        words_spoken: snapshot.wordsSpoken ?? 0,
        force_positive: snapshot.forcePositive ?? false,
        reaction: nextReaction || snapshot.reaction || reactionFromSituation(nextSituation),
        audience_name: person.name,
        audience_role: person.role || "",
        force: false,
      }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("audience chat failed");
        return response.json();
      })
      .then((message) => appendAudienceChat(message, now, nextSituation))
      .catch(() => appendAudienceChat(localAudienceMessage(nextSituation, now, person, nextReaction), now, nextSituation))
      .finally(() => {
        audienceChatPendingRef.current = false;
      });
  };

  const pushChatsForAudienceChanges = (nextSituation, now, snapshot, nextAudienceReactions) => {
    const previous = audienceReactionsRef.current;
    const changedPeople = audience.filter((person) => {
      const previousReaction = previous[person.name];
      const nextReaction = nextAudienceReactions[person.name];
      return previousReaction && nextReaction && previousReaction !== nextReaction;
    });

    audienceReactionsRef.current = nextAudienceReactions;
    if (!changedPeople.length) return;

    const priority = ["tooFast", "confused", "sleepy", "excited", "tooSlow", "attentive"];
    const person = changedPeople.sort(
      (a, b) => priority.indexOf(nextAudienceReactions[a.name]) - priority.indexOf(nextAudienceReactions[b.name]),
    )[0];
    pushChatForAudienceChange(person, nextSituation, now, snapshot, nextAudienceReactions[person.name]);
  };

  const pushOccasionalEncouragement = (nextSituation, now, snapshot, nextAudienceReactions) => {
    const isSteadyNormal = ["opening", "focused", "impressed"].includes(nextSituation);
    const hasEnoughSpeech = snapshot.wordsSpoken >= 5 && snapshot.voiceActive;
    const paceLooksFine = snapshot.syllablesPerSecond >= 3.8 && snapshot.syllablesPerSecond <= 7.4;
    const noAudienceConcern = Object.values(nextAudienceReactions).every((item) => item === "attentive" || item === "excited");
    if (!isSteadyNormal || !hasEnoughSpeech || !paceLooksFine || !noAudienceConcern) return;
    if (audienceChatPendingRef.current) return;
    if (now - lastEncouragementAtRef.current < 10000) return;
    if (now - lastGlobalAudienceChatAtRef.current < 3500) return;

    const candidates = audience.filter((person) => nextAudienceReactions[person.name] === "attentive");
    const person = candidates[Math.floor(Math.random() * candidates.length)] || audience[0];
    lastEncouragementAtRef.current = now;
    pushChatForAudienceChange(person, nextSituation, now, { ...snapshot, forcePositive: true }, nextAudienceReactions[person.name]);
  };

  const stabilizeSituation = (candidate, now) => {
    const current = stableSituationRef.current;
    if (candidate === current) {
      lastRawSituationRef.current = candidate;
      rawSituationSinceRef.current = now;
      return current;
    }

    if (candidate !== lastRawSituationRef.current) {
      lastRawSituationRef.current = candidate;
      rawSituationSinceRef.current = now;
      return current;
    }

    const minimumCurrentDwellMs = current === "opening" ? 5500 : 7500;
    if (now - stableSituationChangedAtRef.current < minimumCurrentDwellMs) return current;

    const requiredMsBySituation = {
      longSilence: 4200,
      unclear: 4300,
      tooFast: 5200,
      tooSlow: 6200,
      offScript: 6500,
      impressed: 6000,
      focused: 5600,
      opening: 5000,
    };
    const requiredMs = requiredMsBySituation[candidate] || 5600;
    if (now - rawSituationSinceRef.current >= requiredMs) {
      stableSituationRef.current = candidate;
      stableSituationChangedAtRef.current = now;
      return candidate;
    }

    return current;
  };

  const setupSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setRecognitionStatus("음성 인식 미지원");
      setError("이 브라우저는 음성 인식을 지원하지 않아요. 인식되지 않는 구간은 침묵으로 계산됩니다.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setRecognitionStatus("듣는 중");
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const phrase = event.results[i][0].transcript.trim();
        if (!phrase) continue;
        if (event.results[i].isFinal) finalText += ` ${phrase}`;
        else interimText += ` ${phrase}`;
      }

      if (finalText.trim()) {
        const cleanedFinal = finalText.replace(/\s+/g, " ").trim();
        transcriptRef.current = `${transcriptRef.current} ${cleanedFinal}`.replace(/\s+/g, " ").trim();
        displayTranscriptRef.current = transcriptRef.current;
        setDisplayTranscript(displayTranscriptRef.current);
        setTranscriptSegments((prev) => [...prev, cleanedFinal]);
        interimRef.current = "";
        lastInterimRef.current = "";
        setInterimTranscript("");
      }

      if (interimText.trim()) {
        const cleanedInterim = interimText.replace(/\s+/g, " ").trim();
        interimRef.current = cleanedInterim;
        lastInterimRef.current = cleanedInterim;
        setDisplayTranscript(`${displayTranscriptRef.current} ${cleanedInterim}`.replace(/\s+/g, " ").trim());
        setInterimTranscript(cleanedInterim);
      }

      const currentWords = tokenCount(`${transcriptRef.current} ${interimRef.current}`);
      if (currentWords > lastRecognizedWordCountRef.current) {
        lastRecognizedAtRef.current = Date.now();
        lastRecognizedWordCountRef.current = currentWords;
        setRecognitionStatus("인식 중");
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech") {
        setRecognitionStatus("말소리 대기");
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("마이크 또는 음성 인식 권한이 필요합니다. 브라우저 권한을 허용해 주세요.");
        setRecognitionStatus("권한 필요");
        return;
      }
      setRecognitionStatus(`음성 인식 상태: ${event.error}`);
    };

    recognition.onend = () => {
      if (!isPresentingRef.current) return;
      setRecognitionStatus("다시 연결 중");
      window.setTimeout(() => {
        if (!isPresentingRef.current) return;
        try {
          recognition.start();
        } catch {
          setRecognitionStatus("말소리 대기");
        }
      }, 250);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setRecognitionStatus("음성 인식 시작 실패");
    }
  };

  const setupAudioMeter = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    audioContextRef.current = audioContext;

    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const centered = (data[i] - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / data.length);
      volumeRef.current = rms;
      setVolume(rms);

      if (!calibrationRef.current.done) {
        calibrationRef.current.samples.push(rms);
        if (calibrationRef.current.samples.length >= 35) {
          const sortedSamples = [...calibrationRef.current.samples].sort((a, b) => a - b);
          const quietSample = sortedSamples[Math.floor(sortedSamples.length * 0.35)] || 0;
          const avgNoise =
            calibrationRef.current.samples.reduce((total, sample) => total + sample, 0) /
            calibrationRef.current.samples.length;
          thresholdRef.current = clamp(Math.min(avgNoise * 2.2, quietSample * 3.2), 0.009, 0.04);
          calibrationRef.current.done = true;
        }
      }

      const now = Date.now();
      const voiceFloor = Math.max(0.0075, thresholdRef.current * 0.68);
      if (rms > voiceFloor) {
        lastVoiceHeardAtRef.current = now;
      }
      const isVoice = now - lastVoiceHeardAtRef.current < 1200;
      voiceActiveRef.current = isVoice;
      setVoiceActive(isVoice);
      animationRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const startRealtimeClock = () => {
    window.clearInterval(clockIntervalRef.current);
    clockIntervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const nextElapsed = Math.max(0, Math.floor((now - startTimeRef.current) / 1000));
      const currentTranscript = `${transcriptRef.current} ${interimRef.current || lastInterimRef.current}`.trim();
      const currentWords = tokenCount(currentTranscript);
      const currentSyllables = syllableCount(currentTranscript);

      wordHistoryRef.current = [
        ...wordHistoryRef.current.filter((sample) => now - sample.time <= 20000),
        { time: now, words: currentWords },
      ];

      const first = wordHistoryRef.current[0];
      const rollingSeconds = first ? Math.max(1, (now - first.time) / 1000) : nextElapsed;
      const rollingWords = first ? Math.max(0, currentWords - first.words) : currentWords;
      const overallWpm = nextElapsed > 0 ? (currentWords / nextElapsed) * 60 : 0;
      const rollingWpm = rollingSeconds >= 4 ? (rollingWords / rollingSeconds) * 60 : overallWpm;
      const nextSyllablesPerSecond = nextElapsed > 0 ? currentSyllables / nextElapsed : 0;

      const secondsSinceRecognized = (now - lastRecognizedAtRef.current) / 1000;
      const isRecognizedSilence = nextElapsed > 3 && !voiceActiveRef.current && secondsSinceRecognized > 2.4;

      if (isRecognizedSilence) {
        silenceStreakRef.current += 1;
        silenceSecondsRef.current += 1;
        longestSilenceRef.current = Math.max(longestSilenceRef.current, silenceStreakRef.current);
      } else {
        silenceStreakRef.current = 0;
      }

      const articulationSeconds = Math.max(1, nextElapsed - silenceSecondsRef.current);
      const nextArticulationRate = currentSyllables / articulationSeconds;
      const nextPauseRatio = nextElapsed > 0 ? silenceSecondsRef.current / nextElapsed : 0;
      const nextOverlap = scriptOverlap(script, currentTranscript);

      const rawSituation = getSituation({
        elapsed: nextElapsed,
        wordsPerMinute: Math.round(rollingWpm),
        syllablesPerSecond: nextSyllablesPerSecond,
        silenceStreak: silenceStreakRef.current,
        voiceActive: voiceActiveRef.current,
        secondsSinceRecognized,
        overlap: nextOverlap,
        wordsSpoken: currentWords,
      });
      const nextSituation = stabilizeSituation(rawSituation, now);
      const nextReaction = reactionFromSituation(nextSituation);
      const metricsSnapshot = {
        elapsed: nextElapsed,
        transcript: currentTranscript,
        currentExcerpt: currentTranscript.slice(-260),
        wordsPerMinute: Math.round(rollingWpm),
        syllablesPerSecond: Number(nextSyllablesPerSecond.toFixed(2)),
        pauseRatio: Number(nextPauseRatio.toFixed(3)),
        silenceStreak: silenceStreakRef.current,
        voiceActive: voiceActiveRef.current,
        secondsSinceRecognized,
        overlap: nextOverlap,
        wordsSpoken: currentWords,
        reaction: nextReaction,
      };
      const nextAudienceReactions = Object.fromEntries(
        audience.map((person) => [person.name, reactionForAudience(person, nextSituation, metricsSnapshot)]),
      );

      setElapsed(nextElapsed);
      setWordsPerMinute(Math.round(rollingWpm));
      setSyllablesPerSecond(Number(nextSyllablesPerSecond.toFixed(2)));
      setArticulationSyllablesPerSecond(Number(nextArticulationRate.toFixed(2)));
      setPauseRatio(Number(nextPauseRatio.toFixed(3)));
      setSilenceStreak(silenceStreakRef.current);
      setSilenceSeconds(silenceSecondsRef.current);
      setLongestSilence(longestSilenceRef.current);
      setSituation(nextSituation);
      setAudienceReactions(nextAudienceReactions);
      pushChatsForAudienceChanges(nextSituation, now, metricsSnapshot, nextAudienceReactions);
      pushOccasionalEncouragement(nextSituation, now, metricsSnapshot, nextAudienceReactions);
    }, 1000);
  };

  const postMetric = async () => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId || isLocalSession(currentSessionId)) return;
    const current = metricsRef.current;
    await fetch(`${API_BASE_URL}/api/session/${currentSessionId}/metric`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        elapsed_seconds: current.elapsed,
        transcript: current.transcript,
        words_spoken: tokenCount(current.transcript),
        words_per_minute: current.wordsPerMinute,
        syllables_spoken: syllableCount(current.transcript),
        syllables_per_second: current.syllablesPerSecond,
        articulation_syllables_per_second: current.articulationSyllablesPerSecond,
        silence_seconds: current.silenceSeconds,
        longest_silence_seconds: current.longestSilence,
        pause_ratio: current.pauseRatio,
        volume: current.volume,
        reaction: current.reaction,
        speech_detected: current.voiceActive,
      }),
    });
  };

  const cleanupRecording = () => {
    window.clearInterval(metricIntervalRef.current);
    window.clearInterval(clockIntervalRef.current);
    cancelAnimationFrame(animationRef.current);
    recognitionRef.current?.stop?.();
    audioContextRef.current?.close?.();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    recognitionRef.current = null;
    audioContextRef.current = null;
    streamRef.current = null;
  };

  const launchPresentation = async (nextSessionId, practiceScript = script) => {
    setSessionId(nextSessionId);
    sessionIdRef.current = nextSessionId;
    activeScriptRef.current = practiceScript;
    setError("");
    setReport(null);
    setTranscriptSegments([]);
    setInterimTranscript("");
    setDisplayTranscript("");
    setElapsed(0);
    setWordsPerMinute(0);
    setSyllablesPerSecond(0);
    setArticulationSyllablesPerSecond(0);
    setPauseRatio(0);
    setSilenceSeconds(0);
    setSilenceStreak(0);
    setLongestSilence(0);
    setChat([]);
    setSituation("opening");
    setReaction("attentive");
    setAudienceReactions({});
    setRecognitionStatus("마이크 준비 중");
    resetRealtimeRefs();

    setPage("practice");
    setIsPresenting(true);
    isPresentingRef.current = true;
    startTimeRef.current = Date.now();
    lastRecognizedAtRef.current = Date.now();
    startRealtimeClock();
    setupSpeechRecognition();

    try {
      await setupAudioMeter();
    } catch {
      setRecognitionStatus("마이크 권한 필요");
      setError("마이크 권한을 허용하면 속도와 침묵 분석이 시작됩니다.");
    }

    metricIntervalRef.current = window.setInterval(() => {
      postMetric().catch(() => {
        setError("분석 샘플 전송이 잠시 실패했어요. 발표는 계속 진행됩니다.");
      });
    }, 3000);
  };

  const preparePresentation = async () => {
    setError("");
    setReport(null);
    if (script.trim().length < 10) {
      setError("대본을 조금 더 입력해 주세요.");
      return;
    }

    setIsPreparing(true);
    try {
      const formData = new FormData();
      formData.append("script", script);
      formData.append("reference_video_url", "");
      materialFiles.forEach((file) => {
        formData.append("materials", file);
      });
      const response = await fetch(`${API_BASE_URL}/api/preflight`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "사전 분석을 진행하지 못했습니다.");
      setScriptFeedback(data.script_feedback);
      setMaterialFeedback(data.presentation_material || null);
      setReferenceVideo(referenceVideo || data.reference_video || null);
      setPreparedSignature(buildPreparationSignature(script, materialFiles, referenceVideoUrl));
    } catch (err) {
      setPreparedSignature("");
      setError(err.message || "사전 분석 중 문제가 생겼습니다.");
    } finally {
      setIsPreparing(false);
    }
  };

  const startPresentation = async () => {
    setError("");
    setReport(null);
    const practiceScript = script.trim().length >= 10 ? script : DEFAULT_PRACTICE_SCRIPT;
    if (practiceScript !== script) {
      setScript(practiceScript);
    }

    setIsStarting(true);
    try {
      const formData = new FormData();
      formData.append("script", practiceScript);
      formData.append("reference_video_url", "");
      materialFiles.forEach((file) => {
        formData.append("materials", file);
      });
      const response = await fetch(`${API_BASE_URL}/api/session/start`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "발표 세션을 시작하지 못했습니다.");
      setReferenceVideo(referenceVideo || data.reference_video || null);
      await launchPresentation(data.session_id, practiceScript);
    } catch (err) {
      await launchPresentation(`${LOCAL_SESSION_PREFIX}-${Date.now()}`, practiceScript);
    } finally {
      setIsStarting(false);
    }
  };

  const importScriptFile = async (file) => {
    if (!file) return;
    setError("");
    if (file.size > 1024 * 1024 * 10) {
      setError("10MB 이하의 파일만 불러올 수 있습니다.");
      return;
    }

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE_URL}/api/script/import`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "파일을 읽지 못했습니다.");
      setScript(data.text);
    } catch (err) {
      setError(err.message || "파일을 읽지 못했습니다. txt, md, pdf, docx, pptx 파일로 다시 시도해 주세요.");
    } finally {
      setIsImporting(false);
    }
  };

  const importMixedFiles = async (files) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    const scriptExtensions = new Set(["txt", "md", "markdown", "text", "csv", "srt", "docx"]);
    const materialExtensions = new Set(["pdf", "pptx"]);
    const maxMaterialFileSize = 20 * 1024 * 1024;
    const acceptedMaterials = [];
    const directScriptCandidates = [];
    const hintedScriptCandidates = [];

    for (const file of selected) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "";
      if (scriptExtensions.has(extension)) {
        directScriptCandidates.push(file);
      }
      if (materialExtensions.has(extension)) {
        if (file.size > maxMaterialFileSize) {
          setError(`"${file.name}" 파일이 20MB 제한을 넘었습니다.`);
          return;
        }
        acceptedMaterials.push(file);
        if (looksLikeScriptFile(file.name)) {
          hintedScriptCandidates.push(file);
        }
      }
    }

    const scriptCandidate = directScriptCandidates[0] || hintedScriptCandidates[0] || null;

    if (!scriptCandidate && !acceptedMaterials.length) {
      setError("대본은 txt, md, docx 같은 문서 파일로, 발표 자료는 PDF 또는 PPTX 파일로 올려 주세요.");
      return;
    }

    setError("");
    setMaterialFiles(acceptedMaterials);
    if (scriptCandidate) {
      await importScriptFile(scriptCandidate);
    }
  };

  const finishPresentation = async () => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return;
    setIsFinishing(true);
    setIsPresenting(false);
    isPresentingRef.current = false;
    setError("");
    setReport(null);
    setPage("report");
    const finalTranscript = `${transcriptRef.current} ${interimRef.current || lastInterimRef.current}`.trim();
    const reportScript = activeScriptRef.current || script || DEFAULT_PRACTICE_SCRIPT;
    cleanupRecording();
    try {
      if (isLocalSession(currentSessionId)) {
        setReport(buildLocalPracticeReport({
          script: reportScript,
          transcript: finalTranscript,
          metrics: metricsRef.current,
          referenceVideo,
          selectedReferenceStyle,
        }));
        return;
      }
      await postMetric();
      const response = await fetch(`${API_BASE_URL}/api/session/${currentSessionId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: finalTranscript }),
      });
      if (!response.ok) throw new Error("리포트를 만들지 못했습니다.");
      setReport(await response.json());
      refreshAiStatus();
    } catch (err) {
      setReport(buildLocalPracticeReport({
        script: reportScript,
        transcript: finalTranscript,
        metrics: metricsRef.current,
        referenceVideo,
        selectedReferenceStyle,
      }));
      setError("서버 리포트 대신 기본 분석 리포트를 만들었습니다.");
    } finally {
      setIsFinishing(false);
    }
  };

  const reset = () => {
    cleanupRecording();
    setPage("setup");
    window.history.pushState({}, "", "/");
    setSessionId("");
    sessionIdRef.current = "";
    setIsPresenting(false);
    isPresentingRef.current = false;
    setReport(null);
    setChat([]);
    setTranscriptSegments([]);
    setInterimTranscript("");
    setDisplayTranscript("");
    setElapsed(0);
    setWordsPerMinute(0);
    setSyllablesPerSecond(0);
    setArticulationSyllablesPerSecond(0);
    setPauseRatio(0);
    setSilenceSeconds(0);
    setSilenceStreak(0);
    setLongestSilence(0);
    setSituation("opening");
    setReaction("attentive");
    setAudienceReactions({});
    setRecognitionStatus("대기 중");
    setError("");
    setMaterialFiles([]);
    setMaterialFeedback(null);
    setReferenceVideo(null);
    setReferenceVideoUrl("");
    setPreparedSignature("");
    clearStoredSetup();
    resetRealtimeRefs();
  };

  const backToSetup = () => {
    cleanupRecording();
    setPage("setup");
    window.history.pushState({}, "", "/");
    setIsPresenting(false);
    isPresentingRef.current = false;
  };

  const goToSetup = () => {
    cleanupRecording();
    setPage("setup");
    window.history.pushState({}, "", "/");
    setIsPresenting(false);
    isPresentingRef.current = false;
  };

  const goToPreFeedback = () => {
    cleanupRecording();
    setPage("preFeedback");
    window.history.pushState({}, "", "/pre-feedback");
    setIsPresenting(false);
    isPresentingRef.current = false;
  };

  const selectReferenceStyleForPractice = () => {
    if (!referenceVideo) return;
    const nextReferenceStyle = saveSelectedReferenceStyle(buildSelectedReferenceStyle(referenceVideo));
    setSelectedReferenceStyle(nextReferenceStyle);
    window.alert("레퍼런스 스타일이 설정되었습니다.");
    return nextReferenceStyle;
  };

  const goToRecords = () => {
    cleanupRecording();
    setPage("records");
    window.history.pushState({}, "", "/records");
    setIsPresenting(false);
    isPresentingRef.current = false;
  };

  const goToPracticePath = () => {
    cleanupRecording();
    setPage("setup");
    window.history.pushState({}, "", "/practice");
    setIsPresenting(false);
    isPresentingRef.current = false;
  };

  const handleDeferredFeedbackAction = (actionName) => {
    console.info(`Pre-feedback action queued: ${actionName}`);
  };

  useEffect(() => () => cleanupRecording(), []);

  useEffect(() => {
    refreshAiStatus();
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setPage(pageFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const topNavigation = (
    <AppNav
      currentPage={page}
      goToPreFeedback={goToPreFeedback}
      goToRecords={goToRecords}
      goToSetup={goToSetup}
    />
  );

  return (
    <main className={`app-shell page-${page}`}>
      <section className="studio">
        {page === "setup" && (
          <SetupPage
            aiStatus={aiStatus}
            error={error}
            isImporting={isImporting}
            isStarting={isStarting}
            importMixedFiles={importMixedFiles}
            applyReferenceVideo={applyReferenceVideo}
            materialFiles={materialFiles}
            materialFeedback={materialFeedback}
            isLoadingReference={isLoadingReference}
            isPreparing={isPreparing}
            referenceVideo={referenceVideo}
            referenceVideoUrl={referenceVideoUrl}
            scriptFeedback={scriptFeedback}
            script={script}
            selectReferenceStyleForPractice={selectReferenceStyleForPractice}
            sessionPrepared={Boolean(preparedSignature && preparedSignature === buildPreparationSignature(script, materialFiles, referenceVideoUrl))}
            setReferenceVideoUrl={setReferenceVideoUrl}
            setScript={setScript}
            preparePresentation={preparePresentation}
            startPresentation={startPresentation}
            topNavigation={topNavigation}
            openPreFeedback={goToPreFeedback}
          />
        )}

        {page === "preFeedback" && (
          <PreFeedbackPage
            data={preFeedbackMock}
            onRewriteScript={() => handleDeferredFeedbackAction("rewrite-script")}
            onShortenScript={() => handleDeferredFeedbackAction("shorten-to-three-minutes")}
            onSuggestSlideCopy={() => handleDeferredFeedbackAction("suggest-slide-copy")}
            onStartPractice={startPresentation}
            selectedReferenceStyle={selectedReferenceStyle}
            sourceScript={script}
            topNavigation={topNavigation}
          />
        )}

        {page === "practice" && (
          <PracticePage
            audience={audience}
            backToSetup={backToSetup}
            chat={chat}
            elapsed={elapsed}
            error={error}
            finishPresentation={finishPresentation}
            isFinishing={isFinishing}
            liveTranscript={liveTranscript}
            reaction={reaction}
            recognitionStatus={recognitionStatus}
            script={script}
            situation={situation}
            transcriptScrollRef={transcriptScrollRef}
            voiceActive={voiceActive}
            volume={volume}
            audienceReactions={audienceReactions}
            audienceMetrics={{
              elapsed,
              wordsPerMinute,
              syllablesPerSecond,
              silenceStreak,
              voiceActive,
              secondsSinceRecognized: Math.max(0, (Date.now() - lastRecognizedAtRef.current) / 1000),
              overlap,
              wordsSpoken: spokenWords,
            }}
            paceLabel={userPaceLabel(syllablesPerSecond)}
            silenceLabel={userSilenceLabel(pauseRatio, silenceStreak)}
            deliveryLabel={userDeliveryLabel(overlap)}
          />
        )}

        {page === "report" && (
          <ReportPage
            aiStatus={aiStatus}
            error={error}
            isFinishing={isFinishing}
            report={report}
            reset={reset}
            materialFeedback={materialFeedback}
            scriptFeedback={scriptFeedback}
            spokenWords={spokenWords}
          />
        )}

        {page === "records" && <RecordsDashboard onNewPractice={goToPracticePath} />}
      </section>
    </main>
  );
}

function AppNav({ currentPage, goToPreFeedback, goToRecords, goToSetup }) {
  return (
    <nav className="brand-nav" aria-label="서비스">
      <button className="brand-mark" type="button" onClick={goToSetup} aria-label="Pitch up">
        <span className="brand-spark"><Leaf size={13} /></span>
        Pitch up
      </button>
      <div className="nav-links" aria-label="주요 메뉴">
        <button className={currentPage === "preFeedback" ? "active" : ""} type="button" onClick={goToPreFeedback}>사전 피드백</button>
        <button className={currentPage === "setup" || currentPage === "practice" ? "active" : ""} type="button" onClick={goToSetup}>발표 연습</button>
        <button className={currentPage === "report" || currentPage === "records" ? "active" : ""} type="button" onClick={goToRecords}>기록</button>
      </div>
    </nav>
  );
}

function normalizeScriptFeedback(scriptFeedback) {
  if (!scriptFeedback) return null;
  const score = scriptFeedback.score ?? DEFAULT_SCRIPT_FEEDBACK.score;
  const strengths = scriptFeedback.strengths || scriptFeedback.good_points || [];
  const improvements = scriptFeedback.improvements || scriptFeedback.suggestions || [];
  return {
    score,
    status: scriptFeedback.status || (score >= 80 ? "발표 가능 단계" : "보완 필요 단계"),
    summary: scriptFeedback.summary || scriptFeedback.overall_feedback || DEFAULT_SCRIPT_FEEDBACK.summary,
    strengths: (strengths.length ? strengths : DEFAULT_SCRIPT_FEEDBACK.strengths).slice(0, 3),
    improvements: (improvements.length ? improvements : DEFAULT_SCRIPT_FEEDBACK.improvements).slice(0, 4),
  };
}

function FeedbackSummary({ feedback }) {
  return (
    <div className="script-feedback-summary">
      <div className="script-feedback-score">
        <strong>{feedback.score}</strong>
        <span>점</span>
      </div>
      <div>
        <span className="script-feedback-status">{feedback.status}</span>
        <p>{feedback.summary}</p>
      </div>
    </div>
  );
}

function FeedbackPointList({ items, title, tone }) {
  return (
    <article className={`feedback-point-card ${tone}`}>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>
            <CheckCircle2 size={16} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function ScriptFeedbackCard({ feedback: rawFeedback, onEditScript }) {
  const feedback = normalizeScriptFeedback(rawFeedback);

  if (!feedback) {
    return (
      <article className="script-feedback-card empty">
        <div className="script-feedback-card-head">
          <div>
            <span>Script coaching</span>
            <h3>대본 피드백</h3>
          </div>
          <strong>대기 중</strong>
        </div>
        <p>대본 피드백 버튼을 누르면 발표 흐름, 좋은 점, 개선할 점을 이곳에서 정리해 드립니다.</p>
      </article>
    );
  }

  return (
    <article className="script-feedback-card">
      <div className="script-feedback-card-head">
        <div>
          <span>Script coaching</span>
          <h3>대본 피드백</h3>
        </div>
        <strong>분석 완료</strong>
      </div>
      <FeedbackSummary feedback={feedback} />
      <div className="feedback-point-grid">
        <FeedbackPointList title="좋은 점" tone="positive" items={feedback.strengths} />
        <FeedbackPointList title="개선할 점" tone="caution" items={feedback.improvements} />
      </div>
      <div className="script-feedback-card-cta">
        <p>AI가 찾은 문장을 하나씩 확인하고, 원하는 수정만 내 대본에 반영해보세요.</p>
        <button className="primary-button" type="button" onClick={onEditScript}>
          문장별로 수정해보기
        </button>
      </div>
    </article>
  );
}

function SetupPage({
  aiStatus,
  error,
  importMixedFiles,
  isImporting,
  isPreparing,
  isStarting,
  applyReferenceVideo,
  materialFiles,
  materialFeedback,
  isLoadingReference,
  referenceVideo,
  referenceVideoUrl,
  scriptFeedback,
  script,
  selectReferenceStyleForPractice,
  sessionPrepared,
  setReferenceVideoUrl,
  setScript,
  preparePresentation,
  startPresentation,
  topNavigation,
  openPreFeedback,
}) {
  const [dragging, setDragging] = useState(false);
  const [shouldScrollToFeedback, setShouldScrollToFeedback] = useState(false);
  const [showReferencePanel, setShowReferencePanel] = useState(false);
  const [showScriptFeedbackGuide, setShowScriptFeedbackGuide] = useState(false);
  const fileInputRef = useRef(null);
  const scriptFeedbackButtonRef = useRef(null);
  const preflightRef = useRef(null);
  const referencePanelRef = useRef(null);
  const scriptWords = tokenCount(script);
  const estimatedMinutes = Math.max(1, Math.round(scriptWords / 135));

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    importMixedFiles(event.dataTransfer.files);
  };

  const handleScriptFeedback = async () => {
    setShowScriptFeedbackGuide(false);
    setShouldScrollToFeedback(true);
    await preparePresentation();
  };

  const handlePracticeWithReferenceStyle = () => {
    const nextReferenceStyle = selectReferenceStyleForPractice();
    if (!nextReferenceStyle) return;
    setShowScriptFeedbackGuide(true);
    requestAnimationFrame(() => {
      scriptFeedbackButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const openReferencePanel = () => {
    setShowReferencePanel(true);
    requestAnimationFrame(() => {
      referencePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    if (!shouldScrollToFeedback || (!scriptFeedback && !materialFeedback)) return;
    preflightRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setShouldScrollToFeedback(false);
  }, [materialFeedback, scriptFeedback, shouldScrollToFeedback]);

  return (
    <>
      {topNavigation}

      <header className="product-header">
        <div className="hero-copy">
          <p className="eyebrow">Presentation rehearsal</p>
          <h1>
            PT를 쉽게
            <span>Pitch up</span>
          </h1>
          <div className="hero-actions">
            <button
              className="primary-button"
              disabled={isPreparing || isStarting}
              onClick={startPresentation}
            >
              {isStarting ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
              {isStarting ? "발표 시작 중" : "발표 시작"}
            </button>
            <button className="secondary-button reference-toggle-button" type="button" onClick={openReferencePanel}>
              <SquarePlay size={18} />
              레퍼런스 분석
            </button>
            <span className="hero-note">
              사전 분석은 선택입니다. 바로 시작할 수도 있고, 먼저 피드백을 본 뒤 발표를 시작할 수도 있습니다.
            </span>
          </div>
        </div>
        <div className="script-panel setup-script hero-script" id="script">
          <div className="panel-heading">
            <h2>발표 대본</h2>
            <span>{scriptWords} words · 예상 {estimatedMinutes}분</span>
          </div>
          <textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder={"여기에 발표 대본을 붙여넣으세요.\n\n예) 안녕하세요. 오늘은..."}
          />
          <div
            className={`file-dropzone inline ${dragging ? "dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <FileText size={20} />
            <strong>대본이나 발표 자료를 여기에 놓으세요</strong>
            <span>대본 파일과 발표 자료 파일을 한 번에 올리면, 대본은 자동으로 읽고 PDF/PPTX는 자료 분석 대상으로 함께 등록합니다.</span>
            <div className="script-drop-actions">
              <button
                ref={scriptFeedbackButtonRef}
                className={`script-feedback-button ${showScriptFeedbackGuide ? "attention" : ""}`}
                type="button"
                disabled={isPreparing || isStarting}
                onClick={handleScriptFeedback}
              >
                {isPreparing ? <Loader2 className="spin" size={17} /> : <BarChart3 size={17} />}
                {isPreparing ? "분석 중" : "대본 피드백"}
              </button>
              <button className="file-button" type="button" disabled={isImporting} onClick={() => fileInputRef.current?.click()}>
                {isImporting ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
                {isImporting ? "불러오는 중" : "파일 불러오기"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              hidden
              type="file"
              multiple
              accept=".txt,.md,.markdown,.text,.csv,.srt,.pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              onChange={async (event) => {
                await importMixedFiles(event.target.files);
                event.target.value = "";
              }}
            />
            {materialFiles.length ? (
              <div className="material-file-list">
                {materialFiles.map((file) => (
                  <span key={file.name}>{file.name}</span>
                ))}
              </div>
            ) : null}
            {showScriptFeedbackGuide ? (
              <p className="script-feedback-guide">
                레퍼런스 스타일이 기준으로 저장되었습니다. 대본을 입력하고 대본 피드백을 눌러 먼저 수정한 뒤 발표 연습으로 넘어가세요.
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {error && <div className="notice">{error}</div>}

      {(scriptFeedback || materialFeedback) ? (
        <section className="preflight-feedback" ref={preflightRef}>
          <div className="section-heading">
            <h3>발표 시작 전 피드백</h3>
            <span>{sessionPrepared ? "분석 완료" : "다시 분석 필요"}</span>
          </div>
          <ScriptFeedbackCard feedback={scriptFeedback} onEditScript={openPreFeedback} />
          {materialFeedback ? (
            <div className="preflight-grid single">
            <article className="preflight-card">
              <strong>발표 자료 피드백</strong>
              <div className="preflight-metrics">
                <span>예상 {materialFeedback.estimated_minutes ?? 0}분</span>
                <span>시인성 {materialFeedback.clarity_score ?? 0}</span>
                <span>통일성 {materialFeedback.consistency_score ?? 0}</span>
                <span>주제 적합도 {materialFeedback.topic_fit_score ?? 0}</span>
              </div>
              <p>{materialFeedback.summary}</p>
              {materialFeedback.notes?.length ? (
                <ul>
                  {materialFeedback.notes.slice(0, 3).map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </article>
            </div>
          ) : null}
        </section>
      ) : null}

      {showReferencePanel ? (
        <div className="reference-link-panel" ref={referencePanelRef}>
          <div className="reference-link-copy">
            <span>reference model</span>
            <strong>닮고 싶은 발표를 넣어주세요</strong>
            <p>원하는 발표 레퍼런스를 분석해 내 대본과 비교합니다.</p>
          </div>
          <div className="youtube-link-shell youtube-link-shell-light">
            <SquarePlay size={16} />
            <label>
              <span>youtube reference</span>
              <input
                type="url"
                value={referenceVideoUrl}
                onChange={(event) => setReferenceVideoUrl(event.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                aria-label="유튜브 링크"
              />
            </label>
            <button className="reference-link-button" onClick={applyReferenceVideo} disabled={isLoadingReference} title="영상 분석">
              {isLoadingReference ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
            </button>
          </div>
          <div className="reference-inline-result">
            {referenceVideo ? (
              <>
                <div className="reference-card">
                  {referenceVideo.thumbnail_url ? <img src={referenceVideo.thumbnail_url} alt="" /> : <SquarePlay size={38} />}
                  <div>
                    <strong>{referenceVideo.title || `YouTube 영상 ${referenceVideo.video_id}`}</strong>
                    <span>{referenceVideo.author_name}</span>
                    <span>{referenceVideo.status_label || formatReferenceStatus(referenceVideo)}</span>
                  </div>
                </div>
                <ReferenceQuickAnalysis
                  referenceVideo={referenceVideo}
                  onPracticeWithStyle={handlePracticeWithReferenceStyle}
                />
              </>
            ) : (
              <p>URL을 넣고 분석하면 말하기 속도, 화법, 쉬는 타이밍, 강조 방식을 간단히 보여줍니다.</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

const scoreHistory = [
  { date: "06/18", total: 62, speechRate: 58, structure: 64, fillerWords: 52, persuasion: 61, closing: 66 },
  { date: "06/20", total: 68, speechRate: 62, structure: 70, fillerWords: 60, persuasion: 66, closing: 72 },
  { date: "06/22", total: 74, speechRate: 70, structure: 76, fillerWords: 66, persuasion: 72, closing: 78 },
  { date: "06/24", total: 81, speechRate: 78, structure: 84, fillerWords: 73, persuasion: 79, closing: 86 },
  { date: "06/25", total: 86, speechRate: 82, structure: 88, fillerWords: 80, persuasion: 85, closing: 89 },
];

const scoreOptions = [
  { key: "total", label: "종합", color: "#cc785c" },
  { key: "speechRate", label: "말 속도", color: "#7e8465" },
  { key: "structure", label: "구조", color: "#5a5872" },
  { key: "fillerWords", label: "습관어", color: "#d18c62" },
  { key: "persuasion", label: "설득력", color: "#5db8a6" },
  { key: "closing", label: "마무리", color: "#a9583e" },
];

const summaryCards = [
  { label: "총 연습 횟수", value: "12회", note: "이번 달 4회", change: "+33%", icon: CalendarDays, tone: "sage" },
  { label: "평균 발표 점수", value: "78점", note: "최근 5회 평균", change: "+8점", icon: CircleGauge, tone: "coral" },
  { label: "최고 점수", value: "91점", note: "해커톤 1차 발표", change: "Best", icon: CheckCircle2, tone: "plum" },
  { label: "습관어 감소율", value: "-23%", note: "첫 연습 대비", change: "개선 중", icon: Mic2, tone: "amber" },
];

const capabilityMetrics = [
  { label: "말 속도", value: 82 },
  { label: "구조", value: 88 },
  { label: "습관어", value: 80 },
  { label: "설득력", value: 85 },
  { label: "마무리", value: 89 },
];

function buildLocalPracticeReport({ script, transcript, metrics, referenceVideo, selectedReferenceStyle }) {
  const spokenText = transcript.trim();
  const spokenWordsCount = tokenCount(spokenText);
  const scriptWordsCount = tokenCount(script);
  const elapsedSeconds = Math.max(1, metrics.elapsed || 1);
  const spokenSyllables = syllableCount(spokenText);
  const syllablesPerSecond = Number((metrics.syllablesPerSecond || (spokenSyllables / elapsedSeconds) || 0).toFixed(2));
  const pauseRatioPercent = Math.round((metrics.pauseRatio || 0) * 100);
  const hasEnoughSpeech = spokenWordsCount >= 12;
  const referenceProfile = selectedReferenceStyle?.profile;

  return {
    used_gemini: false,
    overall_score: hasEnoughSpeech ? 72 : 58,
    summary: hasEnoughSpeech
      ? "기본 분석으로 발표 흐름을 점검했습니다. 다음 연습에서는 핵심 문장 뒤 쉬는 타이밍과 강조를 조금 더 선명하게 다듬어 보세요."
      : "말한 내용이 많지 않아 기본 기준으로 예비 피드백을 만들었습니다. 한 문단 이상 말하면 속도와 침묵을 더 정확히 볼 수 있습니다.",
    analysis_meta: {
      level: hasEnoughSpeech ? "preliminary" : "insufficient",
      summary_label: "기본 분석",
      score_visible: true,
      spoken_words: spokenWordsCount,
      script_words: scriptWordsCount,
    },
    pace: {
      syllables_per_second: syllablesPerSecond,
      words_per_minute: metrics.wordsPerMinute || 0,
    },
    silence: {
      longest_seconds: metrics.longestSilence || 0,
      pause_ratio_percent: pauseRatioPercent,
    },
    delivery_match: {
      spoken_words: spokenWordsCount,
      script_words: scriptWordsCount,
      overlap_percent: Math.round(scriptOverlap(script, spokenText) * 100),
    },
    speech_habits: {},
    strengths: [
      "발표 연습을 바로 시작할 수 있도록 기본 기준으로 흐름을 잡았습니다.",
      referenceProfile ? "선택한 레퍼런스 스타일을 기준 비교에 반영할 준비가 되었습니다." : "기본 발표 기준으로 속도와 침묵을 확인했습니다.",
    ],
    improvements: [
      referenceProfile?.speechRate || "말하기 속도를 일정하게 유지해 보세요.",
      referenceProfile?.pauseTiming || "중요한 문장 뒤에는 짧게 멈춰 핵심을 남겨 보세요.",
      referenceProfile?.emphasis || "핵심 단어는 문장 안에서 한 번 더 분명하게 강조해 보세요.",
    ],
    detailed_feedback: {
      priority_feedback: [
        referenceProfile?.speechRate || "말하기 속도가 들쭉날쭉하지 않게 첫 30초를 안정적으로 시작하세요.",
        referenceProfile?.pauseTiming || "문단 전환부에서 1초 정도 쉬면 청자가 따라오기 쉽습니다.",
        referenceProfile?.emphasis || "결론 문장에서는 핵심 단어를 또렷하게 눌러 말하세요.",
      ],
      practice_plan: [
        "대본 첫 문단을 소리 내어 읽고 속도를 일정하게 맞춥니다.",
        "핵심 문장 뒤에 짧은 멈춤을 넣어 다시 연습합니다.",
        "발표 종료 후 리포트에서 속도, 침묵, 대본 전달 항목을 확인합니다.",
      ],
    },
    keyword_feedback: {
      covered_keywords: spokenText ? spokenText.split(/\s+/).slice(0, 5) : [],
      missed_keywords: script.split(/\s+/).filter(Boolean).slice(0, 4),
    },
    timeline_log: [
      {
        time: "00:00",
        type: "start",
        title: "기본 발표 기준으로 시작",
        severity: "low",
        evidence: "레퍼런스나 대본 교정 없이도 발표 연습을 진행했습니다.",
        spoken_excerpt: spokenText || "아직 인식된 발화가 적습니다.",
        suggestion: "다음에는 대본 피드백을 먼저 실행하면 더 구체적인 비교가 가능합니다.",
      },
    ],
    issue_log: hasEnoughSpeech ? [] : [
      {
        time: "00:00",
        type: "short_speech",
        title: "발화량 부족",
        severity: "medium",
        evidence: "분석할 말한 내용이 충분하지 않았습니다.",
        spoken_excerpt: spokenText || "인식된 발화 없음",
        suggestion: "최소 한 문단 이상 말한 뒤 종료하면 채점과 피드백이 더 정확해집니다.",
      },
    ],
    reference_video: referenceVideo || null,
    reference_comparison: selectedReferenceStyle ? {
      title: selectedReferenceStyle.title,
      author_name: selectedReferenceStyle.speakerName,
      targets: ["말하기 속도", "쉬는 타이밍", "강조 방식", "화법"],
      reference_profile: null,
      notes: [
        selectedReferenceStyle.profile.speechRate,
        selectedReferenceStyle.profile.pauseTiming,
        selectedReferenceStyle.profile.emphasis,
      ].filter(Boolean),
      analysis_note: "선택한 레퍼런스 스타일을 기본 비교 기준으로 사용합니다.",
    } : null,
  };
}

const weaknessItems = [
  { tag: "말 속도", text: "발표 초반 30초에서 말 속도가 빠른 편입니다." },
  { tag: "습관어", text: "“어”, “음”, “약간” 같은 습관어가 반복적으로 나타납니다." },
  { tag: "설득력", text: "문제 제기 이후 근거 설명이 짧아 설득력이 약해지는 구간이 있습니다." },
];

const fillerWords = [
  { word: "어", count: 18, change: -6 },
  { word: "음", count: 14, change: -4 },
  { word: "약간", count: 11, change: -2 },
  { word: "그", count: 9, change: -3 },
  { word: "뭔가", count: 7, change: -1 },
];

const practiceGoals = [
  "발표 초반 30초의 말 속도를 조금 낮춰보세요.",
  "문제 제기 뒤에 근거를 한 문장 더 추가해보세요.",
  "마무리에서 서비스의 기대효과를 더 명확히 정리해보세요.",
];

const recentRecords = [
  { date: "06/25", title: "Pitch up 최종 발표 리허설", score: 86, grade: "A", weakest: "습관어", time: "4분 20초" },
  { date: "06/24", title: "해커톤 1차 발표", score: 81, grade: "B+", weakest: "설득력", time: "3분 55초" },
  { date: "06/22", title: "서비스 문제 정의 발표", score: 74, grade: "B", weakest: "마무리", time: "4분 08초" },
  { date: "06/20", title: "팀 중간 공유", score: 68, grade: "C+", weakest: "말 속도", time: "3분 42초" },
  { date: "06/18", title: "첫 발표 연습", score: 62, grade: "C", weakest: "구조", time: "3분 30초" },
];

const recordMenuItems = [
  { label: "홈", icon: Home },
  { label: "사전 피드백", icon: FileText },
  { label: "실전 리허설", icon: Mic2 },
  { label: "질문 코칭", icon: MessageSquareText },
  { label: "나의 기록", icon: LayoutDashboard, active: true },
  { label: "설정", icon: Settings },
];

function RecordsDashboard({ onNewPractice }) {
  const [selectedMetric, setSelectedMetric] = useState("total");
  const [period, setPeriod] = useState("최근 30일");
  const currentOption = scoreOptions.find((option) => option.key === selectedMetric) || scoreOptions[0];
  const latestScore = scoreHistory.at(-1)?.[selectedMetric] ?? 0;
  const previousScore = scoreHistory.at(-2)?.[selectedMetric] ?? latestScore;
  const maxFillerCount = Math.max(...fillerWords.map((item) => item.count));

  return (
    <div className="records-shell">
      <aside className="records-sidebar" aria-label="Pitch up 메뉴">
        <button className="records-brand" type="button" onClick={onNewPractice}>
          <span><Leaf size={15} /></span>
          <strong>Pitch up</strong>
        </button>
        <nav className="records-menu">
          {recordMenuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button className={item.active ? "active" : ""} key={item.label} type="button">
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="records-workspace">
        <div className="records-topbar">
          <label className="records-search">
            <Search size={17} />
            <input placeholder="발표 기록 검색" aria-label="발표 기록 검색" />
          </label>
          <button className="records-icon-button" type="button" aria-label="알림">
            <Bell size={18} />
            <span>2</span>
          </button>
          <div className="records-profile">
            <div>HY</div>
            <span>
              <strong>홍윤상</strong>
              Presenter
            </span>
          </div>
          <button className="records-new-button" type="button" onClick={onNewPractice}>
            <Plus size={17} />
            새 발표 연습
          </button>
        </div>

        <header className="records-header">
          <div>
            <p className="eyebrow">My practice log</p>
            <h1>나의 기록</h1>
            <p>발표 연습 데이터를 기반으로 나의 성장 흐름과 반복 약점을 확인할 수 있습니다.</p>
          </div>
          <div className="period-filter" aria-label="기간 필터">
            {["최근 7일", "최근 30일", "최근 3개월", "전체"].map((item) => (
              <button className={period === item ? "active" : ""} key={item} type="button" onClick={() => setPeriod(item)}>
                {item}
              </button>
            ))}
          </div>
        </header>

        <section className="summary-grid" aria-label="발표 연습 요약">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <article className={`summary-card tone-${card.tone}`} key={card.label}>
                <div className="summary-card-top">
                  <span><Icon size={16} /></span>
                  <em>{card.change}</em>
                </div>
                <strong>{card.value}</strong>
                <p>{card.label}</p>
                <small>{card.note}</small>
              </article>
            );
          })}
        </section>

        <section className="records-main-grid">
          <article className="dashboard-card score-card">
            <div className="records-card-heading">
              <div>
                <h2>발표 점수 변화</h2>
                <p>연습을 반복할수록 종합 점수가 어떻게 변화했는지 보여줍니다.</p>
              </div>
              <button className="card-select" type="button">
                {period}
                <ChevronDown size={15} />
              </button>
            </div>
            <div className="score-tabs">
              {scoreOptions.map((option) => (
                <button
                  className={selectedMetric === option.key ? "active" : ""}
                  key={option.key}
                  style={{ "--metric-color": option.color }}
                  type="button"
                  onClick={() => setSelectedMetric(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <ScoreLineChart metric={selectedMetric} option={currentOption} />
          </article>

          <article className="dashboard-card capability-card">
            <div className="records-card-heading tight">
              <div>
                <h2>현재 발표 역량</h2>
                <p>최근 발표 기준</p>
              </div>
              <MoreHorizontal size={18} />
            </div>
            <div className="records-donut" aria-label={`현재 ${latestScore}점`}>
              <div>
                <strong>{latestScore}</strong>
                <span>점</span>
              </div>
            </div>
            <div className="capability-list">
              {capabilityMetrics.map((item) => (
                <div className="capability-row" key={item.label}>
                  <span>{item.label}</span>
                  <div><i style={{ width: `${item.value}%` }} /></div>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="records-secondary-grid">
          <article className="dashboard-card weakness-card">
            <div className="records-card-heading">
              <div>
                <h2>반복 약점</h2>
                <p>최근 기록에서 반복적으로 확인된 패턴입니다.</p>
              </div>
            </div>
            <div className="weakness-list">
              {weaknessItems.map((item) => (
                <div key={item.text}>
                  <span>{item.tag}</span>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="dashboard-card filler-card">
            <div className="records-card-heading tight">
              <div>
                <h2>자주 쓰는 습관어</h2>
                <p>최근 발표에서 습관어가 이전보다 23% 감소했습니다.</p>
              </div>
            </div>
            <div className="filler-list">
              {fillerWords.map((item) => (
                <div className="filler-row" key={item.word}>
                  <span>{item.word}</span>
                  <div><i style={{ width: `${(item.count / maxFillerCount) * 100}%` }} /></div>
                  <strong>{item.count}회</strong>
                  <em>{item.change}</em>
                </div>
              ))}
            </div>
          </article>

          <article className="dashboard-card goal-card">
            <div className="records-card-heading tight">
              <div>
                <h2>다음 연습 목표</h2>
                <p>다음 발표에서 바로 확인할 세 가지입니다.</p>
              </div>
            </div>
            <ol>
              {practiceGoals.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ol>
            <button className="records-new-button wide" type="button" onClick={onNewPractice}>
              <Play size={17} />
              이 목표로 다시 연습하기
            </button>
          </article>
        </section>

        <section className="dashboard-card records-table-card">
          <div className="records-card-heading">
            <div>
              <h2>최근 발표 기록</h2>
              <p>{period} 기준으로 정리한 발표 연습 로그입니다.</p>
            </div>
            <span className="score-delta">
              <Clock3 size={15} />
              {currentOption.label} {previousScore} → {latestScore}
            </span>
          </div>
          <div className="records-table-wrap">
            <table className="records-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>발표 제목</th>
                  <th>총점</th>
                  <th>등급</th>
                  <th>가장 낮은 항목</th>
                  <th>시간</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.map((record) => (
                  <tr key={`${record.date}-${record.title}`}>
                    <td>{record.date}</td>
                    <td>{record.title}</td>
                    <td><strong>{record.score}</strong>점</td>
                    <td><span className="grade-pill">{record.grade}</span></td>
                    <td>{record.weakest}</td>
                    <td>{record.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  );
}

function ScoreLineChart({ metric, option }) {
  const width = 620;
  const height = 260;
  const padX = 42;
  const padTop = 20;
  const padBottom = 34;
  const plotWidth = width - padX * 2;
  const plotHeight = height - padTop - padBottom;
  const points = scoreHistory.map((item, index) => {
    const x = padX + (plotWidth / (scoreHistory.length - 1)) * index;
    const y = padTop + (100 - item[metric]) * (plotHeight / 100);
    return { ...item, x, y, value: item[metric] };
  });
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = `${padX},${height - padBottom} ${path} ${width - padX},${height - padBottom}`;

  return (
    <div className="score-chart" style={{ "--chart-color": option.color }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${option.label} 점수 변화`}>
        <defs>
          <linearGradient id="scoreArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={option.color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={option.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[25, 50, 75, 100].map((tick) => {
          const y = padTop + (100 - tick) * (plotHeight / 100);
          return (
            <g key={tick}>
              <line className="chart-grid" x1={padX} x2={width - padX} y1={y} y2={y} />
              <text className="chart-tick" x="8" y={y + 4}>{tick}</text>
            </g>
          );
        })}
        <polygon points={areaPath} fill="url(#scoreArea)" />
        <polyline className="score-line" points={path} />
        {points.map((point, index) => (
          <g key={`${point.date}-${metric}`}>
            <circle className="score-point" cx={point.x} cy={point.y} r={index === points.length - 1 ? 6 : 4} />
            <text className="chart-label" x={point.x} y={height - 8} textAnchor="middle">{point.date}</text>
            {index === points.length - 1 ? (
              <g>
                <rect className="chart-tooltip-bg" x={point.x - 34} y={point.y - 38} width="68" height="24" rx="7" />
                <text className="chart-tooltip" x={point.x} y={point.y - 22} textAnchor="middle">{point.value}점</text>
              </g>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

function ReportPage({ aiStatus, error, isFinishing, report, reset, materialFeedback, scriptFeedback, spokenWords }) {
  return (
    <>
      <header className="product-header compact">
        <div>
          <p className="eyebrow">Report</p>
          <h1>발표 리포트</h1>
        </div>
        <button className="primary-button" onClick={reset}>
          <RefreshCcw size={18} />
          다시 연습
        </button>
      </header>

      {error && <div className="notice">{error}</div>}
      {isFinishing && !report ? (
        <section className="report-loading-card">
          <Loader2 className="spin" size={22} />
          <div>
            <strong>리포트를 정리하고 있어요</strong>
            <p>방금 연습한 발화와 대본 반영도를 분석해 결과를 만들고 있습니다.</p>
          </div>
        </section>
      ) : null}
      {report ? <Report aiStatus={aiStatus} report={report} scriptFeedback={scriptFeedback} spokenWords={spokenWords} /> : null}
    </>
  );
}

const HIDDEN_REPORT_MARKERS = ["신지영", "운율 중심", "연구를 반영", "criteria_basis", "rubric", "내부 기준"];

const FEEDBACK_TOPICS = {
  rhythm: ["리듬", "구간별", "변동", "일정"],
  pace: ["속도", "말속도", "빠른", "빨라", "느린", "느려", "음절", "wpm"],
  pause: ["침묵", "휴지", "멈춤", "쉬는", "쉼", "공백", "복구"],
  script: ["대본", "핵심어", "키워드", "메시지", "반영"],
  material: ["자료", "슬라이드", "시인성", "발표자료"],
  ending: ["마무리", "결론", "감사"],
};

function cleanVisibleText(value) {
  return String(value || "")
    .replace("논문에서 전달력 높은 말하기로 제시된 보통 발화 속도(초당 약 6음절)에 가깝습니다.", "말 속도가 안정적이라 핵심 내용이 따라가기 좋습니다.")
    .replace("전체 발화 중 휴지 비율이 논문에서 제시한 전달력 높은 말하기의 범위에 가깝습니다.", "쉬는 타이밍이 과하지 않아 발표 흐름이 안정적입니다.")
    .replace("휴지 비율이 25% 이상이면 전달력이 떨어질 수 있습니다.", "쉬는 시간이 길어 흐름이 끊겨 보일 수 있습니다.")
    .replaceAll("논문에서 제시한 전달력 높은 말하기의 ", "")
    .replaceAll("논문에서 전달력 높은 말하기로 제시된 ", "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTranscriptText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function feedbackTopicKey(item) {
  const text = cleanVisibleText(item).toLowerCase();
  const found = Object.entries(FEEDBACK_TOPICS).find(([, keywords]) => keywords.some((keyword) => text.includes(keyword.toLowerCase())));
  return found ? found[0] : text.slice(0, 32);
}

function dedupeTextItems(items = [], limit = Infinity) {
  const seenTopics = new Set();
  const seenTexts = new Set();
  const result = [];
  items.forEach((item) => {
    const text = cleanVisibleText(item);
    const exactKey = text.replace(/\s+/g, "");
    const topicKey = feedbackTopicKey(text);
    if (!text || seenTexts.has(exactKey) || seenTopics.has(topicKey) || result.length >= limit) return;
    seenTexts.add(exactKey);
    seenTopics.add(topicKey);
    result.push(text);
  });
  return result;
}

function dedupeIssues(issues = [], limit = Infinity) {
  const seenTypes = new Set();
  const result = [];
  issues.forEach((issue) => {
    const typeKey = issue.type || issue.title;
    if (!typeKey || seenTypes.has(typeKey) || result.length >= limit) return;
    seenTypes.add(typeKey);
    result.push({
      ...issue,
      title: cleanVisibleText(issue.title),
      evidence: cleanVisibleText(issue.evidence),
      spoken_excerpt: cleanVisibleText(issue.spoken_excerpt),
      suggestion: cleanVisibleText(issue.suggestion),
    });
  });
  return result;
}

function cleanIssues(issues = [], limit = Infinity) {
  return issues.slice(0, limit).map((issue) => ({
    ...issue,
    title: cleanVisibleText(issue.title),
    evidence: cleanVisibleText(issue.evidence),
    spoken_excerpt: cleanVisibleText(issue.spoken_excerpt),
    suggestion: cleanVisibleText(issue.suggestion),
  }));
}

function visibleReportSummary(report) {
  const summary = cleanVisibleText(report.summary);
  if (!summary || HIDDEN_REPORT_MARKERS.some((marker) => summary.includes(marker))) {
    const score = report.overall_score ?? 0;
    if (score >= 80) return "전체 흐름은 안정적입니다. 다음 연습에서는 강조와 마무리만 조금 더 선명하게 다듬어 보세요.";
    if (score >= 60) return "발표의 큰 흐름은 잡혀 있습니다. 속도, 쉬는 타이밍, 핵심어 전달을 조금 더 정리하면 훨씬 또렷해집니다.";
    return "이번 연습에서는 흐름을 먼저 안정시키는 것이 좋습니다. 긴 침묵과 핵심어 전달을 우선 다듬어 보세요.";
  }
  return summary;
}

function Report({ aiStatus, report, scriptFeedback, spokenWords }) {
  const aiLive = Boolean(report.used_gemini);
  const analysisMeta = report.analysis_meta || {};
  const analysisBasis = report.analysis_basis || {};
  const scoreVisible = analysisMeta.score_visible !== false;
  const score = report.overall_score ?? 0;
  const quickSummary = buildQuickSummary(report);
  const reportSummary = visibleReportSummary(report);
  const issueLog = dedupeIssues(report.issue_log || [], 12);
  const timelineLog = cleanIssues(report.timeline_log || [], 20);
  const strengths = dedupeTextItems(report.strengths || [], 4);
  const priorityFeedback = dedupeTextItems(report.detailed_feedback?.priority_feedback || report.improvements || [], 5);
  const practicePlan = dedupeTextItems(report.detailed_feedback?.practice_plan || [], 5);
  const referenceSpeakerComparison = report.reference_speaker_comparison;
  const fullTranscript = normalizeTranscriptText(report.transcript_full);

  return (
    <section className="report-panel service-report">
      <div className="report-summary-card">
        <div>
          <p className="eyebrow">{aiLive ? "AI Coaching" : "Basic Coaching"} · {analysisMeta.summary_label || "정식 결과"}</p>
          <h2>{!scoreVisible ? "말한 내용이 더 쌓이면 더 정확하게 볼 수 있어요" : score >= 80 ? "전달력이 좋은 발표였어요" : score >= 60 ? "조금만 다듬으면 더 좋아져요" : "발표 흐름을 다시 잡아보세요"}</h2>
          <p>{quickSummary}</p>
          <p className="report-summary-detail">{reportSummary}</p>
        </div>
        <div className="service-score">
          <strong>{scoreVisible ? score : "-"}</strong>
          <span>{scoreVisible ? "점" : "예비"}</span>
        </div>
      </div>

      <div className="report-pill-row">
        <ResultPill label="속도" value={userReportPace(report)} />
        <ResultPill label="쉼 타이밍" value={userReportSilence(report)} />
        <ResultPill label="내용 전달" value={userReportDelivery(report)} />
      </div>

      <div className="detail-score-grid">
        <ScoreDetail label="말하기 속도" value={`${report.pace?.syllables_per_second ?? 0} 음절/초`} hint="자연스러운 목표 5.6-6.3" />
        <ScoreDetail label="가장 길게 멈춘 시간" value={`${report.silence?.longest_seconds ?? 0}초`} hint="5초 이상이면 흐름이 끊길 수 있어요" />
        <ScoreDetail label="쉬는 시간 비중" value={`${report.silence?.pause_ratio_percent ?? 0}%`} hint="보통 약 15%가 자연스러워요" />
        <ScoreDetail label="말한 단어 수" value={`${analysisMeta.spoken_words ?? report.delivery_match?.spoken_words ?? 0}개`} hint="말한 내용 기준" />
        <ScoreDetail label="인식 구간 수" value={`${analysisMeta.speech_samples ?? 0}개`} hint="말이 실제로 잡힌 구간" />
      </div>

      {referenceSpeakerComparison ? (
        <section className="reference-report reference-speaker-report">
          <div className="section-heading">
            <h3>기준 발표자 비교</h3>
            <span>{referenceSpeakerComparison.summary?.similarity_score ?? 0}점 유사</span>
          </div>
          <strong>
            {referenceSpeakerComparison.reference?.name} · {referenceSpeakerComparison.reference?.style_type}
          </strong>
          <p>{referenceSpeakerComparison.reference?.description}</p>
          <div className="reference-metric-grid">
            <ScoreDetail
              label="말 밀도"
              value={`${referenceSpeakerComparison.summary?.user_speech_density_avg ?? 0} WPM`}
              hint={`기준 ${referenceSpeakerComparison.summary?.reference_speech_density_avg ?? 0} WPM · ${referenceSpeakerComparison.summary?.density_diff_percent ?? 0}%`}
            />
            <ScoreDetail
              label="평균 쉼"
              value={`${referenceSpeakerComparison.summary?.user_avg_pause_sec ?? 0}초`}
              hint={`기준 ${referenceSpeakerComparison.summary?.reference_avg_pause_sec ?? 0}초`}
            />
            <ScoreDetail
              label="긴 쉼"
              value={`${referenceSpeakerComparison.summary?.user_long_pause_count_ge_1s ?? 0}회`}
              hint={`기준 ${referenceSpeakerComparison.summary?.reference_long_pause_count_ge_1s ?? 0}회`}
            />
            <ScoreDetail
              label="강조 변화"
              value={`${referenceSpeakerComparison.summary?.user_volume_variation_db ?? 0}`}
              hint={`기준 ${referenceSpeakerComparison.summary?.reference_volume_variation_db ?? 0}`}
            />
          </div>
          <ul>
            {(referenceSpeakerComparison.feedback || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="reference-section-grid">
            {(referenceSpeakerComparison.section_feedback || []).map((section) => (
              <article key={section.section}>
                <h4>{section.label}</h4>
                <p>{section.density_feedback}</p>
                <p>{section.pause_feedback}</p>
                <span>
                  내 발표 {section.user?.speech_density ?? 0} WPM / {section.user?.avg_pause_sec ?? 0}초 쉼
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {report.reference_video ? (
        <section className="reference-report">
          <div className="section-heading">
            <h3>기준 발표 영상</h3>
            <span>{report.reference_video.author_name || "YouTube"}</span>
          </div>
          <div className="reference-card">
            <img src={report.reference_video.thumbnail_url} alt="" />
            <div>
              <strong>{report.reference_video.title || `YouTube 영상 ${report.reference_video.video_id}`}</strong>
              <span>{report.reference_video.analysis_note}</span>
            </div>
          </div>
        </section>
      ) : null}

      <div className="feedback-columns service-feedback">
        <FeedbackList title="잘한 점" items={strengths} />
        <FeedbackList title="우선 고칠 점" items={priorityFeedback} />
      </div>

      <section className="issue-section">
        <div className="section-heading">
          <h3>발표 타임라인 로그</h3>
          <span>{timelineLog.length}개 구간</span>
        </div>
        {timelineLog.length ? (
          <div className="issue-list">
            {timelineLog.map((issue) => (
              <IssueItem key={`${issue.time}-${issue.type}-${issue.title}`} issue={issue} />
            ))}
          </div>
        ) : (
          <p className="issue-empty">아직 전체 타임라인 로그가 생성되지 않았습니다. 이 영역은 발표 전체 구간 로그만 표시합니다.</p>
        )}
      </section>

      <section className="issue-section">
        <div className="section-heading">
          <h3>문제 구간 로그</h3>
          <span>{issueLog.length}개 구간</span>
        </div>
        {issueLog.length ? (
          <div className="issue-list">
            {issueLog.map((issue) => (
              <IssueItem key={`${issue.time}-${issue.type}-${issue.title}-issue`} issue={issue} />
            ))}
          </div>
        ) : (
          <p className="issue-empty">눈에 띄는 경고 구간은 따로 잡히지 않았습니다.</p>
        )}
      </section>

      <section className="report-two-column">
        <div className="keyword-card">
          <h3>분석 근거</h3>
          <p>이번 리포트가 실제로 참고한 인식 데이터입니다.</p>
          <KeywordGroup title="분석 단계" items={[analysisMeta.summary_label || "정식 분석"]} emptyText="분석 단계 정보가 없습니다." />
          <KeywordGroup
            title="분석 소스"
            items={[aiLive ? "AI + 수집 메트릭 기반" : "수집 메트릭 기반"]}
            emptyText="분석 소스 정보가 없습니다."
          />
          <KeywordGroup
            title="수집량"
            items={[
              `인식 단어 ${analysisBasis.spoken_words ?? analysisMeta.spoken_words ?? 0}개`,
              `인식 구간 ${analysisBasis.speech_samples ?? analysisMeta.speech_samples ?? 0}개`,
              `타임라인 ${analysisBasis.timeline_count ?? timelineLog.length ?? 0}개`,
              `문제 구간 ${analysisBasis.issue_count ?? issueLog.length ?? 0}개`,
            ]}
            emptyText="수집 정보가 없습니다."
          />
        </div>
        <div className="practice-plan-card">
          <h3>STT 전문</h3>
          <p>{fullTranscript || "아직 표시할 STT 전문이 없습니다."}</p>
        </div>
      </section>

      <section className="report-two-column">
        <div className="keyword-card">
          <h3>말 습관 분석</h3>
          <p>말한 내용을 바탕으로 자주 나온 말 습관을 정리했습니다.</p>
          <KeywordGroup title="추임새" items={Object.entries(report.speech_habits?.filler_counts || {}).map(([key, value]) => `${key} ${value}회`)} emptyText="눈에 띄는 추임새가 많지 않습니다." />
          <KeywordGroup title="반복 표현" items={(report.speech_habits?.repeated_tokens || []).map((item) => `${item.token} ${item.count}회`)} emptyText="과도한 반복 표현은 크지 않습니다." />
          <KeywordGroup title="주의 메모" items={report.speech_habits?.notes || []} emptyText="특이한 말 습관 메모가 없습니다." />
        </div>
        <div className="practice-plan-card">
          <h3>다음 연습 계획</h3>
          <ol>
            {practicePlan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </section>

      {report.reference_comparison ? (
        <div className="reference-report">
          <h3>기준 발표 영상 비교</h3>
          <strong>
            {report.reference_comparison.title} · {report.reference_comparison.author_name}
          </strong>
          <div className="reference-targets">
            {(report.reference_comparison.targets || ["말하기 속도", "화법", "쉬는 타이밍", "강조 방식"]).map((target) => (
              <span key={target}>{target}</span>
            ))}
          </div>
          {report.reference_comparison.reference_profile ? (
            <p>
              기준 음성: 초당 {report.reference_comparison.reference_profile.syllables_per_second}음절 · 문장당 평균{" "}
              {report.reference_comparison.reference_profile.average_sentence_words}단어
            </p>
          ) : null}
          <ul>
            {(report.reference_comparison.notes || []).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <p>{report.reference_comparison.analysis_note}</p>
        </div>
      ) : null}

      <div className="report-note">
        {aiLive ? "AI 분석이 반영된 리포트입니다." : "AI 연결이 불안정해 기본 분석으로 리포트를 만들었습니다."}
      </div>
    </section>
  );
}

function ScoreDetail({ label, value, hint }) {
  return (
    <div className="score-detail">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </div>
  );
}

function IssueItem({ issue }) {
  return (
    <article className={`issue-item severity-${issue.severity}`}>
      <div className="issue-time">{issue.time}</div>
      <div>
        <div className="issue-title-row">
          <h4>{issue.title}</h4>
          <span>{severityLabel(issue.severity)}</span>
        </div>
        <p className="issue-evidence">{issue.evidence}</p>
        <blockquote>{issue.spoken_excerpt}</blockquote>
        <p className="issue-suggestion">{issue.suggestion}</p>
      </div>
    </article>
  );
}

function KeywordGroup({ emptyText = "표시할 키워드가 없습니다.", items, title }) {
  return (
    <div className="keyword-group">
      <strong>{title}</strong>
      <div>
        {items.length ? items.map((item) => <span key={item}>{item}</span>) : <em>{emptyText}</em>}
      </div>
    </div>
  );
}

function severityLabel(severity) {
  if (severity === "high") return "중요";
  if (severity === "medium") return "주의";
  return "참고";
}

function ResultPill({ label, value }) {
  return (
    <div className="result-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FeedbackList({ title, items = [] }) {
  return (
    <div className="feedback-card">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function userReportPace(report) {
  const sps = report.pace?.syllables_per_second ?? 0;
  if (sps >= 5.6 && sps <= 6.3) return "좋음";
  if (sps > 6.3) return "빠름";
  return "느림";
}

function userReportSilence(report) {
  const ratio = report.silence?.pause_ratio_percent ?? 0;
  if (ratio >= 25) return "조금 김";
  if (ratio >= 10 && ratio <= 20) return "자연스러움";
  return "보통";
}

function userReportDelivery(report) {
  const level = report.analysis_meta?.level || "full";
  const words = report.delivery_match?.spoken_words ?? 0;
  if (level === "insufficient") return "기록이 적음";
  if (level === "preliminary") return "간단 점검";
  if (words >= 120) return "충분함";
  if (words >= 60) return "보통";
  return "조금 더 말하기";
}

function buildQuickSummary(report) {
  const pace = userReportPace(report);
  const silence = userReportSilence(report);
  const delivery = userReportDelivery(report);
  return `말하기 속도는 ${pace}, 쉬는 타이밍은 ${silence}, 내용 전달은 ${delivery} 상태입니다.`;
}

export default App;
