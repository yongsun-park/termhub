Claude Code 세션에 프롬프트를 전송하고 응답을 받습니다.

$ARGUMENTS 를 파싱하여 대상 세션(session-id 또는 tmux:name)과 보낼 텍스트를 추출하세요.

## 사용법

1. 먼저 대상 세션의 상태를 확인하세요:
   ```
   termhub status <id|tmux:name>
   ```

2. 상태에 따라 적절히 처리하세요:
   - **idle**: 바로 프롬프트를 보낼 수 있습니다
   - **processing**: 처리 중이므로 잠시 기다렸다가 다시 확인하세요
   - **awaiting_edit**: `termhub send <id> "y"` 또는 `"n"` 으로 편집을 수락/거부하세요
   - **awaiting_input**: y/n 프롬프트 등에 응답하세요

3. 프롬프트를 전송하세요:
   ```
   termhub send <id|tmux:name> "보낼 텍스트"
   ```

4. 결과를 사용자에게 보여주고, Claude Code의 응답을 요약/분석해주세요.

## 옵션

- `--timeout N`: 최대 대기 시간 (ms, 기본: 300000)
- `--quiet-ms N`: 상태 안정 확인 시간 (ms, 기본: 3000)
- `--no-wait`: 응답을 기다리지 않고 즉시 반환

## 참고

- `tmux:name` 형태로 지정하면 tmux 세션이 자동으로 TermHub에 연결됩니다
- 결과의 stderr에 `[state: ...]` 와 `[session: ...]` 이 표시됩니다
- 여러 세션에 병렬로 전송할 수 있습니다 (각각 별도 명령)
