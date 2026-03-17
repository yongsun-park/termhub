# 2026-03-16 Claude RC 런처

## 목표
모바일에서 TermHub 접속 후 프로젝트 디렉토리를 탭 한 번으로 Claude Remote Control을 자동 실행하는 기능.

## 구현 내역

### 1. Server: 프로젝트 디렉토리 스캔
- **새 파일:** `packages/server/src/projects.ts`
- `TERMHUB_PROJECTS` 환경변수 (콜론 구분, 기본: `$HOME/repositories`)
- 각 base dir의 즉시 하위 디렉토리만 스캔 (재귀 없음)
- 숨김 디렉토리 제외, `.git` 존재 확인
- `{ name, path, hasGit }[]` 반환, 알파벳 정렬
- base dir 하나가 unreadable이어도 partial result 반환

### 2. Server: API 엔드포인트
- `GET /api/projects` — authMiddleware 적용
- `packages/server/src/index.ts`에 라우트 추가

### 3. Frontend: SidePanel open/close API
- `open()`, `close()` 메서드 추가 (기존 `toggle()`만 있었음)
- 모바일 오버레이: backdrop 추가, 클릭 시 close

### 4. Frontend: 사이드 패널 Claude RC 섹션
- 사이드 패널 최상단에 "Claude RC" 섹션 추가
- 프로젝트 카드: 이름 + 경로 축약 + 런치 아이콘 (▶)
- 상태 관리: loading/error/ready (섹션), launching/error (카드별)
- 중복 방지: 동일 path에 이미 launching 상태면 클릭 무시

### 5. Frontend: initApp() 모바일 분기
- 모바일(≤600px)에서 세션 없으면 자동 생성 대신 사이드 패널 자동 오픈
- 데스크탑에서는 기존 동작 유지

### 6. Frontend: launchClaudeRC() 오케스트레이션
1. 동일 cwd의 활성 세션 있으면 해당 세션으로 전환
2. `POST /api/sessions` (cwd: project.path, name: "claude-rc:projectName")
3. 터미널 생성 + WebSocket 연결 + 탭 전환
4. 모바일이면 sidePanel.close()
5. `POST /api/sessions/:id/send` (text: "claude", waitForIdle: true, timeoutMs: 60s)
6. `POST /api/sessions/:id/send` (text: "/remote-control", waitForIdle: false)
7. 실패 시 toast 경고, 터미널은 유지

### 7. CSS 스타일
- `.project-card` — 보라색 좌측 보더, min-height 48px
- `.launching` — 스피너 애니메이션, pointer-events: none
- `.error` — 빨간 보더
- 모바일: 패널 position:fixed width:100%, backdrop, 카드 56px+, 프로젝트명 16px

## 수정 파일
| 파일 | 변경 |
|------|------|
| `packages/server/src/projects.ts` | **신규** — 프로젝트 스캔 |
| `packages/server/src/index.ts` | `GET /api/projects` 라우트 |
| `packages/web/src/side-panel.ts` | open/close, Claude RC 섹션 |
| `packages/web/src/main.ts` | launchClaudeRC, initApp 모바일 |
| `packages/web/src/style.css` | 프로젝트 카드 + 모바일 오버레이 |
