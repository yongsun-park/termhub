# 2026-03-01 웹 터미널 구현

## 목표

브라우저에서 원격 PC의 터미널에 접속하여 Claude Code, Codex 등 AI CLI 도구를 사용할 수 있는 웹 인터페이스 구축.

## 기술 스택

| 영역 | 기술 |
|------|------|
| Runtime | Node.js + TypeScript |
| Backend | Express + ws + node-pty |
| Frontend | xterm.js v5 + Vanilla TS |
| Build | tsup (backend) + Vite (frontend) |
| Package Manager | pnpm workspace |

## 구현 내역

### Phase 1: 프로젝트 초기화
- pnpm workspace 설정 (root `package.json`, `pnpm-workspace.yaml`)
- TypeScript 공통 설정 (`tsconfig.base.json`)
- `packages/server`, `packages/web` 패키지 생성 및 의존성 설치
- `CLAUDE.md` 작성

### Phase 2: 백엔드 터미널 서버
- `server/src/index.ts` — Express HTTP + WebSocket 업그레이드 (포트 4000)
- `server/src/session-manager.ts` — 다중 세션 관리 (생성/조회/삭제)
- `server/src/terminal.ts` — node-pty 기반 개별 PTY 세션, 출력 버퍼 보관
- `server/src/websocket.ts` — WebSocket 메시지 프로토콜 (attach/input/resize/heartbeat)
- `server/src/auth.ts` — 환경변수 비밀번호 + JWT 토큰 인증
- REST API: `GET/POST /api/sessions`, `DELETE /api/sessions/:id`, `POST /api/login`

### Phase 3: 프론트엔드 웹 터미널
- `web/src/terminal.ts` — xterm.js + addon-fit + addon-webgl + addon-search, 자동 리사이즈
- `web/src/tab-bar.ts` — 세션 탭 UI (생성/전환/종료), 단축키 (Ctrl+T/W/Tab)
- `web/src/main.ts` — 로그인 → 세션 목록 복원 → WebSocket 연결/재연결
- `web/src/style.css` — 다크 테마 (Tokyo Night), 모바일 기본 반응형
- `web/index.html` — SPA 구조

### Phase 4: 개발 환경 & 빌드
- tsup (server, node-pty external) + Vite (web, proxy to :4000)
- `pnpm dev` — server + web 동시 실행
- `pnpm build && pnpm start` — 프로덕션 빌드/실행

## Codex 코드 리뷰 결과 및 수정

### 1차 리뷰 (4건 발견, 전부 수정)
| 우선순위 | 이슈 | 수정 |
|---------|------|------|
| P1 | 출력이 `currentSessionId`로 라우팅 → 탭 전환 중 다른 세션 출력이 잘못된 탭에 표시 | 서버에서 output/snapshot/exit에 `sessionId` 포함, 클라이언트에서 sessionId 기반 라우팅 |
| P1 | 탭 전환 시 snapshot이 기존 터미널 위에 중복 추가 | `terminal.reset()` 후 snapshot 적용 |
| P2 | `req.params.id`가 `string \| string[]` 타입 → tsc 에러 | 배열 처리 추가 |
| P3 | `getInfo().cwd`가 항상 `"/"` 반환 | `initialCwd` 필드로 생성 시 cwd 보관 |

### 2차 리뷰 (2건 발견, 전부 수정)
| 우선순위 | 이슈 | 수정 |
|---------|------|------|
| P1 | `snapshotApplied` Set이 두 번째 이후 snapshot을 무시 → 중간 출력 누락 | Set 제거, 매번 `reset()` + `write()` |
| P2 | resize 메시지 미검증 → cols/rows=0이면 node-pty 크래시 | `Number.isFinite`, `> 0` 검증 추가 |

### 3차 리뷰 (P1 0건, P2 2건 수정)
| 우선순위 | 이슈 | 수정 |
|---------|------|------|
| P2 | WS reconnect 시 resize 미전송 → PTY 80x24 고정 | `onopen`에서 attach 후 resize 전송 |
| P2 | 이미 삭제된 세션 close 시 DELETE 404 → 로컬 탭 정리 안 됨 | try/catch로 감싸서 로컬 정리 보장 |

## 논의 사항

- **모바일**: 터미널 특성상 한계. 향후 Discord 연동 또는 별도 채팅형 UI로 대응 예정
- **포트**: 3000 → 4000 변경 (충돌 방지)
- **tmux**: 현재 터미널에서 tmux 명령어 직접 사용 가능. 전용 UI 통합은 Phase 6에서
- **LLM 오케스트레이터**: 현재 REST API + WebSocket 구조로 자연스럽게 확장 가능. Phase 5에서 구현 예정
- **기술 스택**: FastAPI/Rust 대비 Node.js가 node-pty + xterm.js 생태계에서 사실상 표준

## 관련 문서

- [ROADMAP.md](../ROADMAP.md) — Phase 5~8 확장 계획 (LLM 오케스트레이터, tmux 통합, 채팅 연동, 다중 사용자)
