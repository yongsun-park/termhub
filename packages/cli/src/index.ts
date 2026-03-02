import { parseArgs } from "node:util";
import { createInterface } from "node:readline";
import { ApiClient } from "./api.js";
import { saveConfig, loadConfig } from "./config.js";

const USAGE = `Usage: termhub <command> [options]

Commands:
  login                          Authenticate and save token
  sessions list                  List all sessions
  sessions create [--name NAME] [--cwd PATH]  Create a session
  sessions delete <id>           Delete a session
  exec <session-id> "command"    Execute a command in a session
  send <id|tmux:name> "text"     Send prompt to Claude Code session
  status <id|tmux:name>          Check Claude Code session state
  output <session-id> [--last N] Get session output
  write <session-id> "text"      Write raw text to a session
  tmux list                      List tmux sessions
  tmux attach <name>             Attach to a tmux session
  stream <session-id>            Stream session output (SSE)

Environment:
  TERMHUB_URL    Server URL (default: http://localhost:4000)
  TERMHUB_TOKEN  Auth token

Config: ~/.termhubrc (JSON: { "url": "...", "token": "..." })
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(USAGE);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "login":
      await cmdLogin();
      break;
    case "sessions":
      await cmdSessions(args.slice(1));
      break;
    case "exec":
      await cmdExec(args.slice(1));
      break;
    case "send":
      await cmdSend(args.slice(1));
      break;
    case "status":
      await cmdStatus(args.slice(1));
      break;
    case "output":
      await cmdOutput(args.slice(1));
      break;
    case "write":
      await cmdWrite(args.slice(1));
      break;
    case "tmux":
      await cmdTmux(args.slice(1));
      break;
    case "stream":
      await cmdStream(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

async function cmdLogin(): Promise<void> {
  const config = loadConfig();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const url = await new Promise<string>((resolve) => {
    rl.question(`Server URL [${config.url}]: `, (answer) => {
      resolve(answer.trim() || config.url);
    });
  });

  const password = await new Promise<string>((resolve) => {
    rl.question("Password: ", (answer) => {
      resolve(answer.trim());
    });
  });
  rl.close();

  if (!password) {
    console.error("Password is required");
    process.exit(1);
  }

  // Temporarily set url for login
  process.env.TERMHUB_URL = url;
  const client = new ApiClient();
  const token = await client.login(password);
  saveConfig({ url, token });
  console.log("Logged in successfully. Config saved to ~/.termhubrc");
}

async function cmdSessions(args: string[]): Promise<void> {
  const sub = args[0];
  const client = new ApiClient();

  switch (sub) {
    case "list":
    case undefined: {
      const sessions = await client.sessionsList();
      if ((sessions as unknown[]).length === 0) {
        console.log("No sessions");
        return;
      }
      console.log(JSON.stringify(sessions, null, 2));
      break;
    }
    case "create": {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          name: { type: "string" },
          cwd: { type: "string" },
        },
        allowPositionals: false,
      });
      const session = await client.sessionsCreate(values.name, values.cwd);
      console.log(JSON.stringify(session, null, 2));
      break;
    }
    case "delete": {
      const id = args[1];
      if (!id) {
        console.error("Usage: termhub sessions delete <id>");
        process.exit(1);
      }
      await client.sessionsDelete(id);
      console.log("Deleted");
      break;
    }
    default:
      console.error(`Unknown sessions subcommand: ${sub}`);
      process.exit(1);
  }
}

async function cmdExec(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      "quiet-ms": { type: "string" },
      "timeout": { type: "string" },
      "end-pattern": { type: "string" },
    },
    allowPositionals: true,
  });

  const sessionId = positionals[0];
  const command = positionals.slice(1).join(" ");

  if (!sessionId || !command) {
    console.error('Usage: termhub exec <session-id> "command"');
    process.exit(1);
  }

  const client = new ApiClient();
  const result = await client.exec(sessionId, command, {
    quietMs: values["quiet-ms"] ? parseInt(values["quiet-ms"], 10) : undefined,
    timeoutMs: values["timeout"] ? parseInt(values["timeout"], 10) : undefined,
    endPattern: values["end-pattern"],
  });

  process.stdout.write(result.output);
  if (result.timedOut) {
    console.error("\n[timed out]");
  }
}

async function cmdSend(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      "no-submit": { type: "boolean" },
      "no-wait": { type: "boolean" },
      "timeout": { type: "string" },
      "quiet-ms": { type: "string" },
    },
    allowPositionals: true,
  });

  const target = positionals[0];
  const text = positionals.slice(1).join(" ");

  if (!target || !text) {
    console.error('Usage: termhub send <id|tmux:name> "text"');
    process.exit(1);
  }

  const client = new ApiClient();
  const result = await client.send(target, text, {
    submit: !values["no-submit"],
    waitForIdle: !values["no-wait"],
    timeoutMs: values["timeout"] ? parseInt(values["timeout"], 10) : undefined,
    quietMs: values["quiet-ms"] ? parseInt(values["quiet-ms"], 10) : undefined,
  });

  process.stdout.write(result.output);
  if (result.timedOut) {
    console.error("\n[timed out]");
  }
  console.error(`[state: ${result.state}] [${result.durationMs}ms] [session: ${result.sessionId}]`);
}

async function cmdStatus(args: string[]): Promise<void> {
  const target = args[0];
  if (!target) {
    console.error("Usage: termhub status <id|tmux:name>");
    process.exit(1);
  }

  const client = new ApiClient();
  const result = await client.status(target);
  console.log(JSON.stringify(result, null, 2));
}

async function cmdOutput(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      last: { type: "string" },
    },
    allowPositionals: true,
  });

  const sessionId = positionals[0];
  if (!sessionId) {
    console.error("Usage: termhub output <session-id> [--last N]");
    process.exit(1);
  }

  const client = new ApiClient();
  const result = await client.output(sessionId, values.last ? parseInt(values.last, 10) : undefined);
  process.stdout.write(result.output);
}

async function cmdWrite(args: string[]): Promise<void> {
  const sessionId = args[0];
  const text = args.slice(1).join(" ");

  if (!sessionId || !text) {
    console.error('Usage: termhub write <session-id> "text"');
    process.exit(1);
  }

  const client = new ApiClient();
  await client.write(sessionId, text);
  console.log("Written");
}

async function cmdTmux(args: string[]): Promise<void> {
  const sub = args[0];
  const client = new ApiClient();

  switch (sub) {
    case "list":
    case undefined: {
      const sessions = await client.tmuxList();
      if ((sessions as unknown[]).length === 0) {
        console.log("No tmux sessions");
        return;
      }
      console.log(JSON.stringify(sessions, null, 2));
      break;
    }
    case "attach": {
      const name = args[1];
      if (!name) {
        console.error("Usage: termhub tmux attach <name>");
        process.exit(1);
      }
      const session = await client.tmuxAttach(name);
      console.log(JSON.stringify(session, null, 2));
      break;
    }
    default:
      console.error(`Unknown tmux subcommand: ${sub}`);
      process.exit(1);
  }
}

async function cmdStream(args: string[]): Promise<void> {
  const sessionId = args[0];
  if (!sessionId) {
    console.error("Usage: termhub stream <session-id>");
    process.exit(1);
  }

  const client = new ApiClient();
  const url = client.streamUrl(sessionId);
  const token = client.getToken();

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
  });

  if (!res.ok) {
    console.error(`Stream error: HTTP ${res.status}`);
    process.exit(1);
  }

  if (!res.body) {
    console.error("No response body");
    process.exit(1);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let eventType = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7);
      } else if (line.startsWith("data: ")) {
        const raw = line.slice(6);
        try {
          const data = JSON.parse(raw);
          switch (eventType) {
            case "snapshot":
            case "output":
              process.stdout.write(data.data ?? "");
              break;
            case "alert":
              console.error(`\n[alert:${data.severity}] ${data.message}`);
              break;
            case "exit":
              console.error(`\n[exit: code ${data.code}]`);
              break;
          }
        } catch {
          // ignore malformed data
        }
        eventType = "";
      }
    }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
