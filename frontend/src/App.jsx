import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Clock3, FileText, Leaf, Loader2, MessageCircle, Mic, Play, Search, RefreshCcw, SquarePlay, Upload } from "lucide-react";
import PracticePage from "./components/PracticePage";
import ReferenceQuickAnalysis from "./components/ReferenceQuickAnalysis";
import { audience, situationMessages } from "./data/audience";
import {
  buildPreparationSignature,
  clamp,
  formatReferenceStatus,
  getSituation,
  looksLikeScriptFile,
  reactionFromSituation,
  scriptOverlap,
  syllableCount,
  tokenCount,
  userDeliveryLabel,
  userPaceLabel,
  userSilenceLabel,
} from "./utils/presentation";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const SETUP_STORAGE_KEY = "presentation.setup.v1";

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

const analysisItems = [
  { label: "말 빠르기", icon: Mic },
  { label: "침묵 구간", icon: Clock3 },
  { label: "대본 전달력", icon: BarChart3 },
  { label: "쿠션어 사용", icon: MessageCircle },
  { label: "전환 문장 타이밍", icon: Clock3 },
  { label: "마무리 밀도", icon: BarChart3 },
];

function App() {
  const [page, setPage] = useState("setup");
  const [script, setScript] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [isPresenting, setIsPresenting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcriptSegments, setTranscriptSegments] = useState([]);
  const [interimTranscript, setInterimTranscript] = useState("");
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
  const [chat, setChat] = useState([]);
  const [report, setReport] = useState(null);
  const [scriptFeedback, setScriptFeedback] = useState(null);
  const [materialFeedback, setMaterialFeedback] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState("");
  const [referenceVideo, setReferenceVideo] = useState(null);
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
  const volumeRef = useRef(0);
  const voiceActiveRef = useRef(false);
  const lastRecognizedAtRef = useRef(0);
  const lastRecognizedWordCountRef = useRef(0);
  const silenceStreakRef = useRef(0);
  const silenceSecondsRef = useRef(0);
  const longestSilenceRef = useRef(0);
  const wordHistoryRef = useRef([]);
  const thresholdRef = useRef(0.022);
  const calibrationRef = useRef({ samples: [], done: false });
  const lastChatKeyRef = useRef("");
  const lastChatAtRef = useRef(0);
  const transcriptScrollRef = useRef(null);
  const setupRestoredRef = useRef(false);
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
  const liveTranscript = useMemo(
    () => `${committedTranscript} ${interimTranscript}`.replace(/\s+/g, " ").trim(),
    [committedTranscript, interimTranscript],
  );
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
    setupRestoredRef.current = true;
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
    volumeRef.current = 0;
    voiceActiveRef.current = false;
    lastRecognizedAtRef.current = Date.now();
    lastRecognizedWordCountRef.current = 0;
    silenceStreakRef.current = 0;
    silenceSecondsRef.current = 0;
    longestSilenceRef.current = 0;
    wordHistoryRef.current = [];
    thresholdRef.current = 0.022;
    calibrationRef.current = { samples: [], done: false };
    lastChatKeyRef.current = "";
    lastChatAtRef.current = 0;
  };

  const refreshAiStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/status`);
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
    try {
      const response = await fetch(`${API_BASE_URL}/api/reference/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) throw new Error("YouTube 기준 영상을 확인하지 못했습니다.");
      setReferenceVideo(await response.json());
    } catch (err) {
      setReferenceVideo(null);
      setError(err.message || "기준 영상을 불러오지 못했습니다.");
    } finally {
      setIsLoadingReference(false);
    }
  };

  const pushChatForSituation = (nextSituation, now, force = false) => {
    const shouldPost =
      force ||
      nextSituation !== lastChatKeyRef.current ||
      now - lastChatAtRef.current > 9000 ||
      ["longSilence", "tooFast", "unclear"].includes(nextSituation);

    if (!shouldPost || now - lastChatAtRef.current < 3500) return;

    const message = situationMessages[nextSituation] || situationMessages.opening;
    setChat((prev) => [
      ...prev.slice(-6),
      {
        id: `${now}-${nextSituation}`,
        name: message.name,
        text: message.text,
        reaction: message.reaction,
      },
    ]);
    lastChatKeyRef.current = nextSituation;
    lastChatAtRef.current = now;
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
        setTranscriptSegments((prev) => [...prev, cleanedFinal]);
        interimRef.current = "";
        lastInterimRef.current = "";
        setInterimTranscript("");
      }

      if (interimText.trim()) {
        const cleanedInterim = interimText.replace(/\s+/g, " ").trim();
        interimRef.current = cleanedInterim;
        lastInterimRef.current = cleanedInterim;
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
          const avgNoise =
            calibrationRef.current.samples.reduce((total, sample) => total + sample, 0) /
            calibrationRef.current.samples.length;
          thresholdRef.current = clamp(avgNoise * 2.8, 0.016, 0.055);
          calibrationRef.current.done = true;
        }
      }

      const isVoice = rms > thresholdRef.current;
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
      const isRecognizedSilence = nextElapsed > 3 && secondsSinceRecognized > 2.4;

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

      const nextSituation = getSituation({
        elapsed: nextElapsed,
        wordsPerMinute: Math.round(rollingWpm),
        syllablesPerSecond: nextSyllablesPerSecond,
        silenceStreak: silenceStreakRef.current,
        voiceActive: voiceActiveRef.current,
        secondsSinceRecognized,
        overlap: scriptOverlap(script, currentTranscript),
      });

      setElapsed(nextElapsed);
      setWordsPerMinute(Math.round(rollingWpm));
      setSyllablesPerSecond(Number(nextSyllablesPerSecond.toFixed(2)));
      setArticulationSyllablesPerSecond(Number(nextArticulationRate.toFixed(2)));
      setPauseRatio(Number(nextPauseRatio.toFixed(3)));
      setSilenceStreak(silenceStreakRef.current);
      setSilenceSeconds(silenceSecondsRef.current);
      setLongestSilence(longestSilenceRef.current);
      setSituation(nextSituation);
      pushChatForSituation(nextSituation, now, nextElapsed === 1);
    }, 1000);
  };

  const postMetric = async () => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return;
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

  const launchPresentation = async (nextSessionId) => {
    setSessionId(nextSessionId);
    sessionIdRef.current = nextSessionId;
    setError("");
    setReport(null);
    setTranscriptSegments([]);
    setInterimTranscript("");
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
      formData.append("reference_video_url", referenceVideoUrl.trim());
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
      setReferenceVideo(data.reference_video || null);
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
    if (script.trim().length < 10) {
      setError("대본을 조금 더 입력해 주세요.");
      return;
    }

    setIsStarting(true);
    try {
      const formData = new FormData();
      formData.append("script", script);
      formData.append("reference_video_url", referenceVideoUrl.trim());
      materialFiles.forEach((file) => {
        formData.append("materials", file);
      });
      const response = await fetch(`${API_BASE_URL}/api/session/start`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "발표 세션을 시작하지 못했습니다.");
      setReferenceVideo(data.reference_video || null);
      await launchPresentation(data.session_id);
    } catch (err) {
      cleanupRecording();
      setSessionId("");
      sessionIdRef.current = "";
      setError(err.message || "발표 시작 중 문제가 생겼습니다.");
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
    const finalTranscript = `${transcriptRef.current} ${interimRef.current || lastInterimRef.current}`.trim();
    cleanupRecording();
    try {
      await postMetric();
      const response = await fetch(`${API_BASE_URL}/api/session/${currentSessionId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: finalTranscript }),
      });
      if (!response.ok) throw new Error("리포트를 만들지 못했습니다.");
      setReport(await response.json());
      refreshAiStatus();
      setPage("report");
    } catch (err) {
      setError(err.message || "종료 중 문제가 생겼습니다.");
    } finally {
      setIsFinishing(false);
    }
  };

  const reset = () => {
    cleanupRecording();
    setPage("setup");
    setSessionId("");
    sessionIdRef.current = "";
    setIsPresenting(false);
    isPresentingRef.current = false;
    setReport(null);
    setChat([]);
    setTranscriptSegments([]);
    setInterimTranscript("");
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
    setIsPresenting(false);
    isPresentingRef.current = false;
  };

  useEffect(() => () => cleanupRecording(), []);

  useEffect(() => {
    refreshAiStatus();
  }, []);

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
            sessionPrepared={Boolean(preparedSignature && preparedSignature === buildPreparationSignature(script, materialFiles, referenceVideoUrl))}
            setReferenceVideoUrl={setReferenceVideoUrl}
            setScript={setScript}
            preparePresentation={preparePresentation}
            startPresentation={startPresentation}
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
            paceLabel={userPaceLabel(syllablesPerSecond)}
            silenceLabel={userSilenceLabel(pauseRatio, silenceStreak)}
            deliveryLabel={userDeliveryLabel(overlap)}
          />
        )}

        {page === "report" && (
          <ReportPage
            aiStatus={aiStatus}
            error={error}
            report={report}
            reset={reset}
            materialFeedback={materialFeedback}
            scriptFeedback={scriptFeedback}
            spokenWords={spokenWords}
          />
        )}
      </section>
    </main>
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
  sessionPrepared,
  setReferenceVideoUrl,
  setScript,
  preparePresentation,
  startPresentation,
}) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const scriptWords = tokenCount(script);
  const estimatedMinutes = Math.max(1, Math.round(scriptWords / 135));
  const keywordEstimate = scriptWords ? Math.min(12, Math.max(1, Math.round(scriptWords / 18))) : 0;

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    importMixedFiles(event.dataTransfer.files);
  };

  return (
    <>
      <nav className="brand-nav" aria-label="서비스">
        <a className="brand-mark" href="#top" aria-label="온라인 발표 연습실">
          <span className="brand-spark"><Leaf size={13} /></span>
          rehearsal note
        </a>
        <div className="nav-links">
          <a href="#script">대본</a>
          <a href="#insight">피드백</a>
          <a href="#script">시작</a>
        </div>
      </nav>

      <header className="product-header">
        <div className="hero-copy">
          <p className="eyebrow">Presentation rehearsal</p>
          <h1>
            내가 닮을 발표
            <span>Pitch up</span>
          </h1>
          <div className="hero-actions">
            <button
              className="secondary-button"
              disabled={isPreparing || isStarting}
              onClick={preparePresentation}
            >
              {isPreparing ? <Loader2 className="spin" size={18} /> : <BarChart3 size={18} />}
              {isPreparing ? "사전 분석 중" : "사전 분석"}
            </button>
            <button
              className="primary-button"
              disabled={isPreparing || isStarting}
              onClick={startPresentation}
            >
              {isStarting ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
              {isStarting ? "발표 시작 중" : "발표 시작"}
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
            <button className="file-button" type="button" disabled={isImporting} onClick={() => fileInputRef.current?.click()}>
              {isImporting ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
              {isImporting ? "불러오는 중" : "파일 불러오기"}
            </button>
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
          </div>
        </div>
      </header>

      {error && <div className="notice">{error}</div>}

      <div className="reference-link-panel">
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
                <img src={referenceVideo.thumbnail_url} alt="" />
                <div>
                  <strong>{referenceVideo.title || `YouTube 영상 ${referenceVideo.video_id}`}</strong>
                  <span>{referenceVideo.author_name}</span>
                  <span>{formatReferenceStatus(referenceVideo)}</span>
                </div>
              </div>
              <ReferenceQuickAnalysis referenceVideo={referenceVideo} />
            </>
          ) : (
            <p>URL을 넣고 분석하면 말하기 속도, 화법, 쉬는 타이밍, 강조 방식을 간단히 보여줍니다.</p>
          )}
        </div>
      </div>

      <section className="setup-grid">
        <aside className="hero-dashboard setup-dashboard" aria-label="리허설 프리뷰">
          <div className="dashboard-topline">
            <span>session brief</span>
            <strong>{scriptWords || 0} words</strong>
          </div>
          <div className="preview-metrics">
            <div className="preview-card raised">
              <Clock3 size={18} />
              <span>예상 시간</span>
              <strong>{estimatedMinutes}<small>분</small></strong>
            </div>
            <div className="preview-card">
              <BarChart3 size={18} />
              <span>피드백</span>
              <strong>{analysisItems.length}<small>가지</small></strong>
            </div>
          </div>
          <div className="mini-chart" aria-label="리허설 분석 예시">
            <div className="brief-line">
              <span>pace</span>
              <strong>5.9 syll/sec</strong>
            </div>
            <div className="brief-line">
              <span>pause</span>
              <strong>2.4 sec longest</strong>
            </div>
            <div className="brief-line">
              <span>script</span>
              <strong>{keywordEstimate ? `핵심어 ${keywordEstimate}개 후보` : "대본 입력 대기"}</strong>
            </div>
            <p className="brief-copy">문장 끝에서 호흡이 조금 짧습니다. 두 번째 전환부 앞에 쉼표를 하나 더 두세요.</p>
          </div>
        </aside>

        <aside className="ready-panel" id="insight">
          <div className="service-checklist">
            <h2>조용히 봐드릴 부분</h2>
            <p>발표를 끊지 않고, 끝난 뒤 필요한 부분만 부드럽게 정리합니다.</p>
            {analysisItems.map(({ icon: Icon, label }) => (
              <span key={label}><Icon size={15} />{label}</span>
            ))}
          </div>
        </aside>
      </section>

      {(scriptFeedback || materialFeedback) ? (
        <section className="preflight-feedback">
          <div className="section-heading">
            <h3>발표 시작 전 피드백</h3>
            <span>{sessionPrepared ? "분석 완료" : "다시 분석 필요"}</span>
          </div>
          <div className="preflight-grid">
            <article className="preflight-card">
              <strong>대본 피드백</strong>
              {scriptFeedback ? (
                <>
                  <div className="preflight-score">{scriptFeedback.score ?? 0}점</div>
                  <p>단어 수 {scriptFeedback.word_count ?? 0}개, 문장 평균 {scriptFeedback.average_sentence_words ?? 0}단어</p>
                  <ul>
                    {(scriptFeedback.suggestions || []).slice(0, 3).map((suggestion) => (
                      <li key={suggestion}>{suggestion}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>사전 분석을 받으면 대본 전달력 피드백이 여기에 표시됩니다.</p>
              )}
            </article>

            <article className="preflight-card">
              <strong>발표 자료 피드백</strong>
              {materialFeedback ? (
                <>
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
                </>
              ) : (
                <p>발표 자료를 함께 올리면 자료별 시인성과 주제 적합도 피드백이 여기에 표시됩니다.</p>
              )}
            </article>
          </div>
        </section>
      ) : null}
    </>
  );
}

function ReportPage({ aiStatus, error, report, reset, materialFeedback, scriptFeedback, spokenWords }) {
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
      {report ? <Report aiStatus={aiStatus} report={report} materialFeedback={materialFeedback} scriptFeedback={scriptFeedback} spokenWords={spokenWords} /> : null}
    </>
  );
}

function Report({ aiStatus, report, materialFeedback, scriptFeedback, spokenWords }) {
  const aiLive = Boolean(report.used_gemini);
  const score = report.overall_score ?? 0;
  const quickSummary = buildQuickSummary(report);
  const issueLog = report.issue_log || [];
  const timelineLog = report.timeline_log || [];
  const priorityFeedback = report.detailed_feedback?.priority_feedback || report.improvements || [];
  const practicePlan = report.detailed_feedback?.practice_plan || [];
  const keywordFeedback = report.keyword_feedback || {};
  const presentationMaterial = report.presentation_material || materialFeedback || null;

  return (
    <section className="report-panel service-report">
      <div className="report-summary-card">
        <div>
          <p className="eyebrow">{aiLive ? "AI Coaching" : "Basic Coaching"}</p>
          <h2>{score >= 80 ? "전달력이 좋은 발표였어요" : score >= 60 ? "조금만 다듬으면 더 좋아져요" : "발표 흐름을 다시 잡아보세요"}</h2>
          <p>{quickSummary}</p>
          <p className="report-summary-detail">{report.summary}</p>
        </div>
        <div className="service-score">
          <strong>{score}</strong>
          <span>점</span>
        </div>
      </div>

      <div className="report-pill-row">
        <ResultPill label="속도" value={userReportPace(report)} />
        <ResultPill label="침묵" value={userReportSilence(report)} />
        <ResultPill label="대본 전달" value={userReportDelivery(report)} />
      </div>

      <div className="detail-score-grid">
        <ScoreDetail label="평균 속도" value={`${report.pace?.syllables_per_second ?? 0} 음절/초`} hint="목표 5.6-6.3" />
        <ScoreDetail label="최장 침묵" value={`${report.silence?.longest_seconds ?? 0}초`} hint="5초 이상이면 위험" />
        <ScoreDetail label="휴지 비율" value={`${report.silence?.pause_ratio_percent ?? 0}%`} hint="권장 약 15%" />
        <ScoreDetail label="키워드 반영" value={`${keywordFeedback.coverage_percent ?? report.delivery_match?.similarity_percent ?? 0}%`} hint="대본 핵심어 기준" />
      </div>

      {presentationMaterial ? (
        <section className="material-analysis-card">
          <div className="section-heading">
            <h3>발표 자료 분석</h3>
            <span>{presentationMaterial.overall_score ?? 0}점</span>
          </div>
          <div className="detail-score-grid material-grid">
            <ScoreDetail label="예상 발표 시간" value={`${presentationMaterial.estimated_minutes ?? 0}분`} hint="대본과 자료를 함께 기준으로 계산합니다." />
            <ScoreDetail label="시인성" value={`${presentationMaterial.clarity_score ?? 0}/100`} hint="글자 크기와 밀도를 봅니다." />
            <ScoreDetail label="통일성" value={`${presentationMaterial.consistency_score ?? 0}/100`} hint="슬라이드 간 표현 흐름을 봅니다." />
            <ScoreDetail label="주제 적합도" value={`${presentationMaterial.topic_fit_score ?? 0}/100`} hint="대본과 자료의 핵심 주제가 얼마나 맞는지 봅니다." />
          </div>
          <p className="material-summary">{presentationMaterial.summary}</p>
          {presentationMaterial.notes?.length ? (
            <ul className="material-notes">
              {presentationMaterial.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          {presentationMaterial.files?.length ? (
            <div className="material-file-cards">
              {presentationMaterial.files.map((file) => (
                <article className="material-file-card" key={file.filename}>
                  <strong>{file.filename}</strong>
                  <p>{file.summary || "업로드한 발표 자료 분석을 완료했습니다."}</p>
                  <div className="material-file-meta">
                    <span>{String(file.kind || "file").toUpperCase()}</span>
                    <span>{file.page_count || file.slide_count || 0}장</span>
                    <span>{file.overall_score ?? 0}/100</span>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
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
        <FeedbackList title="잘한 점" items={(report.strengths || []).slice(0, 4)} />
        <FeedbackList title="우선 고칠 점" items={priorityFeedback.slice(0, 5)} />
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
          <h3>대본 핵심어 반영</h3>
          <p>말한 내용에서 확인된 핵심어와 빠진 핵심어입니다.</p>
          <KeywordGroup title="반영됨" items={keywordFeedback.covered_keywords || []} />
          <KeywordGroup title="빠짐" items={keywordFeedback.missed_keywords || []} emptyText="크게 빠진 핵심어가 없습니다." />
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
  if (ratio >= 25) return "많음";
  if (ratio >= 10 && ratio <= 20) return "좋음";
  return "보통";
}

function userReportDelivery(report) {
  const match = report.delivery_match?.similarity_percent ?? 0;
  if (match >= 70) return "잘 맞음";
  if (match >= 40) return "핵심 유지";
  return "더 맞추기";
}

function buildQuickSummary(report) {
  const pace = userReportPace(report);
  const silence = userReportSilence(report);
  const delivery = userReportDelivery(report);
  return `속도는 ${pace}, 침묵은 ${silence} 수준이고 대본 전달은 ${delivery} 상태입니다.`;
}

export default App;
