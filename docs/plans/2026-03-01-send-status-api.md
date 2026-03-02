# Send/Status API - Claude Code 세션 제어 개선

**날짜**: 2026-03-01
**상태**: 완료

## 배경

브라우저에서 tmux로 실행 중인 Claude Code를 제어할 때 `tmux send-keys` + `sleep` + `tmux capture-pane`을 반복해야 했음:
- Enter 키가 Claude Code에서 줄바꿈으로 처리됨 (submit 안됨)
- 전체 터미널 캡처 → ANSI 코드, UI 장식 → 토큰 낭비
- 폴링 기반 → 느리고 비효율적
- Claude Code 상태(idle/processing/awaiting_edit) 감지 불가

## 구현 내용

### 새 파일
- `packages/server/src/claude-state.ts` — Claude Code 상태 감지
- `packages/server/src/resolve-session.ts` — 세션 해석 (tmux: 자동 연결)
- `packages/server/src/send.ts` — Send 핸들러
- `packages/server/src/__tests__/claude-state.test.ts` — 상태 감지 테스트
- `.claude/commands/termhub-send.md` — 스킬

### 수정 파일
- `packages/server/src/index.ts` — /send, /status 라우트 추가
- `packages/server/src/tmux.ts` — tmuxCapturePane() 함수 추가
- `packages/cli/src/api.ts` — send(), status() 메서드
- `packages/cli/src/index.ts` — send, status CLI 명령어

### API 엔드포인트
- `POST /api/sessions/:id/send` — 텍스트 전송 + 응답 대기
- `GET /api/sessions/:id/status` — Claude Code 상태 조회

### CLI 명령어
- `termhub send <id|tmux:name> "text"` — 프롬프트 전송
- `termhub status <id|tmux:name>` — 상태 확인

## 핵심 발견 및 해결

1. **Claude Code paste 동작**: `text\r`을 한 번에 보내면 paste로 처리됨 → 텍스트와 `\r`을 100ms 간격으로 분리 전송
2. **tmux 출력 버퍼 vs 렌더링**: tmux attach PTY의 raw 출력은 escape 시퀀스가 뒤섞여 파싱 불가 → `tmux capture-pane`으로 렌더링된 화면 사용
3. **`❯` 프롬프트 오감지**: Claude Code 처리 중에도 화면 하단에 `❯`가 항상 보임 → idle 패턴에서 제거, `? for shortcuts`만 사용
4. **processing 오감지**: `Working`, `Searching` 같은 단어가 응답에 포함됨 → 스피너 문자(`✽`) + 단어 + 말줄임표(`…`) 조합 패턴으로 변경
5. **초기 idle 오감지**: 프롬프트 전송 후 처리 시작 전 잠시 idle로 보임 → 2단계 접근: 화면 변경 감지 → idle 대기
6. **리스너 등록 타이밍**: 쓰기 후 리스너 등록하면 빠른 응답 놓침 → 리스너 먼저 등록 후 쓰기
7. **delta 추출**: 짧은 프롬프트(`y`) lastIndexOf 오류 → `❯ {prompt}` 마커 기반 추출

## 검증 결과

- 단위 테스트: 41개 통과
- 병렬 전송 테스트: 2개 세션 동시 전송/응답 성공
- 상태 감지: idle, processing, awaiting_edit, awaiting_input 모두 정확
- Codex 코드 리뷰 반영: P1/P2 이슈 3건 수정
