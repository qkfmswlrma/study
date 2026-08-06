# 수능 대비

모의고사 기록과 타이머, 로그인.

```
_source.html   ← 여기만 고친다 (JSX 원본)
index.html     ← _build.js 가 만든다 (직접 고치지 않는다)
schema.sql     Supabase 표와 정책
_build.js      JSX 를 컴파일해 index.html 을 만든다
_verify.js     jsdom 으로 실제 렌더링 확인
_serve.js      로컬 확인용 서버
_redirects     Cloudflare Pages 용
```

도구 파일 이름이 밑줄로 시작하는 이유는, Cloudflare Pages 가 밑줄로 시작하는 파일을
정적 자산에서 빼기 때문이다. 저장소에는 남기고 사이트에서는 열리지 않게 한다.

## 처음 받았다면

```bash
npm install
```

## 고친 뒤에

```bash
node _build.js _source.html index.html
```

빌드만으로는 부족하다. 아래까지 통과해야 한다.

```bash
node _verify.js index.html /
node _verify.js index.html /timer
node _verify.js index.html /records --login
node _verify.js index.html /stats --login
node _verify.js index.html /records --empty
```

한글이 유실되지 않았는지도 본다. 0개가 아니면 배포하지 않는다.

```bash
node -e "const fs=require('fs'),re=/[가-힣]{2,}/g;const a=new Set(fs.readFileSync('_source.html','utf8').match(re));const b=new Set(fs.readFileSync('index.html','utf8').match(re));console.log('누락:',[...a].filter(w=>!b.has(w)).length)"
```

## 눈으로 볼 때

```bash
node _serve.js 8788
```

`_redirects` 와 같게 어떤 주소로 들어와도 index.html 을 준다.

## Supabase

`_source.html` 위쪽 `SUPABASE_URL` 과 `SUPABASE_ANON_KEY` 로 붙는다.
anon 키는 브라우저에 나가는 값이라 저장소에 있어도 된다. 실제 방어는 RLS 정책이 한다.

표와 정책은 `schema.sql` 에 있다. 프로젝트를 새로 만들면 이걸 먼저 실행한다.
두 값을 비워두면 기록이 이 기기에만 남는 체험 모드로 돌아간다.

## 알아둘 것

- 수능 날짜는 `SUNEUNG_FIXED` 에 박혀 있다. 해가 바뀌면 고친다.
  지나가면 11월 셋째 주 목요일로 알아서 넘어간다.
- 과목 시간과 문항 수는 `SUBJECTS` 한 곳에 있다. 타이머와 기록 화면이 같이 읽는다.
- 타이머는 끝나는 시각을 저장한다. 새로고침하거나 앱을 껐다 켜도 이어서 돌아간다.
- 배포는 Cloudflare Pages 에 `index.html` `_redirects` 를 올리면 된다.
