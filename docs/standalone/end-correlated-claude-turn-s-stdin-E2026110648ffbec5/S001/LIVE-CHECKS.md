# Live checks for ISSUE-48ffbec56130edb6 (real claude CLI, 2026-11-06)

Throwaway scripts (not committed): a Node script that spawns claude -p with --input-format=stream-json and writes one user message with a request uuid, then closes stdin per mode. Output below is verbatim.

### mid (stdin closed 5 s into a 12 s tool turn)
0.0s sent
2.5s assistant tool_use:Bash
5.0s closing stdin mid-turn
15.6s assistant text
15.6s RESULT is_error=false uuid_match=true text=DONE
16.2s EXIT code=0 sig=null resultSeen=true

### after (stdin closed at the correlated result, background task running 20 s)
0.0s sent
2.5s assistant tool_use:Bash
3.5s assistant text
3.5s RESULT is_error=false uuid_match=true text=DONE
25.1s assistant text
25.1s RESULT is_error=false uuid_match=false text=The background command finished with exit code 0, so it shou
25.7s EXIT code=0 sig=null resultSeen=true
bg.txt present: bg.txt

### none (stdin never closed)
0.0s sent
2.7s assistant tool_use:Bash
15.8s assistant text
15.8s RESULT is_error=false uuid_match=true text=DONE
75.1s TIMEOUT 75s: process still alive, killing
75.1s EXIT code=null sig=SIGKILL resultSeen=true
