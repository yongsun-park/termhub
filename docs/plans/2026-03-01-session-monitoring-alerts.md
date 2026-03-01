# 2026-03-01 세션 모니터링 & 알림 구현

## 목표

여러 AI CLI 세션을 동시에 실행할 때, 백그라운드 세션의 에러/완료/승인 요청을 놓치지 않도록 알림 시스템 구축.

## 구현 내역

### Phase A: 서버 패턴 감지 엔진
- **새 파일:** `packages/server/src/output-monitor.ts`
- `OutputMonitor` 클래스: ANSI 스트립 + 라인 버퍼링 + 정규식 패턴 매칭
- 기본 패턴: stack trace, Error:, npm ERR!, command not found, permission denied, 완료, 승인 프롬프트
- 디바운스: 같은 패턴 반복 시 중복 알림 방지
- 500ms 플러시 타이머로 `\n` 없는 승인 프롬프트도 감지
- `SessionManager`에 `OutputMonitor` 통합, `onAlert()` 메서드 노출
- `websocket.ts`에 alert 브로드캐스트 추가

### Phase B: 사이드 패널
- **새 파일:** `packages/web/src/side-panel.ts`
- 접기/펼치기 사이드 패널 (280px, CSS transition)
- 세션 카드: 상태 (●실행중/○종료), 이름, PID, 시각, cwd
- 뱃지 표시, 카드 클릭으로 세션 전환
- 토글: Ctrl+B 또는 ≡ 버튼
- `index.html`에 `#side-panel`, `#main-area` 레이아웃 추가

### Phase C: 토스트 알림
- **새 파일:** `packages/web/src/toast.ts`
- 우상단 슬라이드 인/아웃 토스트
- severity별 색상 (error=#f7768e, warning=#e0af68, info=#7aa2f7)
- 5초 자동 사라짐, × 버튼, 클릭 시 세션 전환

### Phase D: 탭 뱃지
- `tab-bar.ts` 수정: `badges` Map, `addBadge()`, `clearBadge()`, severity 에스컬레이션
- 비활성 탭에만 뱃지 렌더링
- `getSessionName()` 헬퍼 추가

### Phase E: OS 푸시 알림
- **새 파일:** `packages/web/src/notifications.ts`
- `Notification API` 활용, 탭 비활성(`document.hidden`) 시에만 표시
- `tag: "aily-alert"`로 알림 교체

### Phase F: 통합 (main.ts)
- 모든 매니저 초기화: SidePanel, ToastManager, NotificationManager
- ws.onmessage에 `case "alert"` 핸들러 추가
- 백그라운드 세션 알림 → 탭 뱃지 + 사이드 패널 뱃지
- switchSession()에 clearBadge() 추가
- 세션 생성/삭제 시 사이드 패널 갱신

## Codex 리뷰 결과

### Round 1
| 우선순위 | 이슈 | 수정 |
|---------|------|------|
| P2 | `\n` 없는 프롬프트 미감지 | 500ms 플러시 타이머 추가 |
| P3 | stack-trace 정규식: trim으로 선행 공백 제거됨 | trim 대신 원본 라인으로 매칭 |
| P2 | 종료 시 WS 미종료로 프로세스 행 | `wss.clients` 순회하며 close() 호출 |

## 파일 변경 목록

| 파일 | 작업 |
|------|------|
| `packages/server/src/output-monitor.ts` | 새 파일 |
| `packages/server/src/session-manager.ts` | 수정 (OutputMonitor 통합) |
| `packages/server/src/websocket.ts` | 수정 (alert 브로드캐스트) |
| `packages/server/src/index.ts` | 수정 (shutdown WS close) |
| `packages/web/src/side-panel.ts` | 새 파일 |
| `packages/web/src/toast.ts` | 새 파일 |
| `packages/web/src/notifications.ts` | 새 파일 |
| `packages/web/src/tab-bar.ts` | 수정 (badge 지원) |
| `packages/web/src/main.ts` | 수정 (전체 통합) |
| `packages/web/index.html` | 수정 (레이아웃 변경) |
| `packages/web/src/style.css` | 수정 (사이드패널/토스트/뱃지 스타일) |
