여러 TermHub 세션을 생성하고 작업을 분배합니다.

$ARGUMENTS 에서 작업 설명을 파싱하세요.

1. `termhub sessions list`로 현재 세션 확인
2. 필요한 세션 생성: `termhub sessions create --name <name>`
3. 각 세션에 작업 할당: `termhub exec <id> "<command>"`
4. 주기적으로 결과 확인: `termhub output <id> --last 50`
5. 모든 작업 완료 시 결과를 종합하여 보고

작업 상태를 추적하면서 진행하세요.
에러가 발생한 세션은 재시도하거나 대체 방안을 제시하세요.
