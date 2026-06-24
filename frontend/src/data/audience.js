export const audience = [
  {
    name: "민서",
    role: "공감형 청중",
    videoKey: "female1",
    stateProfile: "supportive",
    skin: ["#ffd9c2", "#f2b392"],
    hair: ["#704b3d", "#3d2924"],
    shirt: ["#9dbdfb", "#688ee5"],
    style: "long",
    face: "soft",
    outfit: "blazer",
  },
  {
    name: "준",
    role: "분석형 청중",
    videoKey: "male1",
    stateProfile: "analytical",
    skin: ["#f3c9aa", "#d99c79"],
    hair: ["#2b2c34", "#141519"],
    shirt: ["#a393ec", "#7766cb"],
    style: "short",
    face: "square",
    outfit: "hoodie",
    glasses: true,
  },
  {
    name: "하린",
    role: "표현형 청중",
    videoKey: "female2",
    stateProfile: "expressive",
    skin: ["#ffd7c5", "#f0ae90"],
    hair: ["#bc625c", "#783537"],
    shirt: ["#ffa7c8", "#df7199"],
    style: "bob",
    face: "heart",
    outfit: "overall",
  },
  {
    name: "도윤",
    role: "차분형 청중",
    videoKey: "male2",
    stateProfile: "calm",
    skin: ["#efc6a6", "#d39774"],
    hair: ["#7b5540", "#493128"],
    shirt: ["#83d7b1", "#50a77d"],
    style: "wave",
    face: "oval",
    outfit: "knit",
  },
];

export const reactionCopy = {
  attentive: "집중",
  excited: "몰입",
  sleepy: "졸림",
  confused: "혼란",
  tooFast: "빠름",
  tooSlow: "정적",
};

export const audienceStates = {
  opening: {
    label: "평상",
    reaction: "attentive",
    videoAction: "idle",
    criteria: "발표 시작 직후이거나 아직 충분한 발화 데이터가 쌓이지 않은 상태",
  },
  focused: {
    label: "집중",
    reaction: "attentive",
    videoAction: "focus",
    criteria: "속도와 침묵이 안정적이고 대본 핵심어가 어느 정도 유지되는 상태",
  },
  impressed: {
    label: "감탄",
    reaction: "excited",
    videoAction: "admire",
    criteria: "속도가 적절하고 핵심어 반영도가 높아 청중이 몰입하기 좋은 상태",
  },
  rushed: {
    label: "의문",
    reaction: "tooFast",
    videoAction: "question",
    criteria: "말 속도가 빨라 핵심어가 지나가거나 청중이 따라가기 어려운 상태",
  },
  unclear: {
    label: "의문",
    reaction: "confused",
    videoAction: "question",
    criteria: "목소리는 감지되지만 음성 인식 결과가 충분히 따라오지 않는 상태",
  },
  offScript: {
    label: "의문",
    reaction: "confused",
    videoAction: "question",
    criteria: "현재 발화가 대본의 핵심어와 멀어져 메시지가 흐려지는 상태",
  },
  drowsy: {
    label: "졸림",
    reaction: "sleepy",
    videoAction: "sleepIn",
    criteria: "침묵이나 느린 진행이 이어져 청중 집중도가 내려가는 상태",
  },
};

export const audienceStateProfiles = {
  supportive: {
    label: "공감형",
    criteria: "실수에 바로 부정 반응하지 않고, 긴 침묵이나 명확한 이탈이 이어질 때만 걱정하는 청중",
  },
  analytical: {
    label: "분석형",
    criteria: "속도, 불명확한 발음, 대본 이탈에 가장 민감하게 반응하는 청중",
  },
  expressive: {
    label: "표현형",
    criteria: "핵심어가 잘 들어오고 리듬이 살아날 때 가장 빠르게 감탄하는 청중",
  },
  calm: {
    label: "차분형",
    criteria: "침묵, 느린 진행, 호흡의 늘어짐에 가장 민감하게 반응하는 청중",
  },
};

export const situationMessages = {
  opening: {
    name: "민서",
    state: "opening",
    reaction: "attentive",
    text: "좋아요. 차분하게 시작해볼게요.",
    coaching: "첫 문장은 천천히, 핵심 주제를 분명하게 말해보세요.",
  },
  focused: {
    name: "도윤",
    state: "focused",
    reaction: "attentive",
    text: "지금 흐름이 안정적이에요.",
    coaching: "속도와 호흡이 좋아요. 지금 리듬을 유지하세요.",
  },
  impressed: {
    name: "하린",
    state: "impressed",
    reaction: "excited",
    text: "방금 포인트가 잘 들어왔어요.",
    coaching: "핵심어가 잘 살아났어요. 중요한 문장에 힘을 유지하세요.",
  },
  tooFast: {
    name: "준",
    state: "rushed",
    reaction: "tooFast",
    text: "조금 빨라요. 핵심어가 지나가고 있어요.",
    coaching: "문장 끝에서 짧게 쉬고 다음 문장으로 넘어가세요.",
  },
  tooSlow: {
    name: "도윤",
    state: "drowsy",
    reaction: "sleepy",
    text: "잠깐 멈췄어요. 다음 문장으로 이어가도 좋아요.",
    coaching: "침묵이 생겼어요. 준비한 연결 문장을 사용해보세요.",
  },
  longSilence: {
    name: "민서",
    state: "drowsy",
    reaction: "sleepy",
    text: "침묵이 길어지고 있어요.",
    coaching: "긴 침묵은 집중도를 낮춰요. 다음 핵심 문장으로 바로 이어가세요.",
  },
  unclear: {
    name: "준",
    state: "unclear",
    reaction: "confused",
    text: "목소리는 들리는데 문장이 잘 안 잡혀요.",
    coaching: "조금 더 또박또박 말하면 인식과 전달력이 좋아져요.",
  },
  offScript: {
    name: "하린",
    state: "offScript",
    reaction: "confused",
    text: "주제가 살짝 흐려졌어요.",
    coaching: "대본의 핵심 키워드로 다시 돌아와 보세요.",
  },
};
