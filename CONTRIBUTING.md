# 기여하기

코딩을 몰라도 도울 수 있어요.

## 가장 쉬운 기여: 역량 사전

플래너는 [`planner/src/skills.js`](planner/src/skills.js) 사전으로 공고를 읽어요. 내 직무 공고에서 "사전에 없어 못 읽은 요건"이 나오면 [역량 추가 요청](../../issues/new?template=skill-request.yml)을 남기거나 직접 고쳐 주세요.

한 줄 형식은 `[id, 화면 이름, 분류, 크기, [공고에 나오는 표현들]]`이에요.

- 분류: `tech` 도구·기술, `work` 직무, `soft` 태도, `lang` 언어, `cert` 자격증
- 크기: 첫 결과물까지 걸리는 시간. `S` 짧음, `M` 보통, `L` 김
- 영어 약어는 다른 단어 속에서 잘못 잡히기 쉬우니 [`test/planner.test.js`](test/planner.test.js)에 오탐 테스트를 같이 넣어 주세요.

## 코드 기여

```text
npm install
npm test
npm run planner:build
```

`dist/index.html`을 브라우저로 열어 확인해요. 플래너는 외부 요청을 하지 않는다는 약속을 지켜야 해서, 외부 스크립트, 폰트, 분석 도구는 넣지 않아요.

## 후기

2주 동안 써 봤다면 [사용 후기](../../issues/new?template=feedback.yml)를 남겨 주세요. 다음에 무엇을 만들지 이 후기로 정해요.
