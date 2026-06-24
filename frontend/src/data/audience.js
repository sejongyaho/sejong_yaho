export const audience = [
  {
    name: "민서",
    role: "공감형 청중",
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

export const situationMessages = {
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
