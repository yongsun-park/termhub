# Aily 로드맵

## Phase 1 ~ 4: 웹 터미널 (완료)

브라우저에서 원격 PC의 터미널에 접속하여 AI CLI 도구를 사용할 수 있는 웹 인터페이스.

- pnpm workspace + TypeScript 프로젝트 구조
- Express + ws + node-pty 백엔드
- xterm.js 프론트엔드 (다크 테마, 탭 UI)
- JWT 토큰 인증
- 다중 세션 관리 (생성/전환/종료/재연결)
- 출력 버퍼 보관으로 재접속 시 복원

---

## Phase 5: LLM 오케스트레이터

중앙 LLM이 여러 터미널 세션을 관리하며 멀티 에이전트 작업을 조율하는 기능.

### 아키텍처

```
┌─────────────────────┐
│  Orchestrator LLM    │  ← 작업 분배 / 결과 종합 / 의사결정
│  (Claude, GPT 등)    │
└──────────┬──────────┘
           │ REST API + WebSocket
     ┌─────┼─────┬─────────┐
     ▼     ▼     ▼         ▼
  [세션1] [세션2] [세션3] [세션N]
  Claude  Codex  테스트    빌드
  Code    CLI    실행      서버
```

### 구현 항목

1. **세션 명령 실행 API**
   - `POST /api/sessions/:id/exec` - 세션에 명령 전송 후 결과 대기
   - 출력 수집/파싱하여 JSON 응답으로 반환
   - 타임아웃, 종료 조건 설정 가능

2. **세션 출력 구독 (SSE)**
   - `GET /api/sessions/:id/stream` - Server-Sent Events로 실시간 출력 스트리밍
   - LLM이 세션 출력을 실시간 모니터링 가능

3. **오케스트레이터 엔진**
   - LLM API 연동 (Claude API, OpenAI API 등)
   - 작업 계획 수립 → 세션 할당 → 실행 → 결과 수집 → 다음 단계 판단
   - 세션 간 컨텍스트 공유 메커니즘

4. **작업 정의 스키마**
   ```typescript
   interface Task {
     id: string;
     description: string;
     sessionId?: string;
     status: 'pending' | 'running' | 'completed' | 'failed';
     dependencies: string[];  // 선행 작업 ID
     result?: string;
   }
   ```

5. **웹 UI 확장**
   - 오케스트레이터 대시보드: 작업 흐름 시각화
   - 세션별 작업 상태 표시
   - LLM 대화 로그 뷰어

---

## Phase 6: tmux 통합

AI 도구들이 내부적으로 생성하는 tmux 세션을 감지하고 관리하는 기능.

### 구현 항목

1. **tmux 세션 감지 API**
   - `GET /api/tmux/sessions` - 호스트의 tmux 세션 목록
   - `POST /api/tmux/attach/:name` - tmux 세션에 연결하는 PTY 세션 생성

2. **PTY를 tmux 안에서 생성하는 옵션**
   - 세션 생성 시 `{ tmux: true }` 옵션
   - 재접속 시 tmux가 출력을 보존하므로 더 안정적

3. **웹 UI**
   - tmux 세션 목록 패널
   - 클릭으로 tmux 세션 attach

---

## Phase 7: 채팅 연동

Discord/Slack에서 터미널 세션을 제어하는 봇 인터페이스.

### 구현 항목

1. **Discord 봇**
   - 채널에서 명령 입력 → 지정 세션에 전달
   - 세션 출력을 코드 블록으로 응답
   - 세션 생성/전환/종료 슬래시 커맨드

2. **Slack 앱**
   - 동일한 인터페이스를 Slack에 제공

---

## Phase 8: 다중 사용자 & 보안

### 구현 항목

1. **사용자 계정 관리** (DB 기반)
2. **세션 권한** (소유자/공유/읽기 전용)
3. **HTTPS/TLS 설정**
4. **세션 기록 및 재생** (asciinema 형식)
5. **감사 로그**

---

## 우선순위

| Phase | 내용 | 의존성 |
|-------|------|--------|
| 1-4   | 웹 터미널 (완료) | - |
| 5     | LLM 오케스트레이터 | Phase 1-4 |
| 6     | tmux 통합 | Phase 1-4 |
| 7     | 채팅 연동 | Phase 1-4 |
| 8     | 다중 사용자 & 보안 | Phase 1-4 |

Phase 5~8은 독립적으로 진행 가능하며, 필요에 따라 우선순위 조정.
