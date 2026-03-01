# Aily - 원격 AI 코딩 웹 터미널

## 프로젝트 개요
브라우저에서 원격 PC의 터미널에 접속하여 Claude Code, Codex 등 AI CLI 도구를 사용할 수 있는 웹 인터페이스.

## 기술 스택
- **Runtime**: Node.js + TypeScript
- **Backend**: Express + ws + node-pty
- **Frontend**: xterm.js + Vanilla TS + Vite
- **Package Manager**: pnpm workspace

## 프로젝트 구조
- `packages/server/` - 백엔드 (Express + WebSocket + PTY)
- `packages/web/` - 프론트엔드 (xterm.js)

## 개발 명령어
```bash
pnpm install        # 의존성 설치
pnpm dev            # 개발 서버 실행 (server + web)
pnpm build          # 프로덕션 빌드
pnpm start          # 프로덕션 실행
```

## 컨벤션
- TypeScript strict mode
- ESM (import/export)
- 환경변수는 `.env` 파일 사용 (`.env.example` 참고)
- 커밋 메시지: 한글 또는 영문, 간결하게
