# 2026-03-01 기존 tmux 세션 원격 연결

## 목표

로컬 터미널에서 이미 실행 중인 tmux 세션(Claude Code, Codex 등)을 브라우저에서 원격으로 보고 조작할 수 있게 하기.

## 핵심 접근

`tmux attach -t <name>`을 node-pty로 spawn → 기존 인프라 100% 재사용.

## 구현 내역

### 서버

- **새 파일:** `packages/server/src/tmux.ts`
  - `listTmuxSessions()`: tmux list-sessions 파싱 (execFile 사용, 인젝션 방지)
  - `tmuxSessionExists()`: tmux has-session 확인
  - tmux 미설치/미실행 시 빈 배열 반환 (graceful degradation)

- **수정:** `packages/server/src/terminal.ts`
  - `TerminalSessionOptions` 인터페이스: `{ cwd?, tmuxSession? }`
  - tmuxSession 있으면 `pty.spawn("tmux", ["attach", "-t", name])`
  - destroy(): tmux 세션이든 일반이든 PTY 프로세스 kill (tmux attach 종료 → 자동 detach, 세션 유지)
  - `TerminalSessionInfo`에 `tmuxSession?` 필드 추가

- **수정:** `packages/server/src/session-manager.ts`
  - `create(name?, options?)` 시그니처 변경
  - tmux 세션 기본 이름: `tmux:<session-name>`

- **수정:** `packages/server/src/index.ts`
  - `GET /api/tmux-sessions` — tmux 세션 목록 (ailyAttached 정보 포함)
  - `POST /api/sessions` — tmuxSession 파라미터 추가, 존재 검증
  - session create에 try/catch 추가 (PTY 스폰 실패 대응)
  - login body guard 추가 (undefined body 방어)

### 클라이언트

- **수정:** `packages/web/src/side-panel.ts`
  - 2섹션 분리: "Aily Sessions" + "tmux Sessions"
  - `TmuxSessionCardInfo` 타입, `onAttachTmux` 콜백
  - tmux 카드: 이름, 윈도우 수, 시각, ailyAttached 상태
  - "No tmux sessions" 빈 상태 표시

- **수정:** `packages/web/src/tab-bar.ts`
  - `SessionInfo`에 `tmuxSession?` 추가
  - tmux 탭에 `[T]` 접두사

- **수정:** `packages/web/src/main.ts`
  - `attachTmuxSession()`, `refreshTmuxSessions()` 함수
  - 10초 주기 tmux 세션 갱신
  - 세션 닫기 시 tmux 목록도 갱신

- **수정:** `packages/web/src/style.css`
  - `.tmux-card` 좌측 초록 보더, `.side-panel-empty`, 섹션 구분선

## Codex 리뷰 결과

| 우선순위 | 이슈 | 수정 |
|---------|------|------|
| P1 | `detach-client -s`가 모든 클라이언트 분리 | PTY kill로 변경 (해당 클라이언트만 detach) |
| P1 | async create에서 스폰 실패 시 에러 미처리 | try/catch 추가 |
| P2 | login body=undefined 시 500 에러 | `req.body \|\| {}` 방어 |
