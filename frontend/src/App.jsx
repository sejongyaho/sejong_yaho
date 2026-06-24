import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Clock3,
  FileText,
  Leaf,
  Loader2,
  MessageCircle,
  Mic,
  Play,
  Search,
  RefreshCcw,
  Send,
  Square,
  SquarePlay,
  Upload,
} from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8010";

const audience = [
  { name: "誘쇱꽌", color: "coral", accessory: "clip" },
  { name: "以", color: "mint", accessory: "glasses" },
  { name: "?섎┛", color: "yellow", accessory: "bow" },
  { name: "?꾩쑄", color: "blue", accessory: "headset" },
];

const reactionCopy = {
  attentive: "吏묒쨷",
  excited: "紐곗엯",
  sleepy: "議몃┝",
  confused: "?쇰?",
  tooFast: "鍮좊쫫",
  tooSlow: "?뺤쟻",
};

const situationMessages = {
  opening: {
    name: "誘쇱꽌",
    reaction: "attentive",
    text: "醫뗭븘?? 李⑤텇?섍쾶 ?쒖옉?대낵寃뚯슂.",
    coaching: "泥?臾몄옣? 泥쒖쿇?? ?듭떖 二쇱젣瑜?遺꾨챸?섍쾶 留먰빐蹂댁꽭??",
  },
  goodPace: {
    name: "?섎┛",
    reaction: "excited",
    text: "吏湲??먮쫫 醫뗭븘?? 怨꾩냽 ?댁뼱媛??",
    coaching: "醫뗭? ?띾룄?덉슂. 吏湲?由щ벉???좎??섏꽭??",
  },
  tooFast: {
    name: "以",
    reaction: "tooFast",
    text: "議곌툑 鍮⑤씪?? ?듭떖?닿? 吏?섍?怨??덉뼱??",
    coaching: "臾몄옣 ?앹뿉??吏㏐쾶 ?ш퀬 ?ㅼ쓬 臾몄옣?쇰줈 ?섏뼱媛?몄슂.",
  },
  tooSlow: {
    name: "?꾩쑄",
    reaction: "tooSlow",
    text: "?좉퉸 硫덉톬?댁슂. ?ㅼ쓬 臾몄옣?쇰줈 ?댁뼱媛??醫뗭븘??",
    coaching: "移⑤У???앷꼈?댁슂. 以鍮꾪븳 ?곌껐 臾몄옣???ъ슜?대낫?몄슂.",
  },
  longSilence: {
    name: "誘쇱꽌",
    reaction: "sleepy",
    text: "移⑤У??湲몄뼱吏怨??덉뼱??",
    coaching: "湲?移⑤У? 吏묒쨷?꾨? ??떠?? ?ㅼ쓬 ?듭떖 臾몄옣?쇰줈 諛붾줈 ?댁뼱媛?몄슂.",
  },
  unclear: {
    name: "以",
    reaction: "confused",
    text: "紐⑹냼由щ뒗 ?ㅻ━?붾뜲 臾몄옣???????≫???",
    coaching: "議곌툑 ???먮컯?먮컯 留먰븯硫??몄떇怨??꾨떖?μ씠 醫뗭븘?몄슂.",
  },
  offScript: {
    name: "?섎┛",
    reaction: "confused",
    text: "二쇱젣媛 ?댁쭩 ?먮젮議뚯뼱??",
    coaching: "?蹂몄쓽 ?듭떖 ?ㅼ썙?쒕줈 ?ㅼ떆 ?뚯븘? 蹂댁꽭??",
  },
};

const analysisItems = [
  { label: "留?鍮좊Ⅴ湲?, icon: Mic },
  { label: "移⑤У 援ш컙", icon: Clock3 },
  { label: "?蹂??꾨떖??, icon: BarChart3 },
  { label: "荑좎뀡???ъ슜", icon: MessageCircle },
  { label: "?꾪솚 臾몄옣 ??대컢", icon: Clock3 },
  { label: "留덈Т由?諛??, icon: BarChart3 },
];

function tokenCount(text) {
  return (text.toLowerCase().match(/[媛-?즑-z0-9']+/g) || []).length;
}

function syllableCount(text) {
  const hangul = text.match(/[媛-??/g) || [];
  const latinWords = text.match(/[a-z0-9']+/gi) || [];
  return hangul.length + latinWords.reduce((total, word) => total + Math.max(1, Math.round(word.length / 3)), 0);
}

function scriptOverlap(script, transcript) {
  const scriptTokens = new Set(script.toLowerCase().match(/[媛-?즑-z0-9']+/g) || []);
  const spokenTokens = new Set(transcript.toLowerCase().match(/[媛-?즑-z0-9']+/g) || []);
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
  if (!syllablesPerSecond) return "痢≪젙 以?;
  if (syllablesPerSecond < 5) return "議곌툑 ?먮┝";
  if (syllablesPerSecond > 7) return "議곌툑 鍮좊쫫";
  return "醫뗭? ?띾룄";
}

function userSilenceLabel(pauseRatio, silenceStreak) {
  if (silenceStreak >= 8) return "移⑤У 湲몄뼱吏?;
  if (pauseRatio >= 0.25) return "?щ뒗 ?쒓컙??留롮쓬";
  return "?덉젙??;
}

function userDeliveryLabel(overlap) {
  if (overlap >= 0.55) return "?蹂?諛섏쁺 醫뗭쓬";
  if (overlap >= 0.25) return "?듭떖 ?좎? 以?;
  return "?듭떖??遺議?;
}

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
  const [referenceVideo, setReferenceVideo] = useState(null);
  const [referenceVideoUrl, setReferenceVideoUrl] = useState("");
  const [aiStatus, setAiStatus] = useState(null);
  const [isLoadingReference, setIsLoadingReference] = useState(false);
  const [recognitionStatus, setRecognitionStatus] = useState("?湲?以?);
  const [error, setError] = useState("");
  const [materialFiles, setMaterialFiles] = useState([]);

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
      if (!response.ok) throw new Error("AI ?곹깭瑜??뺤씤?섏? 紐삵뻽?듬땲??");
      setAiStatus(await response.json());
    } catch (err) {
      setAiStatus({
        configured: false,
        live: false,
        model: "unknown",
        message: err.message || "AI ?곹깭 ?뺤씤 ?ㅽ뙣",
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
      if (!response.ok) throw new Error("YouTube 湲곗? ?곸긽???뺤씤?섏? 紐삵뻽?듬땲??");
      setReferenceVideo(await response.json());
    } catch (err) {
      setReferenceVideo(null);
      setError(err.message || "湲곗? ?곸긽??遺덈윭?ㅼ? 紐삵뻽?듬땲??");
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
      setRecognitionStatus("?뚯꽦 ?몄떇 誘몄???);
      setError("??釉뚮씪?곗????뚯꽦 ?몄떇??吏?먰븯吏 ?딆븘?? ?몄떇?섏? ?딅뒗 援ш컙? 移⑤У?쇰줈 怨꾩궛?⑸땲??");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setRecognitionStatus("?ｋ뒗 以?);
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
        setRecognitionStatus("?몄떇 以?);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech") {
        setRecognitionStatus("留먯냼由??湲?);
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("留덉씠???먮뒗 ?뚯꽦 ?몄떇 沅뚰븳???꾩슂?⑸땲?? 釉뚮씪?곗? 沅뚰븳???덉슜??二쇱꽭??");
        setRecognitionStatus("沅뚰븳 ?꾩슂");
        return;
      }
      setRecognitionStatus(`?뚯꽦 ?몄떇 ?곹깭: ${event.error}`);
    };

    recognition.onend = () => {
      if (!isPresentingRef.current) return;
      setRecognitionStatus("?ㅼ떆 ?곌껐 以?);
      window.setTimeout(() => {
        if (!isPresentingRef.current) return;
        try {
          recognition.start();
        } catch {
          setRecognitionStatus("留먯냼由??湲?);
        }
      }, 250);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setRecognitionStatus("?뚯꽦 ?몄떇 ?쒖옉 ?ㅽ뙣");
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
      setError("?蹂몄쓣 議곌툑 ???낅젰??二쇱꽭??");
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
      const response = await fetch(API_BASE_URL + "/api/session/start", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("?몄뀡???쒖옉?섏? 紐삵뻽?듬땲??");
      const data = await response.json();
      setSessionId(data.session_id);
      sessionIdRef.current = data.session_id;
      setScriptFeedback(data.script_feedback);
      setMaterialFeedback(data.presentation_material || null);
      setReferenceVideo(data.reference_video || null);
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
      setRecognitionStatus("留덉씠??以鍮?以?);
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
        setRecognitionStatus("留덉씠??沅뚰븳 ?꾩슂");
        setError("留덉씠??沅뚰븳 ?먮뒗 ?ㅻ뵒???μ튂瑜??뺤씤?????ㅼ떆 ?쒕룄??二쇱꽭??");
      }

      metricIntervalRef.current = window.setInterval(() => {
        postMetric().catch(() => {
          setError("?ㅻ뵒??遺꾩꽍 ?꾩넚 以?臾몄젣媛 ?앷꼈?듬땲?? 怨꾩냽 吏꾪뻾?⑸땲??");
        });
      }, 3000);
    } catch (err) {
      cleanupRecording();
      setPage("setup");
      setIsPresenting(false);
      isPresentingRef.current = false;
      setError(err.message || "?쒖옉 以?臾몄젣媛 ?앷꼈?듬땲??");
    } finally {
      setIsStarting(false);
    }
  };

  const importScriptFile = async (file) => {
    if (!file) return;
    setError("");
    if (file.size > 1024 * 1024 * 10) {
      setError("10MB ?댄븯???뚯씪留?遺덈윭?????덉뒿?덈떎.");
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
      if (!response.ok) throw new Error(data.detail || "?뚯씪???쎌? 紐삵뻽?듬땲??");
      setScript(data.text);
    } catch (err) {
      setError(err.message || "?뚯씪???쎌? 紐삵뻽?듬땲?? txt, md, pdf, docx, pptx ?뚯씪濡??ㅼ떆 ?쒕룄??二쇱꽭??");
    } finally {
      setIsImporting(false);
    }
  };

  const importPresentationFiles = (files) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const allowedExtensions = new Set(["pdf", "pptx"]);
    const maxFileSize = 20 * 1024 * 1024;
    const filtered = [];

    for (const file of selected) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!allowedExtensions.has(extension || "")) {
        setError("諛쒗몴 ?먮즺??PDF ?먮뒗 PPTX留??щ┫ ???덉뒿?덈떎.");
        return;
      }
      if (file.size > maxFileSize) {
        setError('"' + file.name + '" ?뚯씪? 20MB瑜?珥덇낵?⑸땲??');
        return;
      }
      filtered.push(file);
    }

    setError("");
    setMaterialFiles(filtered);
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
      if (!response.ok) throw new Error("由ы룷?몃? 留뚮뱾吏 紐삵뻽?듬땲??");
      setReport(await response.json());
      refreshAiStatus();
      setPage("report");
    } catch (err) {
      setError(err.message || "醫낅즺 以?臾몄젣媛 ?앷꼈?듬땲??");
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
      setRecognitionStatus("留덉씠??以鍮?以?);
    setError("");
    setMaterialFiles([]);
    setMaterialFeedback(null);
    setReferenceVideo(null);
    setReferenceVideoUrl("");
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
            importScriptFile={importScriptFile}
            applyReferenceVideo={applyReferenceVideo}
            importPresentationFiles={importPresentationFiles}
            materialFiles={materialFiles}
            isLoadingReference={isLoadingReference}
            referenceVideo={referenceVideo}
            referenceVideoUrl={referenceVideoUrl}
            setReferenceVideoUrl={setReferenceVideoUrl}
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
  importScriptFile,
  importPresentationFiles,
  isImporting,
  isStarting,
  isLoadingReference,
  applyReferenceVideo,
  referenceVideo,
  referenceVideoUrl,
  materialFiles,
  script,
  setReferenceVideoUrl,
  setScript,
  startPresentation,
}) {
  const [dragging, setDragging] = useState(false);
  const [materialDragging, setMaterialDragging] = useState(false);
  const scriptFileInputRef = useRef(null);
  const materialFileInputRef = useRef(null);
  const wordCount = tokenCount(script);
  const estimatedMinutes = Math.max(1, Math.round(wordCount / 120));
  const keywordEstimate = wordCount ? Math.min(12, Math.max(1, Math.round(wordCount / 18))) : 0;

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    importScriptFile(event.dataTransfer.files?.[0]);
  };

  const handleMaterialDrop = (event) => {
    event.preventDefault();
    setMaterialDragging(false);
    importPresentationFiles(event.dataTransfer.files);
  };

  return (
    <section className="setup-focus">
      <header className="setup-hero">
        <p className="eyebrow">Presentation Coach</p>
        <h1>발표를 시작하기 전에 대본과 자료를 정리해 보세요.</h1>
        <p>대본과 발표 자료를 함께 올리면 예상 시간, 시인성, 통일성, 주제 적합도를 같이 확인합니다.</p>
      </header>

      {error && <div className="notice">{error}</div>}

      <section className="script-composer">
        <div className="composer-meta">
          <span>{wordCount}단어</span>
          <span>약 {estimatedMinutes}분</span>
          <span>{aiStatus?.live ? 'AI 분석 사용 중' : '로컬 분석'}</span>
          <span>{materialFiles.length ? `자료 ${materialFiles.length}개 선택됨` : 'PDF/PPTX 선택 가능'}</span>
          <span>{keywordEstimate ? `핵심 ${keywordEstimate}개 예상` : '대본을 입력해 주세요'}</span>
        </div>

        <div
          className={`file-dropzone inline ${dragging ? 'dragging' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <FileText size={20} />
          <strong>대본 파일을 끌어오거나 선택해 주세요</strong>
          <span>txt, md 같은 텍스트 파일과 pdf, docx, pptx 파일에서 바로 대본을 불러올 수 있습니다.</span>
          <button className="file-button" type="button" disabled={isImporting} onClick={() => scriptFileInputRef.current?.click()}>
            {isImporting ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
            {isImporting ? '불러오는 중' : '파일 불러오기'}
          </button>
          <input
            ref={scriptFileInputRef}
            hidden
            type="file"
            accept=".txt,.md,.markdown,.text,.csv,.srt,.pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={(event) => {
              importScriptFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
      </section>

      <section className="setup-grid">
        <aside className="hero-dashboard setup-dashboard" aria-label="리허설 프리뷰">
          <div className="dashboard-topline">
            <span>session brief</span>
            <strong>{wordCount || 0} words</strong>
          </div>
          <div className="preview-metrics">
            <div className="preview-card raised">
              <Clock3 size={18} />
              <span>예상 시간</span>
              <strong>{estimatedMinutes}<small>분</small></strong>
            </div>
            <div className="preview-card">
              <BarChart3 size={18} />
              <span>분석 기준</span>
              <strong>{analysisItems.length}<small>개</small></strong>
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
              <strong>{keywordEstimate ? `핵심어 ${keywordEstimate}개 예상` : '대본을 입력해 주세요'}</strong>
            </div>
            <p className="brief-copy">문장 앞부분이 뚜렷할수록 발표 흐름을 더 잘 잡을 수 있습니다. 다음 단계에서 자료와 실제 발표를 함께 점검합니다.</p>
          </div>
        </aside>

        <aside className="ready-panel" id="insight">
          <div className="service-checklist">
            <h2>분석 포인트</h2>
            <p>발표를 시작하기 전에, 대본과 자료에서 미리 확인할 핵심 기준을 정리합니다.</p>
            {analysisItems.map(({ icon: Icon, label }) => (
              <span key={label}><Icon size={15} />{label}</span>
            ))}
          </div>
        </aside>
      </section>

      <div className="material-analysis-card">
        <div className="section-heading">
          <h3>발표 자료(PDF, PPTX)</h3>
          <span>시인성 · 통일성 · 주제 적합도</span>
        </div>
        <div
          className={`file-dropzone ${materialDragging ? 'dragging' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setMaterialDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setMaterialDragging(false)}
          onDrop={handleMaterialDrop}
        >
          <Upload size={20} />
          <strong>발표 자료를 올려 주세요</strong>
          <span>대본과 함께 분석해서 발표 예상 시간과 자료의 흐름을 같이 봅니다.</span>
          <button className="file-button" type="button" onClick={() => materialFileInputRef.current?.click()}>
            <Upload size={17} />
            자료 선택
          </button>
          <input
            ref={materialFileInputRef}
            hidden
            type="file"
            accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            multiple
            onChange={(event) => importPresentationFiles(event.target.files)}
          />
          {materialFiles.length > 0 ? (
            <div className="material-file-list">
              {materialFiles.map((file) => (
                <span key={file.name}>{file.name}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="reference-link-panel">
        <div className="reference-link-copy">
          <span>Reference model</span>
          <strong>비교할 기준 영상</strong>
          <p>닮고 싶은 YouTube 발표 영상이 있으면 넣어두세요. 발표 톤과 말하기 기준을 함께 비교할 수 있습니다.</p>
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
              aria-label="YouTube reference link"
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
                  <span>{referenceVideo.reference_profile ? `기준 영상의 말하기 속도는 초당 ${referenceVideo.reference_profile.syllables_per_second}음절입니다.` : '기준 영상은 기본 정보만 먼저 보여줍니다.'}</span>
                </div>
              </div>
              <ReferenceQuickAnalysis referenceVideo={referenceVideo} />
            </>
          ) : (
            <p>URL을 넣고 분석하면 말하기 속도, 화법, 쉬는 타이밍, 강조 방식을 간단히 보여줍니다.</p>
          )}
        </div>
      </div>

      <button className="start-button" disabled={isStarting} onClick={startPresentation}>
        {isStarting ? <Loader2 className="spin" size={19} /> : <Play size={19} />}
        발표 시작
      </button>
    </section>
  );
}

function ReferenceQuickAnalysis({ referenceVideo }) {
  const profile = referenceVideo?.reference_profile || {};
  const targets = referenceVideo?.benchmark_targets || {};
  const items = [
    {
      label: "留먰븯湲??띾룄",
      value: profile.speech_rate_summary || targets.speech_rate || "?곸긽 ?뚯꽦 湲곗??쇰줈 ?띾룄瑜?遺꾩꽍?⑸땲??",
    },
    {
      label: "?붾쾿",
      value: profile.speaking_style || profile.tone || targets.speaking_style || "?ㅻ챸 諛⑹떇怨?留먰닾 ?먮쫫??遺꾩꽍?⑸땲??",
    },
    {
      label: "?щ뒗 ??대컢",
      value: profile.pause_timing_summary || targets.pause_timing || "以묒슂??臾몄옣 ???щ뒗 ??대컢??遺꾩꽍?⑸땲??",
    },
    {
      label: "媛뺤“ 諛⑹떇",
      value: profile.emphasis_summary || targets.emphasis || "?듭떖?대? ?대뼸寃?媛뺤“?섎뒗吏 遺꾩꽍?⑸땲??",
    },
  ];

  return (
    <div className="reference-analysis-grid">
      {items.map((item) => (
        <div className="reference-analysis-item" key={item.label}>
          <span>{item.label}</span>
          <p>{item.value}</p>
        </div>
      ))}
    </div>
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
        <button className="icon-button ghost" onClick={backToSetup} title="?蹂몄쑝濡??뚯븘媛湲?>
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="eyebrow">Live Session</p>
          <h1>諛쒗몴 ?곗뒿 以?/h1>
        </div>
        <div className="session-time">{formatTime(elapsed)}</div>
        <button className="danger-button" onClick={finishPresentation} disabled={isFinishing}>
          {isFinishing ? <Loader2 className="spin" size={18} /> : <Square size={16} />}
          {isFinishing ? "諛쒗몴 ?뺣━ 以? : "醫낅즺"}
        </button>
      </header>

      {error && <div className="notice">{error}</div>}
      {isFinishing ? (
        <div className="notice loading-banner">
          <Loader2 className="spin" size={16} />
          <span>諛쒗몴 ?뺣━ 以묒엯?덈떎. ?뱀쓬蹂멸낵 ?蹂몄쓣 遺꾩꽍?섍퀬 ?덉뼱?? ?좎떆留?湲곕떎??二쇱꽭??</span>
        </div>
      ) : null}

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
            <h2>?꾩옱 ?곹깭</h2>
            <StatusItem label="?띾룄" value={paceLabel} />
            <StatusItem label="移⑤У" value={silenceLabel} />
            <StatusItem label="?꾨떖" value={deliveryLabel} />
          </section>

          <section className="chat-card service-chat">
            <div className="panel-heading">
              <h2>愿媛?諛섏쓳</h2>
              <Send size={17} />
            </div>
            <div className="chat-list">
              {chat.length === 0 ? (
                <div className="empty-chat">諛쒗몴媛 ?쒖옉?섎㈃ 諛섏쓳???쒖떆?⑸땲??</div>
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
          <strong>?몄떇??諛쒗몴</strong>
          <div className="scroll-text" ref={transcriptScrollRef}>
            {liveTranscript ? <p>{liveTranscript}</p> : <p className="muted">留먯쓣 ?쒖옉?섎㈃ ?ш린???꾩쟻?⑸땲??</p>}
          </div>
        </div>
        <div className="cue-strip">
          <strong>?蹂?/strong>
          <div className="scroll-text">
            <p>{script}</p>
          </div>
        </div>
      </section>
    </>
  );
}

function ReportPage({ aiStatus, error, report, reset, materialFeedback, scriptFeedback, spokenWords }) {
  return (
    <>
      <header className="product-header compact">
        <div>
          <p className="eyebrow">Report</p>
          <h1>諛쒗몴 由ы룷??/h1>
        </div>
        <button className="primary-button" onClick={reset}>
          <RefreshCcw size={18} />
          ?ㅼ떆 ?곗뒿
        </button>
      </header>

      {error && <div className="notice">{error}</div>}
      {report ? <Report aiStatus={aiStatus} report={report} scriptFeedback={scriptFeedback} materialFeedback={materialFeedback} spokenWords={spokenWords} /> : null}
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

function Report({ aiStatus, report, scriptFeedback, materialFeedback, spokenWords }) {
  const aiLive = Boolean(report.used_gemini);
  const score = report.overall_score ?? 0;
  const quickSummary = buildQuickSummary(report);
  const issueLog = report.issue_log || [];
  const priorityFeedback = report.detailed_feedback?.priority_feedback || report.improvements || [];
  const practicePlan = report.detailed_feedback?.practice_plan || [];
  const keywordFeedback = report.keyword_feedback || {};
  const presentationMaterial = report.presentation_material || materialFeedback || null;

  return (
    <section className="report-panel service-report">
      <div className="report-summary-card">
        <div>
          <p className="eyebrow">{aiLive ? "AI 肄붿묶" : "湲곕낯 肄붿묶"}</p>
          <h2>{score >= 80 ? "?꾨떖???꾩＜ 醫뗭뒿?덈떎" : score >= 60 ? "臾대궃?섏?留???醫뗭븘吏????덉뒿?덈떎" : "議곌툑 ???곗뒿???꾩슂?⑸땲??}</h2>
          <p>{quickSummary}</p>
          <p className="report-summary-detail">{report.summary}</p>
        </div>
        <div className="service-score">
          <strong>{score}</strong>
          <span>/100</span>
        </div>
      </div>

      <div className="report-pill-row">
        <ResultPill label="?띾룄" value={userReportPace(report)} />
        <ResultPill label="移⑤У" value={userReportSilence(report)} />
        <ResultPill label="?蹂??쇱튂" value={userReportDelivery(report)} />
      </div>

      <div className="detail-score-grid">
        <ScoreDetail label="留먰븯湲??띾룄" value={`${report.pace?.syllables_per_second ?? 0} ?뚯젅/珥?} hint="沅뚯옣 踰붿쐞 5.6~6.3" />
        <ScoreDetail label="媛??湲?移⑤У" value={`${report.silence?.longest_seconds ?? 0}珥?} hint="5珥??댁긽?대㈃ ?꾪뿕?⑸땲?? />
        <ScoreDetail label="??鍮꾩쑉" value={`${report.silence?.pause_ratio_percent ?? 0}%`} hint="15% ?덊뙉???댁긽?곸엯?덈떎" />
        <ScoreDetail label="?蹂??쇱튂?? value={`${keywordFeedback.coverage_percent ?? report.delivery_match?.similarity_percent ?? 0}%`} hint="諛쒗몴 媛쒖슂? ?쇰쭏??留욌뒗吏 遊낅땲?? />
      </div>

      {presentationMaterial ? (
        <section className="material-analysis-card">
          <div className="section-heading">
            <h3>諛쒗몴 ?먮즺</h3>
            <span>{presentationMaterial.overall_score ?? 0}/100</span>
          </div>
          <div className="detail-score-grid material-grid">
            <ScoreDetail label="?덉긽 ?쒓컙" value={`${presentationMaterial.estimated_minutes ?? 0}遺?} hint="?蹂멸낵 ?먮즺瑜??④퍡 諛섏쁺?⑸땲?? />
            <ScoreDetail label="?쒖씤?? value={`${presentationMaterial.clarity_score ?? 0}/100`} hint="湲???ш린? 諛?꾨? 遊낅땲?? />
            <ScoreDetail label="?듭씪?? value={`${presentationMaterial.consistency_score ?? 0}/100`} hint="?щ씪?대뱶 媛??먮쫫??遊낅땲?? />
            <ScoreDetail label="二쇱젣 ?곹빀?? value={`${presentationMaterial.topic_fit_score ?? 0}/100`} hint="?蹂멸낵 ?ㅼ썙?쒓? ?쇰쭏??留욌뒗吏 遊낅땲?? />
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
                  <p>{file.summary || "?낅줈?쒗븳 ?먮즺 遺꾩꽍???꾨즺?섏뿀?듬땲??"}</p>
                  <div className="material-file-meta">
                    <span>{String(file.kind || "file").toUpperCase()}</span>
                    <span>{file.page_count || file.slide_count || 0}履??щ씪?대뱶</span>
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
            <h3>湲곗? ?곸긽</h3>
            <span>{report.reference_video.author_name || "YouTube"}</span>
          </div>
          <div className="reference-card">
            <img src={report.reference_video.thumbnail_url} alt="" />
            <div>
              <strong>{report.reference_video.title || `YouTube ?곸긽 ${report.reference_video.video_id}`}</strong>
              <span>{report.reference_video.analysis_note}</span>
            </div>
          </div>
          {report.reference_comparison ? (
            <div className="reference-analysis-grid">
              <div className="reference-analysis-item">
                <span>鍮꾧탳 湲곗?</span>
                <p>{(report.reference_comparison.targets || []).join(" 쨌 ")}</p>
              </div>
              <div className="reference-analysis-item">
                <span>?댁꽍 硫붾え</span>
                <p>{report.reference_comparison.analysis_note}</p>
              </div>
              <div className="reference-analysis-item">
                <span>愿李??ъ씤??/span>
                <p>{(report.reference_comparison.notes || []).join(" ")}</p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="feedback-columns service-feedback">
        <FeedbackList title="媛뺤젏" items={(report.strengths || []).slice(0, 4)} />
        <FeedbackList title="?곗꽑 ?섏젙" items={priorityFeedback.slice(0, 5)} />
      </div>

      <section className="issue-section">
        <div className="section-heading">
          <h3>臾몄젣 湲곕줉</h3>
          <span>{issueLog.length}媛?/span>
        </div>
        <div className="issue-list">
          {issueLog.map((issue) => (
            <IssueItem key={`${issue.time}-${issue.type}-${issue.title}`} issue={issue} />
          ))}
        </div>
      </section>

      <section className="report-two-column">
        <div className="keyword-card">
          <h3>?蹂??쇱튂</h3>
          <p>???ㅼ썙?쒕뱾? 諛쒗몴媛 以鍮꾪븳 ?蹂멸낵 ?쇰쭏??留욎븯?붿? 蹂댁뿬 以띾땲??</p>
          <KeywordGroup title="?ы븿?? items={keywordFeedback.covered_keywords || []} />
          <KeywordGroup title="鍮좎쭚" items={keywordFeedback.missed_keywords || []} emptyText="????ぉ? 鍮좎?吏 ?딆븯?듬땲??" />
        </div>
        <div className="practice-plan-card">
          <h3>?ㅼ쓬 ?곗뒿</h3>
          <ol>
            {practicePlan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </section>

      {report.reference_comparison ? (
        <div className="reference-report">
          <h3>湲곗? 諛쒗몴 ?곸긽 鍮꾧탳</h3>
          <strong>
            {report.reference_comparison.title} 쨌 {report.reference_comparison.author_name}
          </strong>
          <div className="reference-targets">
            {(report.reference_comparison.targets || ["留먰븯湲??띾룄", "?붾쾿", "?щ뒗 ??대컢", "媛뺤“ 諛⑹떇"]).map((target) => (
              <span key={target}>{target}</span>
            ))}
          </div>
          {report.reference_comparison.reference_profile ? (
            <p>
              湲곗? ?뚯꽦: 珥덈떦 {report.reference_comparison.reference_profile.syllables_per_second}?뚯젅 쨌 臾몄옣???됯퇏{" "}
              {report.reference_comparison.reference_profile.average_sentence_words}?⑥뼱
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
        {aiLive ? "??由ы룷?몃뒗 AI 遺꾩꽍???ъ슜?⑸땲??" : "AI瑜??ъ슜?????놁뼱 濡쒖뺄 洹쒖튃?쇰줈 遺꾩꽍?덉뒿?덈떎."}
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

function KeywordGroup({ emptyText = "?쒖떆???ㅼ썙?쒓? ?놁뒿?덈떎.", items, title }) {
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
  if (severity === "high") return "以묒슂";
  if (severity === "medium") return "二쇱쓽";
  return "李멸퀬";
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
  if (sps >= 5.6 && sps <= 6.3) return "醫뗭쓬";
  if (sps > 6.3) return "鍮좊쫫";
  return "?먮┝";
}

function userReportSilence(report) {
  const ratio = report.silence?.pause_ratio_percent ?? 0;
  if (ratio >= 25) return "留롮쓬";
  if (ratio >= 10 && ratio <= 20) return "?곸젙";
  return "蹂댄넻";
}

function userReportDelivery(report) {
  const match = report.delivery_match?.similarity_percent ?? 0;
  if (match >= 70) return "??留욎쓬";
  if (match >= 40) return "遺遺??쇱튂";
  return "??留욎텛湲?;
}

function buildQuickSummary(report) {
  const pace = userReportPace(report);
  const silence = userReportSilence(report);
  const delivery = userReportDelivery(report);
  return `?띾룄??${pace}, 移⑤У? ${silence} ?섏??닿퀬 ?蹂??꾨떖? ${delivery} ?곹깭?낅땲??`;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export default App;
