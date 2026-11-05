// 공고에서 찾는 역량 사전. 없는 역량은 사용자가 화면에서 직접 추가한다.
// size: 첫 증거까지 필요한 1시간 실습 횟수 (S 3, M 5, L 8)
export const SKILLS = [
  ["python", "Python", "tech", "M", ["Python", "파이썬"]],
  ["sql", "SQL", "tech", "M", ["SQL", "쿼리"]],
  ["r", "R", "tech", "M", [], "(?<![A-Za-z0-9])R(?![A-Za-z0-9&])"],
  ["excel", "엑셀", "tech", "S", ["Excel", "엑셀"]],
  ["tableau", "Tableau", "tech", "S", ["Tableau", "태블로"]],
  ["powerbi", "Power BI", "tech", "S", ["Power BI", "PowerBI", "파워BI"]],
  ["ga", "웹 분석", "tech", "S", ["GA4", "Google Analytics", "구글 애널리틱스", "Amplitude", "앰플리튜드", "Mixpanel"]],
  ["stats", "통계", "tech", "M", ["통계", "가설 검정", "회귀"]],
  ["abtest", "A/B 테스트", "tech", "S", ["A/B 테스트", "A/B테스트", "AB 테스트", "AB테스트"]],
  ["pipeline", "데이터 파이프라인", "tech", "L", ["ETL", "데이터 파이프라인", "Airflow", "에어플로우", "Spark", "Kafka", "Hadoop"]],
  ["ml", "머신러닝", "tech", "L", ["머신러닝", "machine learning", "딥러닝", "deep learning", "PyTorch", "TensorFlow", "scikit-learn"], "(?<![A-Za-z0-9])ML(?![A-Za-z0-9])"],
  ["llm", "LLM 활용", "tech", "M", ["LLM", "RAG", "프롬프트", "생성형 AI", "생성 AI", "에이전트"]],
  ["javascript", "JavaScript", "tech", "M", ["JavaScript", "자바스크립트"]],
  ["typescript", "TypeScript", "tech", "M", ["TypeScript", "타입스크립트"]],
  ["react", "React", "tech", "L", ["React", "리액트", "Next.js", "NextJS"]],
  ["vue", "Vue", "tech", "L", ["Vue", "뷰js"]],
  ["node", "Node.js", "tech", "M", ["Node.js", "NodeJS", "NestJS", "Express"]],
  ["java", "Java", "tech", "L", ["Java"], "자바(?!스크립트)"],
  ["spring", "Spring", "tech", "L", ["Spring", "스프링"]],
  ["kotlin", "Kotlin", "tech", "M", ["Kotlin", "코틀린"]],
  ["android", "Android", "tech", "L", ["Android", "안드로이드"]],
  ["ios", "iOS", "tech", "L", ["iOS", "Swift", "스위프트"]],
  ["flutter", "Flutter", "tech", "L", ["Flutter", "플러터"]],
  ["cpp", "C++", "tech", "L", ["C++"]],
  ["csharp", "C#", "tech", "L", ["C#", "Unity", "유니티"]],
  ["database", "DB 설계", "tech", "M", ["MySQL", "PostgreSQL", "Oracle", "MongoDB", "Redis", "RDBMS", "DB 설계", "데이터베이스"]],
  ["api", "API 설계", "tech", "M", ["REST API", "RESTful", "API 설계", "API 개발", "GraphQL"]],
  ["git", "Git", "tech", "S", ["Git", "GitHub", "GitLab", "깃허브"]],
  ["linux", "Linux", "tech", "S", ["Linux", "리눅스"]],
  ["docker", "Docker", "tech", "M", ["Docker", "도커", "Kubernetes", "쿠버네티스", "K8s"]],
  ["cloud", "클라우드", "tech", "M", ["AWS", "GCP", "Azure", "클라우드"]],
  ["cicd", "CI/CD", "tech", "S", ["CI/CD", "GitHub Actions", "Jenkins"]],
  ["testing", "테스트 코드", "tech", "S", ["테스트 코드", "단위 테스트", "TDD"]],

  ["planning", "서비스 기획", "work", "M", ["서비스 기획", "프로덕트 기획", "제품 기획", "PRD", "요구사항 정의", "요구사항 분석"], "(?<![A-Za-z0-9])(PM|PO)(?![A-Za-z0-9])"],
  ["wireframe", "와이어프레임", "work", "S", ["와이어프레임", "화면 설계", "스토리보드"]],
  ["research", "사용자 리서치", "work", "M", ["사용자 리서치", "유저 리서치", "UX 리서치", "사용자 조사", "유저 인터뷰", "사용자 인터뷰"]],
  ["metrics", "지표 설계", "work", "S", ["KPI", "OKR", "지표 설계", "지표 분석", "성과 지표", "퍼널"]],
  ["agile", "애자일", "work", "S", ["애자일", "스크럼", "Agile", "Scrum", "Jira", "지라"]],
  ["datanalysis", "데이터 분석", "work", "M", ["데이터 분석", "데이터 기반", "data analysis", "시각화"]],
  ["performance", "퍼포먼스 마케팅", "work", "M", ["퍼포먼스 마케팅", "광고 운영", "메타 광고", "구글 광고", "검색 광고", "ROAS"]],
  ["content", "콘텐츠 마케팅", "work", "M", ["콘텐츠 마케팅", "콘텐츠 기획", "콘텐츠 제작", "카피라이팅", "블로그 운영"]],
  ["sns", "SNS 운영", "work", "S", ["SNS", "소셜 미디어", "인스타그램", "유튜브"]],
  ["seo", "SEO", "work", "S", ["SEO", "검색 엔진 최적화"]],
  ["crm", "CRM", "work", "S", ["CRM"]],
  ["brand", "브랜드 마케팅", "work", "M", ["브랜드 마케팅", "브랜딩", "캠페인 기획"]],
  ["figma", "Figma", "work", "S", ["Figma", "피그마"]],
  ["uiux", "UI·UX 디자인", "work", "L", ["UI 디자인", "UX 디자인", "UI/UX", "UX/UI", "디자인 시스템", "프로토타입", "프로토타이핑"]],
  ["graphic", "그래픽 디자인", "work", "M", ["Photoshop", "포토샵", "Illustrator", "일러스트레이터", "그래픽 디자인", "편집 디자인"]],
  ["video", "영상 편집", "work", "M", ["영상 편집", "프리미어", "Premiere", "After Effects", "애프터이펙트"]],
  ["finance", "재무 분석", "work", "L", ["재무 분석", "재무제표", "재무 모델", "밸류에이션", "기업 가치"]],
  ["accounting", "회계", "work", "L", ["회계", "결산", "전표", "세무"]],
  ["market", "시장 조사", "work", "S", ["시장 조사", "시장 분석", "경쟁사 분석", "산업 분석"]],
  ["strategy", "사업 기획", "work", "M", ["사업 기획", "사업 전략", "사업 계획", "신사업"]],
  ["sales", "영업", "work", "M", ["세일즈", "고객 관리", "B2B"], "영업(?!일)"],
  ["proposal", "제안서 작성", "work", "S", ["제안서", "RFP", "입찰"]],
  ["hr", "인사 운영", "work", "M", ["채용 운영", "인사 제도", "인사 운영", "조직 문화", "평가 보상", "노무"]],
  ["ppt", "PPT 작성", "work", "S", ["PPT", "파워포인트", "PowerPoint", "프레젠테이션"]],

  ["communication", "커뮤니케이션", "soft", "S", ["커뮤니케이션", "소통"]],
  ["collaboration", "협업", "soft", "S", ["협업", "팀워크", "유관 부서"]],
  ["problem", "문제 해결", "soft", "S", ["문제 해결", "문제해결"]],
  ["writing", "문서 작성", "soft", "S", ["문서 작성", "문서화", "보고서 작성"]],
  ["leadership", "리더십", "soft", "S", ["리더십", "프로젝트 리딩", "프로젝트 관리"]],
  ["ownership", "주도성", "soft", "S", ["주도적", "주도성", "오너십", "자기주도"]],

  ["english", "영어", "lang", "M", ["영어", "English", "토익", "TOEIC", "오픽", "OPIc", "토플", "TOEFL"]],
  ["japanese", "일본어", "lang", "M", ["일본어", "JLPT"]],
  ["chinese", "중국어", "lang", "M", ["중국어", "HSK"]],

  ["sqld", "SQLD", "cert", "M", ["SQLD", "SQLP"]],
  ["adsp", "ADsP", "cert", "M", ["ADsP", "ADP"]],
  ["engineer", "정보처리기사", "cert", "L", ["정보처리기사"]],
  ["computer", "컴퓨터활용능력", "cert", "M", ["컴퓨터활용능력", "컴활"]],
  ["accountingcert", "회계 자격증", "cert", "M", ["전산회계", "재경관리사", "FAT", "TAT"]],
].map(([id, label, group, size, aliases, pattern]) => ({ id, label, group, size, aliases, pattern }));

export const SKILL_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function aliasPattern(alias) {
  const escaped = escapeRegExp(alias);
  // 한글은 조사가 바로 붙으므로 영문·숫자 경계만 검사한다.
  return /^[\x00-\x7f]+$/.test(alias) ? `(?<![A-Za-z0-9+#.])${escaped}(?![A-Za-z0-9+#])` : escaped;
}

export function skillMatcher(skill) {
  const insensitive = skill.aliases.map(aliasPattern).join("|");
  const parts = [];
  if (insensitive) parts.push(new RegExp(insensitive, "i"));
  if (skill.pattern) parts.push(new RegExp(skill.pattern));
  return (text) => parts.some((pattern) => pattern.test(text));
}
