// 처음 쓰는 사람이 둘러볼 수 있는 가상의 데이터. 실제 회사·인물과 무관하다.
import { addDays, emptyState, parseIso } from "./engine.js";

const POSTINGS = [
  {
    company: "(예시) 오리테크",
    title: "데이터 분석가 신입",
    text: `담당업무
- 서비스 지표 분석과 A/B 테스트 설계
- 대시보드 구축과 시각화
자격요건
- SQL로 원하는 데이터를 직접 추출할 수 있는 분
- Python을 활용한 데이터 분석 경험
- 통계 기초 지식
- 유관 부서와 협업하고 소통하는 데 익숙한 분
우대사항
- Tableau 사용 경험
- SQLD 자격증 보유자
복리후생
- 영어 회화 지원`,
  },
  {
    company: "(예시) 호수커머스",
    title: "그로스 분석 인턴",
    text: `주요업무
퍼널 분석과 KPI 관리
자격요건
SQL 활용 능력
엑셀 함수와 피벗 테이블 활용
문제 해결을 즐기는 분
우대사항
GA4 활용 경험
Python 사용 가능자`,
  },
  {
    company: "(예시) 깃털핀테크",
    title: "비즈니스 애널리스트",
    text: `자격요건
- SQL 필수
- 데이터 기반 의사결정 경험
- 문서 작성과 커뮤니케이션 역량
- 금융 규제 흐름을 이해하고 설명할 수 있는 분
우대사항
- ADsP 보유
- 영어 문서 독해 가능자`,
  },
];

export function sampleState(today) {
  const state = emptyState();
  state.isSample = true;
  state.profile = {
    ...state.profile,
    name: "오리",
    role: "데이터 분석가",
    graduationYear: parseIso(today).getFullYear() + 1,
    graduationTerm: 2,
    availability: [150, 150, 150, 150, 150, 240, 180],
  };
  state.postings = POSTINGS.map((posting, index) => ({ ...posting, id: `sample-${index}` }));
  state.experiences = [
    {
      id: "sample-exp-1",
      title: "학과 설문 데이터 분석 프로젝트",
      situation: "학과 행사 만족도가 낮았지만 이유를 몰랐어요.",
      action: "설문 320건을 정리해 항목별로 비교했어요.",
      result: "행사 순서를 바꾸자는 제안이 다음 학기에 반영됐어요.",
      evidence: "설문분석_최종보고서.pdf",
      skills: ["excel", "collaboration"],
      fromTask: "",
    },
    {
      id: "sample-exp-2",
      title: "SQL 스터디 8주 참여",
      situation: "",
      action: "매주 문제를 풀고 서로 쿼리를 검토했어요.",
      result: "",
      evidence: "",
      skills: ["sql"],
      fromTask: "",
    },
  ];
  state.deadlines = [
    { id: "sample-due-1", title: "통계학 중간 과제", date: addDays(today, 3), kind: "과제", prepMinutes: 120 },
    { id: "sample-due-2", title: "자료구조 시험", date: addDays(today, 9), kind: "시험", prepMinutes: 240 },
  ];
  state.graduation = {
    requiredCredits: 130,
    earnedCredits: 96,
    courses: [
      { name: "캡스톤디자인", done: false },
      { name: "영어 필수 교양", done: true },
    ],
  };
  return state;
}
