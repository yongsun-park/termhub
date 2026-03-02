# Quick Launch 제거 및 오케스트레이터 대시보드 보류

## 완료일: 2026-03-01

## 배경

Phase 5D에서 Quick Launch (Claude Code / Codex / Shell 프리셋 버튼)를 추가했으나,
사용자가 직접 세션을 열고 `cd` + `claude`/`codex` 입력하는 방식이 더 자연스럽다고 판단하여 제거.

## 변경 내용

### Quick Launch 제거

| 파일 | 변경 |
|------|------|
| `packages/web/src/side-panel.ts` | `SessionPreset` 타입, `onCreatePreset` 콜백, Quick Launch DOM 생성 코드 제거 |
| `packages/web/src/main.ts` | `SessionPreset` import, `PRESET_COMMANDS`, `createPresetSession()` 함수, `onCreatePreset` 콜백 제거 |
| `packages/web/src/style.css` | `.quick-launch-grid`, `.quick-launch-btn`, `.quick-launch-icon`, `.quick-launch-label`, `.preset-*` 스타일 제거 |

## 아키텍처 결정: 오케스트레이터 대시보드 보류

### 현재 구조 (피어 모델)
- 모든 세션이 skill(`termhub-orchestrate` 등)을 통해 다른 세션을 제어 가능
- 별도 오케스트레이터 세션 타입 불필요
- 어떤 세션이든 Claude Code skill 호출 시 오케스트레이터로 동작

### 오케스트레이터/워커 분리를 보류한 이유
- 세션 타입 관리, 타입별 UI 분기 등 불필요한 복잡도 증가
- 워커가 다른 워커를 제어하는 케이스에서 경계 모호
- 실사용 패턴에서 동시 오케스트레이션 충돌 가능성 낮음

### 향후 필요시 고려할 방어 장치
- 세션별 write lock (한 번에 하나의 외부 세션만 write 가능)
- 세션 생성 상한 (최대 N개)
- `exec` API에 caller 식별자 로깅
- 모니터링이 필요하면 오케스트레이터 세션이 아닌 웹 UI 모니터링 패널로 해결
