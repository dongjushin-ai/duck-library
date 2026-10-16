// 홈 화면과 시작 가이드에 들어가는 글. 원본 DUCK LIBRARY 템플릿의 문구를 그대로 옮겼어요.
import { rt, para, h2, numbered, bullet, callout, columns, divider, toggle, richPara } from "./blocks.js";

export const REPO_URL = "https://github.com/dongjushin-ai/duck-library";

/** 홈 맨 위: 시작 안내, 3분 시작, 흐름 설명, 바로가기 카드 */
export function homeIntro(schema, dbs) {
  const card = (s) => {
    const db = dbs[s.db];
    const def = schema.databases.find((d) => d.key === s.db);
    return [
      callout(
        [
          ...rt(`${s.label}\n`, { bold: true }),
          ...rt(`${def.title} 열기 →`, { link: db.url }),
          ...rt(`\n${s.desc}`, { color: "gray" }),
        ],
        def.icon,
        s.color
      ),
    ];
  };
  const cards = schema.shortcuts.map(card);

  return [
    callout(
      "**내 작업실로 시작하기**\n아래 노션 목록에서 바로 기록을 시작하세요. 맨 아래 '처음 설치한 뒤' 안내를 한 번 읽어 주세요.",
      "🦆",
      "green_background"
    ),
    h2("처음 쓰는 분 · 3분 시작", "green"),
    callout(
      "**첫날에는 세 가지만 하세요.** 이번 학기 수업 등록 → 지금 하는 활동 1개 등록 → 오늘 들은 강의나 회의를 RAW에 한 줄. 이것만으로 세컨드브레인이 굴러가기 시작해요.",
      "✅",
      "green_background"
    ),
    numbered("**수업** · 과목·학기·학점만 적어요. 과제와 RAW 기록이 수업에 모여요."),
    numbered("**활동** · 동아리·공모전·인턴처럼 나중에 이력서에 쓸 만한 활동을 적어요."),
    numbered("**RAW** · 정리하지 말고 일단 던져요. 제목 한 줄 + 수업/활동 연결이면 충분해요."),
    callout(
      "**RAW → WIKI → OUTPUT 흐름** · \n**RAW(줍줍 상자)** 수업·회의·아이디어를 그때그때 던져요 → **WIKI(오리 도서관)** 일주일에 한 번, RAW를 내 말로 정리한 노트로 옮겨요 → **OUTPUT(포트폴리오 진열장)** 활동이 끝나면 위키를 근거로 포트폴리오 카드·이력서 한 줄·자소서 문단을 만들어요.",
      "📚",
      "blue_background"
    ),
    callout(
      "**화면 구분** · 실제 입력과 집계는 아래 Notion 데이터베이스에서 진행돼요. 학교 시스템(LMS·포털)과 자동 연동되지 않아요.",
      "ℹ️",
      "brown_background"
    ),
    h2("작업실 바로가기", "brown"),
    para("아래 카드를 열어 실제 기록을 관리하세요.", { color: "gray" }),
    columns(cards.slice(0, 3)),
    columns(cards.slice(3, 6)),
    divider(),
  ];
}

/** 홈 각 섹션 제목 + 회색 안내문 */
export function sectionHeader(section) {
  return [h2(section.heading, section.color), para(section.hint, { color: "gray" })];
}

/** 홈 맨 아래 접기 안내 */
export function homeFooter(semesters) {
  return [
    toggle(
      "처음 설치한 뒤 · 내 기록으로 설정하기",
      [
        numbered("이름 끝에 (예시)가 붙은 행은 연습용이에요. RAW → WIKI → OUTPUT이 어떻게 이어지는지 예시를 눌러 본 뒤 지워 주세요."),
        numbered(`수업의 \`학기\` 선택지는 ${semesters.map((s) => s.name).join(" · ")}로 만들어 두었어요. 필요하면 새 학기를 입력해 추가하세요.`),
        numbered("학교 시스템과 자동 연동은 없어요. 이 작업실은 내 Notion 안에만 있고, 설치 스크립트는 다른 곳으로 기록을 보내지 않아요."),
      ],
      "brown_background"
    ),
  ];
}

/** 시작 가이드 페이지 본문 */
export function guideBlocks() {
  const row = (cells) => ({ type: "table_row", table_row: { cells: cells.map((c) => rt(c)) } });
  const faq = (q, a) => toggle(q, [para(a)]);
  return [
    para("DUCK LIBRARY는 수업·과제·활동에서 나오는 기록을 **RAW → WIKI → OUTPUT** 3단계로 바꿔, 학기가 끝날 때 포트폴리오와 이력서 재료가 남도록 돕는 대학생용 Notion 세컨드브레인이에요."),
    callout(
      "**용어 한눈에** · 줍줍 상자 = RAW 기록 / 오리 도서관 = WIKI 노트 / 포트폴리오 진열장 = OUTPUT 결과물 / 퀘스트 = 과제·할 일 / 강의실 = 수업 / 모험 기록 = 활동",
      "🦆",
      "green_background"
    ),
    h2("세 단계가 뭐예요?", "brown"),
    {
      type: "table",
      table: {
        table_width: 3,
        has_column_header: true,
        has_row_header: false,
        children: [
          row(["단계", "무엇을", "언제"]),
          row(["📥 RAW", "강의 메모·회의록·아이디어·읽은 글·회고를 정리 없이", "떠오를 때마다"]),
          row(["📚 WIKI", "RAW를 내 말로 다시 쓴 주제별 노트", "일주일에 한 번 (일요일 밤 추천)"]),
          row(["🏆 OUTPUT", "포트폴리오 카드·이력서 한 줄·자소서 문단·발표", "활동이 끝났을 때, 지원 전"]),
        ],
      },
    },
    h2("일주일 루틴 (15분)", "brown"),
    numbered("첫 화면의 **📥 정리 기다리는 기록**을 열어요."),
    numbered("같은 주제의 RAW를 모아 **WIKI 노트** 하나로 정리하고, 노트의 `출처 RAW`에 연결해요."),
    numbered("RAW의 `정리 상태`를 `🔗 위키로 옮김`, 필요 없는 건 `🗃 보관만`으로 바꿔요."),
    numbered("목록이 비면 이번 주 정리 끝!"),
    h2("활동이 끝났을 때", "brown"),
    numbered("**활동**의 `성과 숫자`를 채워요. (참여 인원, 조회수, 수상, 단축한 시간 등)"),
    numbered("**OUTPUT**에서 `포트폴리오 카드`를 만들고, 활동·참고 위키를 연결해요."),
    numbered("상황(S·T) → 내 행동(A) → 결과(R) 순서로 채워요. 결과는 가능하면 숫자로."),
    numbered("같은 내용을 `이력서 한 줄`로 짧게 하나 더 만들어 두면 지원할 때 바로 쓸 수 있어요."),
    h2("자동으로 나오는 것", "brown"),
    bullet("**D-day** · 과제 마감까지 남은 날, 오늘 마감은 🔥, 지나면 ⚠️"),
    bullet("**정리 알림** · RAW가 7일 넘게 미정리면 ⏰ n일째 대기"),
    bullet("**남은 과제** · 수업별 완료하지 않은 과제 수"),
    bullet("**포트폴리오 준비도** · 활동별로 ✏️ 첫 기록 필요 → 📥 기록만 있음 → 📚 위키 정리됨 → 🏆 결과물 있음"),
    h2("자주 묻는 질문", "brown"),
    faq("RAW랑 WIKI를 꼭 나눠야 하나요?", "처음부터 깔끔하게 쓰려고 하면 기록을 안 하게 돼요. RAW는 빠르게, WIKI는 천천히. 두 단계로 나누면 기록이 쌓이고 정리도 덜 부담스러워요."),
    faq("새 WIKI 노트는 어떻게 쓰나요?", "예시 노트 '데이터베이스 정규화 한 장 정리'를 복제해서 제목과 내용만 바꾸면 틀을 그대로 쓸 수 있어요. (한 줄 요약 → 내 말로 설명 → 예시 → 연결)"),
    faq("학기를 추가하고 싶어요", "수업의 `학기` 선택지에 새 학기(예: 2027-2)를 입력하면 바로 추가돼요."),
    faq("학교 LMS나 캘린더와 연동되나요?", "아니요. 과제·수업은 직접 입력해요. 과제 마감은 과제 DB의 '마감 캘린더' 보기로 볼 수 있어요."),
    faq("핸드폰에서도 되나요?", "네. 수업 중에는 모바일 Notion 앱으로 RAW에 한 줄씩 던지고, 정리는 PC에서 하는 걸 추천해요."),
    h2("이용 안내", "brown"),
    richPara([
      ...rt("DUCK LIBRARY는 MIT 라이선스로 공개된 오픈소스예요. 자유롭게 쓰고, 고치고, 친구에게 공유해도 돼요. 설치 도구와 설명은 "),
      ...rt("GitHub 저장소", { link: REPO_URL }),
      ...rt("에 있어요."),
    ]),
    bullet("예시 데이터의 학교·활동·수상 내용은 가상의 값이에요."),
  ];
}
