import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Play,
  RefreshCcw,
  Send,
  Square,
  Upload,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8010";

const audience = [
  { name: "민서", color: "coral", accessory: "clip" },
  { name: "준", color: "mint", accessory: "glasses" },
  { name: "하린", color: "yellow", accessory: "bow" },
  { name: "도윤", color: "blue", accessory: "headset" },
];

const reactionCopy = {
  attentive: "집중",
  excited: "몰입",
  sleepy: "졸림",
  confused: "혼란",
  tooFast: "빠름",
  tooSlow: "정적",
};

const situationMessages = {
  opening: {
    name: "민서",
    reaction: "attentive",
    text: "좋아요. 차분하게 시작해볼게요.",
    coaching: "첫 문장은 천천히, 핵심 주제를 분명하게 말해보세요.",
  },
  goodPace: {
    name: "하린",
    reaction: "excited",
    text: "지금 흐름 좋아요. 계속 이어가요.",
    coaching: "좋은 속도예요. 지금 리듬을 유지하세요.",
  },
  tooFast: {
    name: "준",
    reaction: "tooFast",
    text: "조금 빨라요. 핵심어가 지나가고 있어요.",
    coaching: "문장 끝에서 짧게 쉬고 다음 문장으로 넘어가세요.",
  },
  tooSlow: {
    name: "도윤",
    reaction: "tooSlow",
    text: "잠깐 멈췄어요. 다음 문장으로 이어가도 좋아요.",
    coaching: "침묵이 생겼어요. 준비한 연결 문장을 사용해보세요.",
  },
  longSilence: {
    name: "민서",
    reaction: "sleepy",
    text: "침묵이 길어지고 있어요.",
    coaching: "긴 침묵은 집중도를 낮춰요. 다음 핵심 문장으로 바로 이어가세요.",
  },
  unclear: {
    name: "준",
    reaction: "confused",
    text: "목소리는 들리는데 문장이 잘 안 잡혀요.",
    coaching: "조금 더 또박또박 말하면 인식과 전달력이 좋아져요.",
  },
  offScript: {
    name: "하린",
    reaction: "confused",
    text: "주제가 살짝 흐려졌어요.",
    coaching: "대본의 핵심 키워드로 다시 돌아와 보세요.",
  },
};

function tokenCount(text) {
  return (text.toLowerCase().match(/[가-힣a-z0-9']+/g) || []).length;
}

function syllableCount(text) {
  const hangul = text.match(/[가-힣]/g) || [];
  const latinWords = text.match(/[a-z0-9']+/gi) || [];
  return hangul.length + latinWords.reduce((total, word) => total + Math.max(1, Math.round(word.length / 3)), 0);
}

function scriptOverlap(script, transcript) {
  const scriptTokens = new Set(script.toLowerCase().match(/[가-힣a-z0-9']+/g) || []);
  const spokenTokens = new Set(transcript.toLowerCase().match(/[가-힣a-z0-9']+/g) || []);
  if (!scriptTokens.size) return 0;
  let hits = 0;
  scriptTokens.forEach((token) => {
    if (spokenTokens.has(token)) hits += 1;
  });
  return hits / scriptTokens.size;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function getSituation({ elapsed, wordsPerMinute, syllablesPerSecond, silenceStreak, voiceActive, secondsSinceRecognized, overlap }) {
  if (elapsed < 5) return "opening";
  if (silenceStreak >= 8) return "longSilence";
  if (silenceStreak >= 3) return "tooSlow";
  if (voiceActive && secondsSinceRecognized > 3) return "unclear";
  if (syllablesPerSecond > 7 || wordsPerMinute > 175) return "tooFast";
  if (elapsed > 20 && overlap < 0.12) return "offScript";
  if (syllablesPerSecond >= 5.6 && syllablesPerSecond <= 6.3) return "goodPace";
  return "opening";
}

function reactionFromSituation(situation) {
  return situationMessages[situation]?.reaction || "attentive";
}

function userPaceLabel(syllablesPerSecond) {
  if (!syllablesPerSecond) return "측정 중";
  if (syllablesPerSecond < 5) return "조금 느림";
  if (syllablesPerSecond > 7) return "조금 빠름";
  return "좋은 속도";
}

function userSilenceLabel(pauseRatio, silenceStreak) {
  if (silenceStreak >= 8) return "침묵 길어짐";
  if (pauseRatio >= 0.25) return "쉬는 시간이 많음";
  return "안정적";
}

function userDeliveryLabel(overlap) {
  if (overlap >= 0.55) return "대본 반영 좋음";
  if (overlap >= 0.25) return "핵심 유지 중";
  return "핵심어 부족";
}

function App() {
  const [page, setPage] = useState("setup");
  const [script, setScript] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [isPresenting, setIsPresenting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
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
  const [aiStatus, setAiStatus] = useState(null);
  const [recognitionStatus, setRecognitionStatus] = useState("대기 중");
  const [error, setError] = useState("");

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

  const startPresentation = async () => {
    setError("");
    setReport(null);
    if (script.trim().length < 10) {
      setError("대본을 조금 더 입력해 주세요.");
      return;
    }

    setIsStarting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      if (!response.ok) throw new Error("세션을 시작하지 못했습니다.");
      const data = await response.json();
      setSessionId(data.session_id);
      sessionIdRef.current = data.session_id;
      setScriptFeedback(data.script_feedback);
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
    } catch (err) {
      cleanupRecording();
      setPage("setup");
      setIsPresenting(false);
      isPresentingRef.current = false;
      setError(err.message || "시작 중 문제가 생겼습니다.");
    } finally {
      setIsStarting(false);
    }
  };

  const importScriptFile = (file) => {
    if (!file) return;
    setError("");
    if (file.size > 1024 * 1024 * 2) {
      setError("2MB 이하의 텍스트 파일만 불러올 수 있습니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "").trim();
      if (!text) {
        setError("파일에서 읽을 수 있는 대본 내용을 찾지 못했습니다.");
        return;
      }
      setScript(text);
    };
    reader.onerror = () => {
      setError("파일을 읽지 못했습니다. txt 또는 md 파일로 다시 시도해 주세요.");
    };
    reader.readAsText(file, "UTF-8");
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
            isStarting={isStarting}
            importScriptFile={importScriptFile}
            script={script}
            setScript={setScript}
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
            overlap={overlap}
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
            scriptFeedback={scriptFeedback}
            spokenWords={spokenWords}
          />
        )}
      </section>
    </main>
  );
}

function SetupPage({ aiStatus, error, importScriptFile, isStarting, script, setScript, startPresentation }) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const wordCount = tokenCount(script);
  const minutes = Math.max(1, Math.round(wordCount / 120));

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    importScriptFile(event.dataTransfer.files?.[0]);
  };

  return (
    <section className="setup-focus">
      <header className="setup-hero">
        <p className="eyebrow">Presentation Coach</p>
        <h1>대본을 올리면, 리허설이 시작됩니다</h1>
        <p>말의 리듬과 놓친 순간만 선명하게 남깁니다.</p>
      </header>

      {error && <div className="notice">{error}</div>}

      <section className="script-composer">
        <div className="composer-meta">
          <span>{wordCount}개 단어</span>
          <span>예상 {minutes}분</span>
          <span>{aiStatus?.live ? "AI 리포트 연결됨" : "기본 분석 사용"}</span>
        </div>
        <div className="script-panel setup-script dark-script">
          <textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder={"여기에 발표 대본을 붙여넣으세요.\n\n예) 안녕하세요. 오늘은..."}
          />
        </div>

        <div
          className={`file-dropzone ${dragging ? "dragging" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <FileText size={20} />
          <strong>대본 파일을 끌어다 놓거나 선택하세요</strong>
          <span>txt, md 같은 텍스트 파일을 바로 대본으로 불러옵니다.</span>
          <button className="file-button" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={17} />
            파일 추가
          </button>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept=".txt,.md,.text,.csv,.srt"
            onChange={(event) => importScriptFile(event.target.files?.[0])}
          />
        </div>

        <button className="start-button" disabled={isStarting} onClick={startPresentation}>
          {isStarting ? <Loader2 className="spin" size={19} /> : <Play size={19} />}
          발표 시작
        </button>
      </section>
    </section>
  );
}

function PracticePage({
  audience,
  backToSetup,
  chat,
  elapsed,
  error,
  finishPresentation,
  isFinishing,
  liveTranscript,
  overlap,
  paceLabel,
  reaction,
  recognitionStatus,
  script,
  silenceLabel,
  situation,
  transcriptScrollRef,
  voiceActive,
  volume,
  deliveryLabel,
}) {
  const currentMessage = situationMessages[situation] || situationMessages.opening;

  return (
    <>
      <header className="session-header">
        <button className="icon-button ghost" onClick={backToSetup} title="대본으로 돌아가기">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="eyebrow">Live Session</p>
          <h1>발표 연습 중</h1>
        </div>
        <div className="session-time">{formatTime(elapsed)}</div>
        <button className="danger-button" onClick={finishPresentation} disabled={isFinishing}>
          {isFinishing ? <Loader2 className="spin" size={18} /> : <Square size={16} />}
          종료
        </button>
      </header>

      {error && <div className="notice">{error}</div>}

      <div className="practice-layout">
        <section className="stage-card">
          <div className="coach-card">
            <div className={`voice-dot ${voiceActive ? "active" : ""}`} />
            <div>
              <strong>{currentMessage.coaching}</strong>
              <p>{recognitionStatus}</p>
            </div>
          </div>

          <div className="audience-grid practice-audience">
            {audience.map((person, index) => (
              <AudienceTile
                key={person.name}
                person={person}
                reaction={index === 0 ? reaction : softenReaction(reaction, index)}
                active
                volume={volume}
              />
            ))}
          </div>
        </section>

        <aside className="practice-panel">
          <section className="simple-status">
            <h2>현재 상태</h2>
            <StatusItem label="속도" value={paceLabel} />
            <StatusItem label="침묵" value={silenceLabel} />
            <StatusItem label="전달" value={deliveryLabel} />
          </section>

          <section className="chat-card service-chat">
            <div className="panel-heading">
              <h2>관객 반응</h2>
              <Send size={17} />
            </div>
            <div className="chat-list">
              {chat.length === 0 ? (
                <div className="empty-chat">발표가 시작되면 반응이 표시됩니다.</div>
              ) : (
                chat.map((message) => (
                  <div className="chat-row" key={message.id}>
                    <span className={`chat-dot ${message.reaction}`} />
                    <div>
                      <strong>{message.name}</strong>
                      <p>{message.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      <section className="transcript-layout">
        <div className="transcript-strip transcript-log">
          <strong>인식된 발표</strong>
          <div className="scroll-text" ref={transcriptScrollRef}>
            {liveTranscript ? <p>{liveTranscript}</p> : <p className="muted">말을 시작하면 여기에 누적됩니다.</p>}
          </div>
        </div>
        <div className="cue-strip">
          <strong>대본</strong>
          <div className="scroll-text">
            <p>{script}</p>
          </div>
        </div>
      </section>
    </>
  );
}

function ReportPage({ aiStatus, error, report, reset, scriptFeedback, spokenWords }) {
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
      {report ? <Report aiStatus={aiStatus} report={report} scriptFeedback={scriptFeedback} spokenWords={spokenWords} /> : null}
    </>
  );
}

function softenReaction(reaction, index) {
  if (reaction === "tooFast" && index === 2) return "confused";
  if (reaction === "tooSlow" && index === 1) return "sleepy";
  if (reaction === "excited" && index === 3) return "attentive";
  return reaction;
}

function AudienceTile({ person, reaction, active, volume }) {
  return (
    <article className={`audience-tile ${active ? "active" : ""}`}>
      <div className={`avatar ${person.color} ${reaction}`} style={{ "--bob": `${Math.min(volume * 30, 1.6)}px` }}>
        <div className={`accessory ${person.accessory}`} />
        <div className="ear left" />
        <div className="ear right" />
        <div className="face">
          <span className="eye left" />
          <span className="eye right" />
          <span className="mouth" />
          <span className="cheek left" />
          <span className="cheek right" />
        </div>
      </div>
      <div className="audience-info">
        <strong>{person.name}</strong>
        <span>{reactionCopy[reaction]}</span>
      </div>
    </article>
  );
}

function StatusItem({ label, value }) {
  return (
    <div className="status-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Report({ aiStatus, report, scriptFeedback, spokenWords }) {
  const aiLive = Boolean(report.used_gemini);
  const score = report.overall_score ?? 0;
  const quickSummary = buildQuickSummary(report);
  const issueLog = report.issue_log || [];
  const priorityFeedback = report.detailed_feedback?.priority_feedback || report.improvements || [];
  const practicePlan = report.detailed_feedback?.practice_plan || [];
  const keywordFeedback = report.keyword_feedback || {};

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

      <div className="feedback-columns service-feedback">
        <FeedbackList title="잘한 점" items={(report.strengths || []).slice(0, 4)} />
        <FeedbackList title="우선 고칠 점" items={priorityFeedback.slice(0, 5)} />
      </div>

      <section className="issue-section">
        <div className="section-heading">
          <h3>문제 구간 로그</h3>
          <span>{issueLog.length}개 구간</span>
        </div>
        <div className="issue-list">
          {issueLog.map((issue) => (
            <IssueItem key={`${issue.time}-${issue.type}-${issue.title}`} issue={issue} />
          ))}
        </div>
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

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export default App;
