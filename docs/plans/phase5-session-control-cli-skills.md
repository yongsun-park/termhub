# Phase 5: 세션 제어 인프라 + CLI + Skills

## 완료일: 2026-03-01

## 구현 내용

### 5A: Exec API + SSE (서버 인프라)

| 파일 | 설명 |
|------|------|
| `packages/server/src/ansi.ts` | `stripAnsi()` 공용 유틸리티 (output-monitor.ts에서 추출) |
| `packages/server/src/exec.ts` | `POST /api/sessions/:id/exec` 핸들러 |
| `packages/server/src/sse.ts` | `GET /api/sessions/:id/stream` SSE 핸들러 |
| `packages/server/src/index.ts` | exec, stream, write, output 라우트 추가 |
| `packages/server/src/output-monitor.ts` | stripAnsi를 ansi.ts에서 import하도록 변경 |

**새 API 엔드포인트:**
- `POST /api/sessions/:id/exec` — 명령 실행 (quietMs, timeoutMs, endPattern 지원)
- `GET /api/sessions/:id/stream` — SSE 실시간 스트림 (snapshot, output, alert, exit 이벤트 + 15s heartbeat)
- `POST /api/sessions/:id/write` — 세션에 raw 텍스트 쓰기
- `GET /api/sessions/:id/output` — 세션 출력 버퍼 조회 (?last=N 지원)

### 5B: CLI 도구

`packages/cli/` 패키지 생성:
- `src/config.ts` — `~/.termhubrc` 설정 + 환경변수 지원
- `src/api.ts` — REST API 클라이언트
- `src/index.ts` — CLI 엔트리포인트

**명령어:**
- `termhub login` — 인증 토큰 발급
- `termhub sessions list/create/delete`
- `termhub exec <id> "command"` — 명령 실행
- `termhub output <id>` — 출력 조회
- `termhub write <id> "text"` — 텍스트 쓰기
- `termhub tmux list/attach`
- `termhub stream <id>` — SSE 실시간 스트림

### 5C: Claude Code Skills

`.claude/commands/` 에 6개 skill 생성:
- `termhub-sessions.md` — 세션 목록 조회
- `termhub-create.md` — 세션 생성
- `termhub-exec.md` — 명령 실행
- `termhub-output.md` — 출력 조회
- `termhub-stream.md` — 실시간 모니터링
- `termhub-orchestrate.md` — 다중 세션 오케스트레이션

### 5D: Web UI 개선

- `packages/web/src/side-panel.ts` — Quick Launch 섹션 추가 (Claude Code / Codex / Shell 프리셋)
- `packages/web/src/main.ts` — 프리셋 세션 생성 + 자동 CLI 실행
- `packages/web/src/style.css` — Quick Launch 버튼 스타일

## 빌드 검증

- Server: 빌드 성공 (18.66 KB)
- Web: 빌드 성공 (421.56 KB)
- CLI: 빌드 성공 (10.26 KB)
- CLI help 출력 정상
