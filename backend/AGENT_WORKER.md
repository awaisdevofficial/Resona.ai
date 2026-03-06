# Agent worker – run once

## Voice call behavior (barge-in and response)

- **Interruptions:** The agent stops when you start speaking. Key settings in `agent_worker.py`:
  - `turn_detection="vad"` so the agent reacts to voice activity immediately (with `"stt"` it waited for speech-to-text, so it often finished its sentence first).
  - `aec_warmup_duration=0` so barge-in works from the very start.
  - `min_interruption_duration=0.08` so brief user speech triggers a stop.
  - `false_interruption_timeout=None` and `resume_false_interruption=False` so the agent does not auto-resume after you interrupt.
- **Fast response:** `preemptive_generation=True` and short prompts keep replies quick. If the agent still doesn’t stop when you speak, check that only one worker is running and that the user’s mic is unmuted in the test call UI.

**CLI:** Use `python agent_worker.py start` (production) or `python agent_worker.py dev` (development). There is no `run` command.

**Port 8081 in use:** The worker’s HTTP server binds to 8081 by default. If you see “address already in use”, either:
- Run only one worker: stop the systemd worker before running manually (`sudo systemctl stop resona-agent` then `python agent_worker.py start`), or
- Use another port: `LIVEKIT_AGENT_HTTP_PORT=8082 python agent_worker.py start`

Only **one** agent worker process should be running per LiveKit server. If you run it in both places, you get duplicate workers and odd behavior (e.g. jobs claimed by both, LLM/API errors under load).

- **On the server (Ubuntu):** Run it **only** via systemd: `sudo systemctl start resona-agent`. Do **not** also run `python agent_worker.py start` in a terminal or venv on the same machine.
- **Local dev:** Run the worker in your venv only when you need to test; stop the server’s worker or use a different LiveKit dev server so only one worker is active.

## Check for duplicate workers (on server)

```bash
# Is the systemd service running?
sudo systemctl status resona-agent

# Any other python processes running the agent worker?
ps aux | grep agent_worker
# or
pgrep -af agent_worker
```

If you see the systemd service **and** another `python ... agent_worker` process, stop the manual one (e.g. exit the terminal or kill the PID).

## LLM connection errors (APIConnectionError / APIStatusError)

If logs show `APIConnectionError` or `APIStatusError` in `_llm_inference_task` / `llm_node`, the worker is failing to talk to the **Groq** API (LLM). Check:

1. **GROQ_API_KEY** is set in the environment used by the agent worker (e.g. in the systemd unit’s env or `backend/.env`).
2. Server can reach Groq: `curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models`.
3. Rate limits or quota on your Groq account.

Full error line:

```bash
sudo journalctl -u resona-agent -n 200 --no-pager
```

## Agent worker issues (test call / web call not connecting)

If the **backend** returns 200 for web-call-token but the **agent never joins** or the call fails:

1. **Worker must connect to the same LiveKit as the backend**
   - Worker uses `LIVEKIT_URL` (WebSocket), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` from env (e.g. from `backend/.env` or the systemd unit).
   - On the server, `LIVEKIT_URL` can be the public URL (e.g. `wss://resonaai.duckdns.org/livekit`) or the internal one (e.g. `ws://127.0.0.1:7880`) if the worker runs on the same host as LiveKit. Keys must match the backend and LiveKit server.

2. **Worker needs to reach the backend for internal APIs**
   - `API_BASE_URL` must be the URL the worker can use to call the backend (e.g. `http://127.0.0.1:8000` or `http://172.31.18.18:8000` when the backend is in Docker on the same host).
   - `INTERNAL_SECRET` must match the backend’s `INTERNAL_SECRET` for `/internal/*` routes (e.g. transcript, default-agent).

3. **Required API keys in the worker’s env**
   - `DEEPGRAM_API_KEY` (STT), `GROQ_API_KEY` (LLM), `CARTESIA_API_KEY` (TTS). If any are missing, the worker can accept the job but will error when starting the voice session.

4. **Check worker logs**
   ```bash
   sudo journalctl -u resona-agent -n 100 --no-pager
   ```
   Look for “Agent job started room=…”, connection errors, or Groq/Deepgram/Cartesia errors.

5. **Systemd env**
   If the unit doesn’t load `backend/.env`, set the variables in the unit file (e.g. `Environment=LIVEKIT_URL=wss://...`) or use `EnvironmentFile=/opt/resona/app/backend/.env`.
