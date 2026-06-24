import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Square } from "lucide-react";
import { reactionCopy } from "../data/audience";
import { formatTime, reactionForAudience } from "../utils/presentation";
import male1AdmireVideo from "../data/남자1-감탄.mp4";
import male1QuestionVideo from "../data/남자1-의문.mp4";
import male1WakeVideo from "../data/남자1-졸-평.mp4";
import male1FocusVideo from "../data/남자1-집중.mp4";
import male1SleepVideo from "../data/남자1-평-졸.mp4";
import male1IdleVideo from "../data/남자1-평시.mp4";
import male2AdmireVideo from "../data/남자2-감탄.mp4";
import male2QuestionVideo from "../data/남자2-의문.mp4";
import male2SleepVideo from "../data/남자2-졸음.mp4";
import male2IdleVideo from "../data/남자2-평시.mp4";
import female1AdmireVideo from "../data/여자1-감탄.mp4";
import female1QuestionVideo from "../data/여자1-의문.mp4";
import female1WakeVideo from "../data/여자1-졸-평.mp4";
import female1FocusVideo from "../data/여자1-집중.mp4";
import female1SleepVideo from "../data/여자1-평-졸.mp4";
import female1IdleVideo from "../data/여자1-평시.mp4";
import female2AdmireVideo from "../data/여자2-감탄.mp4";
import female2QuestionVideo from "../data/여자2-의문.mp4";
import female2SleepVideo from "../data/여자2-졸음.mp4";
import female2FocusVideo from "../data/여자2-집중.mp4";
import female2IdleVideo from "../data/여자2-평시.mp4";

const videoAudienceAssets = {
  male1: {
    idle: male1IdleVideo,
    sleepIn: male1SleepVideo,
    wake: male1WakeVideo,
    admire: male1AdmireVideo,
    focus: male1FocusVideo,
    question: male1QuestionVideo,
  },
  male2: {
    idle: male2IdleVideo,
    sleepIn: male2SleepVideo,
    wake: male2IdleVideo,
    admire: male2AdmireVideo,
    focus: male2IdleVideo,
    question: male2QuestionVideo,
  },
  female1: {
    idle: female1IdleVideo,
    sleepIn: female1SleepVideo,
    wake: female1WakeVideo,
    admire: female1AdmireVideo,
    focus: female1FocusVideo,
    question: female1QuestionVideo,
  },
  female2: {
    idle: female2IdleVideo,
    sleepIn: female2SleepVideo,
    wake: female2IdleVideo,
    admire: female2AdmireVideo,
    focus: female2FocusVideo,
    question: female2QuestionVideo,
  },
};

const VIDEO_ACTION_MIN_INTERVAL_MS = 3800;

function visualMood(reaction) {
  if (reaction === "excited") return "focused";
  if (reaction === "sleepy" || reaction === "tooSlow") return "bored";
  if (reaction === "confused" || reaction === "tooFast") return "confused";
  return "normal";
}

function facePath(face) {
  if (face === "square") return "M62 42 Q100 25 138 42 Q151 59 150 101 Q147 137 124 153 Q100 169 76 153 Q53 137 50 101 Q49 59 62 42Z";
  if (face === "heart") return "M58 45 Q100 20 142 45 Q153 65 149 103 Q145 136 118 157 Q100 170 82 157 Q55 136 51 103 Q47 65 58 45Z";
  if (face === "oval") return "M66 38 Q100 23 134 38 Q151 58 150 101 Q148 140 122 160 Q100 174 78 160 Q52 140 50 101 Q49 58 66 38Z";
  return "M61 41 Q100 22 139 41 Q153 60 150 101 Q147 139 121 158 Q100 170 79 158 Q53 139 50 101 Q47 60 61 41Z";
}

function FaceExpression({ mood }) {
  if (mood === "focused") {
    return (
      <>
        <path d="M69 99 Q77 90 85 99" fill="none" stroke="#292d37" strokeWidth="5" strokeLinecap="round" />
        <path d="M113 99 Q121 90 129 99" fill="none" stroke="#292d37" strokeWidth="5" strokeLinecap="round" />
        <path d="M68 80 Q77 72 87 78" fill="none" stroke="#3b2d2c" strokeWidth="4" strokeLinecap="round" />
        <path d="M111 78 Q121 71 131 77" fill="none" stroke="#3b2d2c" strokeWidth="4" strokeLinecap="round" />
        <path d="M85 125 Q99 139 115 124" fill="none" stroke="#a74e56" strokeWidth="5" strokeLinecap="round" />
        <path d="M89 127 Q100 133 111 126" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity=".75" />
      </>
    );
  }

  if (mood === "bored") {
    return (
      <>
        <path d="M67 97 Q77 101 87 97" fill="none" stroke="#292d37" strokeWidth="5" strokeLinecap="round" />
        <path d="M111 97 Q121 101 131 97" fill="none" stroke="#292d37" strokeWidth="5" strokeLinecap="round" />
        <path d="M67 81 Q77 84 87 82" fill="none" stroke="#3b2d2c" strokeWidth="4" strokeLinecap="round" />
        <path d="M111 82 Q121 84 131 81" fill="none" stroke="#3b2d2c" strokeWidth="4" strokeLinecap="round" />
        <path d="M90 130 Q100 123 110 130" fill="none" stroke="#a74e56" strokeWidth="4.5" strokeLinecap="round" />
        <text x="145" y="75" fontSize="21" fontWeight="800" fill="#9aa4b4">z</text>
        <text x="158" y="60" fontSize="15" fontWeight="800" fill="#b1b8c5">z</text>
      </>
    );
  }

  if (mood === "confused") {
    return (
      <>
        <ellipse cx="78" cy="97" rx="8" ry="9.5" fill="#292d37" />
        <ellipse cx="122" cy="97" rx="5.8" ry="7.5" fill="#292d37" />
        <circle cx="75" cy="94" r="2.4" fill="#fff" />
        <circle cx="120" cy="95" r="1.9" fill="#fff" />
        <path d="M67 80 Q77 71 87 77" fill="none" stroke="#3b2d2c" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M111 83 Q121 88 132 80" fill="none" stroke="#3b2d2c" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M93 124 Q100 118 108 125 Q101 134 93 124" fill="none" stroke="#a74e56" strokeWidth="4" strokeLinecap="round" />
        <text x="146" y="70" fontSize="25" fontWeight="900" fill="#ff8d5f">?</text>
      </>
    );
  }

  return (
    <>
      <ellipse cx="78" cy="97" rx="6.6" ry="8.2" fill="#292d37" />
      <ellipse cx="122" cy="97" rx="6.6" ry="8.2" fill="#292d37" />
      <circle cx="75.6" cy="94" r="2.1" fill="#fff" />
      <circle cx="119.6" cy="94" r="2.1" fill="#fff" />
      <path d="M68 80 Q78 76 87 80" fill="none" stroke="#3b2d2c" strokeWidth="4" strokeLinecap="round" />
      <path d="M112 80 Q122 76 131 80" fill="none" stroke="#3b2d2c" strokeWidth="4" strokeLinecap="round" />
      <path d="M90 125 Q100 131 110 125" fill="none" stroke="#a74e56" strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function Hair({ person, id }) {
  const [base] = person.hair;
  if (person.style === "long") {
    return (
      <>
        <path d="M50 88 Q43 31 99 23 Q157 28 150 91 L145 158 Q132 179 117 158 L125 63 Q100 43 69 65 L77 159 Q59 177 47 155 Z" fill={`url(#hair${id})`} />
        <path d="M58 57 Q83 24 126 39 Q144 47 151 77 Q126 59 104 54 Q80 49 58 76Z" fill={base} />
        <path d="M64 61 Q89 36 119 45" fill="none" stroke="#fff" strokeOpacity=".17" strokeWidth="7" strokeLinecap="round" />
      </>
    );
  }

  if (person.style === "bob") {
    return (
      <>
        <path d="M48 84 Q48 31 99 24 Q151 29 151 87 L147 145 Q137 163 123 151 L126 68 Q100 46 69 66 L73 151 Q58 164 49 145 Z" fill={`url(#hair${id})`} />
        <path d="M59 56 Q82 27 126 39 Q145 46 152 80 Q126 62 102 56 Q78 51 59 75Z" fill={base} />
        <path d="M67 58 Q91 38 119 46" fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth="7" strokeLinecap="round" />
      </>
    );
  }

  if (person.style === "wave") {
    return (
      <>
        <path d="M51 84 Q48 40 96 25 Q147 31 150 82 Q137 57 117 52 Q97 45 75 58 Q60 67 51 84Z" fill={`url(#hair${id})`} />
        <path d="M56 70 Q67 49 85 52 Q92 31 113 49 Q134 45 145 70 Q131 59 117 60 Q101 50 87 62 Q71 57 56 70Z" fill={base} />
        <path d="M71 53 Q92 37 115 49" fill="none" stroke="#fff" strokeOpacity=".15" strokeWidth="6" strokeLinecap="round" />
      </>
    );
  }

  return (
    <>
      <path d="M51 83 Q50 43 92 25 Q140 25 151 75 Q134 58 114 53 Q90 45 69 62 Q58 70 51 83Z" fill={`url(#hair${id})`} />
      <path d="M60 61 Q81 31 121 41 Q142 47 150 74 Q128 60 106 55 Q82 50 60 71Z" fill={base} />
      <path d="M70 53 Q91 38 116 46" fill="none" stroke="#fff" strokeOpacity=".14" strokeWidth="6" strokeLinecap="round" />
    </>
  );
}

function Outfit({ person, id }) {
  if (person.outfit === "blazer") {
    return (
      <>
        <path d="M49 225 Q52 167 100 160 Q148 167 151 225Z" fill={`url(#shirt${id})`} />
        <path d="M69 170 L91 190 L78 225 H49 Q52 180 69 170Z" fill="#6d91e8" opacity=".96" />
        <path d="M131 170 L109 190 L122 225 H151 Q148 180 131 170Z" fill="#5d82dc" opacity=".96" />
        <path d="M82 163 Q100 178 118 163 L115 187 Q100 195 85 187Z" fill="#fff" />
        <path d="M100 178 L95 204 L100 213 L105 204Z" fill="#5a67b9" />
      </>
    );
  }

  if (person.outfit === "hoodie") {
    return (
      <>
        <path d="M47 225 Q50 169 100 159 Q150 169 153 225Z" fill={`url(#shirt${id})`} />
        <path d="M70 171 Q100 187 130 171 Q121 154 100 158 Q79 154 70 171Z" fill="#8c7bd8" />
        <path d="M76 169 Q100 183 124 169" fill="none" stroke="#c9c0f5" strokeWidth="3" />
        <path d="M88 174 L86 205" stroke="#ece9ff" strokeWidth="3" strokeLinecap="round" />
        <path d="M112 174 L114 205" stroke="#ece9ff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="86" cy="207" r="3" fill="#ece9ff" />
        <circle cx="114" cy="207" r="3" fill="#ece9ff" />
      </>
    );
  }

  if (person.outfit === "overall") {
    return (
      <>
        <path d="M48 225 Q51 169 100 160 Q149 169 152 225Z" fill="#fff2f7" />
        <path d="M65 170 L83 225 H117 L135 170" fill={`url(#shirt${id})`} />
        <path d="M70 170 L84 186" stroke="#e2709a" strokeWidth="7" strokeLinecap="round" />
        <path d="M130 170 L116 186" stroke="#e2709a" strokeWidth="7" strokeLinecap="round" />
        <circle cx="84" cy="185" r="4" fill="#fff1f6" />
        <circle cx="116" cy="185" r="4" fill="#fff1f6" />
        <rect x="84" y="192" width="32" height="22" rx="6" fill="#f18eb2" opacity=".84" />
      </>
    );
  }

  return (
    <>
      <path d="M47 225 Q50 168 100 159 Q150 168 153 225Z" fill={`url(#shirt${id})`} />
      <path d="M79 164 Q100 181 121 164" fill="none" stroke="#dff6e9" strokeWidth="8" />
      <path d="M59 196 H141" stroke="#3f9270" strokeOpacity=".2" strokeWidth="2" />
      <path d="M58 204 H142" stroke="#3f9270" strokeOpacity=".16" strokeWidth="2" />
      <path d="M78 172 L71 225" stroke="#3f9270" strokeOpacity=".18" strokeWidth="2" />
      <path d="M122 172 L129 225" stroke="#3f9270" strokeOpacity=".18" strokeWidth="2" />
    </>
  );
}

function videoActionForReaction(reaction) {
  if (reaction === "excited") return "admire";
  if (reaction === "attentive") return "focus";
  if (reaction === "confused" || reaction === "tooFast") return "question";
  return null;
}

function isFiniteAction(action) {
  return action && !["sleepIn", "asleep", "wake"].includes(action.kind);
}

function VideoAudienceAvatar({ person, reaction, mood, volume }) {
  const sourceAssets = videoAudienceAssets[person.videoKey];
  const assets = useMemo(() => {
    if (!sourceAssets?.idle) return null;
    return {
      idle: sourceAssets.idle,
      sleepIn: sourceAssets.sleepIn || sourceAssets.idle,
      wake: sourceAssets.wake || sourceAssets.idle,
      admire: sourceAssets.admire || sourceAssets.idle,
      focus: sourceAssets.focus || sourceAssets.idle,
      question: sourceAssets.question || sourceAssets.idle,
    };
  }, [sourceAssets]);
  const idleVideoRef = useRef(null);
  const actionVideoRef = useRef(null);
  const previousMoodRef = useRef(mood);
  const previousReactionRef = useRef(reaction);
  const lastActionAtRef = useRef(0);
  const pendingActionRef = useRef(null);
  const [action, setAction] = useState(null);
  const [actionReady, setActionReady] = useState(false);

  const isSleepingMood = mood === "bored";

  useEffect(() => {
    if (!assets) return;
    Object.values(assets).forEach((source) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = source;
      video.load();
    });
  }, [assets]);

  useEffect(() => {
    const idleVideo = idleVideoRef.current;
    if (!idleVideo) return;
    const playPromise = idleVideo.play();
    playPromise?.catch?.(() => {});
  }, []);

  useEffect(() => {
    if (!assets) return;
    const now = Date.now();
    const previousMood = previousMoodRef.current;
    const previousReaction = previousReactionRef.current;
    previousMoodRef.current = mood;
    previousReactionRef.current = reaction;

    if (isSleepingMood) {
      if (isFiniteAction(action)) {
        pendingActionRef.current = { kind: "sleepIn", source: assets.sleepIn };
        return;
      }
      if (action?.kind !== "sleepIn" && action?.kind !== "asleep") {
        setActionReady(false);
        setAction({ kind: "sleepIn", source: assets.sleepIn });
        lastActionAtRef.current = now;
      }
      return;
    }

    if (previousMood === "bored") {
      if (isFiniteAction(action)) {
        pendingActionRef.current = { kind: "wake", source: assets.wake };
        return;
      }
      setActionReady(false);
      setAction({ kind: "wake", source: assets.wake });
      lastActionAtRef.current = now;
      return;
    }

    const nextAction = videoActionForReaction(reaction);
    if (
      nextAction &&
      reaction !== previousReaction &&
      action?.kind !== nextAction &&
      now - lastActionAtRef.current >= VIDEO_ACTION_MIN_INTERVAL_MS
    ) {
      if (action) {
        pendingActionRef.current = { kind: nextAction, source: assets[nextAction] };
        return;
      }
      setActionReady(false);
      setAction({ kind: nextAction, source: assets[nextAction] });
      lastActionAtRef.current = now;
      return;
    }

    if (!nextAction && action?.kind && now - lastActionAtRef.current >= VIDEO_ACTION_MIN_INTERVAL_MS) {
      setAction(null);
      setActionReady(false);
    }
  }, [action, assets, isSleepingMood, mood, reaction]);

  useEffect(() => {
    const actionVideo = actionVideoRef.current;
    if (!actionVideo || !action || action.kind === "asleep") return;
    actionVideo.currentTime = 0;
    const playPromise = actionVideo.play();
    playPromise?.catch?.(() => {});
  }, [action?.source]);

  const handleEnded = () => {
    if (action?.kind === "sleepIn") {
      setAction((current) => (current ? { ...current, kind: "asleep" } : current));
      return;
    }
    const nextAction = pendingActionRef.current;
    pendingActionRef.current = null;
    if (nextAction) {
      setActionReady(false);
      setAction(nextAction);
      lastActionAtRef.current = Date.now();
      return;
    }
    setAction(null);
    setActionReady(false);
  };

  const actionClassName = useMemo(
    () => `audience-video audience-video-action ${actionReady ? "ready" : ""} ${action?.kind === "asleep" ? "asleep" : ""}`,
    [action, actionReady],
  );

  if (!assets) {
    return <AudienceAvatar person={person} mood={mood} index={0} />;
  }

  return (
    <div className="audience-video-shell" style={{ "--audio-level": Math.min(volume * 30, 1.6) }}>
      <video
        ref={idleVideoRef}
        className="audience-video audience-video-idle"
        src={assets.idle}
        muted
        playsInline
        autoPlay
        loop
        preload="auto"
        aria-label={`${person.name} ${reactionCopy[reaction] || "반응"}`}
      />
      {action ? (
        <video
          ref={actionVideoRef}
          className={actionClassName}
          src={action.source}
          muted
          playsInline
          autoPlay
          preload="auto"
          aria-hidden="true"
          onCanPlay={() => setActionReady(true)}
          onEnded={handleEnded}
        />
      ) : null}
    </div>
  );
}

function AudienceAvatar({ person, mood, index }) {
  const id = `avatar${index}`;
  return (
    <svg className="audience-avatar-svg" viewBox="0 0 200 240" role="img" aria-label={`${person.name} ${reactionCopy[mood] || "반응"}`}>
      <defs>
        <linearGradient id={`skin${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={person.skin[0]} />
          <stop offset="1" stopColor={person.skin[1]} />
        </linearGradient>
        <linearGradient id={`hair${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={person.hair[0]} />
          <stop offset="1" stopColor={person.hair[1]} />
        </linearGradient>
        <linearGradient id={`shirt${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={person.shirt[0]} />
          <stop offset="1" stopColor={person.shirt[1]} />
        </linearGradient>
        <radialGradient id={`cheek${id}`}>
          <stop stopColor="#ef8791" stopOpacity=".34" />
          <stop offset="1" stopColor="#ef8791" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`faceLight${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#fff" stopOpacity=".24" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <Outfit person={person} id={id} />
      <rect x="88" y="145" width="24" height="28" rx="10" fill={`url(#skin${id})`} />
      <path d={facePath(person.face)} fill={`url(#skin${id})`} />
      <path d="M57 60 Q68 42 85 35" fill="none" stroke={`url(#faceLight${id})`} strokeWidth="10" strokeLinecap="round" />
      <ellipse cx="50" cy="104" rx="9" ry="15" fill={person.skin[1]} />
      <ellipse cx="150" cy="104" rx="9" ry="15" fill={person.skin[1]} />
      <path d="M47 103 Q51 97 54 104" fill="none" stroke="#c98367" strokeWidth="2" />
      <path d="M153 103 Q149 97 146 104" fill="none" stroke="#c98367" strokeWidth="2" />
      <Hair person={person} id={id} />
      <ellipse cx="72" cy="115" rx="18" ry="13" fill={`url(#cheek${id})`} />
      <ellipse cx="128" cy="115" rx="18" ry="13" fill={`url(#cheek${id})`} />
      <path d="M99 100 Q95 111 100 115" fill="none" stroke="#d38d72" strokeWidth="3" strokeLinecap="round" />
      <path d="M96 116 Q100 118 104 116" fill="none" stroke="#e4a088" strokeWidth="1.7" strokeLinecap="round" />
      <FaceExpression mood={mood} />
      {person.glasses ? (
        <g fill="none" stroke="#555d70" strokeWidth="3">
          <rect x="61" y="86" width="34" height="24" rx="10" />
          <rect x="105" y="86" width="34" height="24" rx="10" />
          <path d="M95 97 H105" />
          <path d="M61 97 L53 94" />
          <path d="M139 97 L147 94" />
          <path d="M65 90 Q76 85 89 90" stroke="#fff" strokeOpacity=".22" strokeWidth="2" />
        </g>
      ) : null}
    </svg>
  );
}

function AudienceTile({ person, reaction, active, volume, index }) {
  const mood = visualMood(reaction);
  return (
    <article className={`audience-tile mood-${mood} ${active ? "active" : ""}`} data-reaction={mood}>
      {person.videoKey && videoAudienceAssets[person.videoKey] ? (
        <VideoAudienceAvatar person={person} reaction={reaction} mood={mood} volume={volume} />
      ) : (
        <div className="avatarbox" style={{ "--bob": `${Math.min(volume * 30, 1.6)}px` }}>
          <AudienceAvatar person={person} mood={mood} index={index} />
          <span className="floor-shadow" />
        </div>
      )}
      <div className="audience-info">
        <div>
          <strong>{person.name}</strong>
          <small>{person.role}</small>
        </div>
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

export default function PracticePage({
  audience,
  backToSetup,
  chat,
  elapsed,
  error,
  finishPresentation,
  isFinishing,
  liveTranscript,
  paceLabel,
  reaction,
  script,
  silenceLabel,
  situation,
  transcriptScrollRef,
  volume,
  audienceReactions,
  audienceMetrics,
  deliveryLabel,
}) {
  return (
    <>
      <header className="session-header">
        <div>
          <p className="eyebrow">Live Session</p>
          <h1>발표 연습 중</h1>
        </div>
        <div className="session-time">{formatTime(elapsed)}</div>
        <button className="danger-button" onClick={finishPresentation} disabled={isFinishing}>
          {isFinishing ? <Loader2 className="spin" size={18} /> : <Square size={16} />}
          {isFinishing ? "발표 정리 중" : "종료"}
        </button>
      </header>

      {error && <div className="notice">{error}</div>}

      <div className="practice-layout">
        <section className="stage-card">
          <div className="audience-grid practice-audience">
            {audience.map((person, index) => (
              <AudienceTile
                key={person.name}
                index={index}
                person={person}
                reaction={audienceReactions?.[person.name] || reactionForAudience(person, situation, audienceMetrics)}
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
