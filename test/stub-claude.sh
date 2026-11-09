#!/bin/sh
# Stands in for `claude` in tests: says how it was started, sends the hook events Claude Code
# would (through the app's hook script), and answers each line typed:
#   anything  -> UserPromptSubmit, "you said: …", Stop
#   ask …     -> UserPromptSubmit, then a permission Notification
#   exit      -> SessionEnd, then exits
hook="$(dirname "$CLIENT_SESSIONS_SETTINGS")/hook.sh"
id=""
resumed=""
name=""
while [ $# -gt 0 ]; do
  case "$1" in
    --session-id) id="$2"; shift ;;
    --resume) id="$2"; resumed=" (resumed)"; shift ;;
    --name) name=" named $2"; shift ;;
  esac
  shift
done
event() { printf '{"hook_event_name":"%s","session_id":"%s"%s}' "$1" "$id" "$2" | /bin/sh "$hook"; }
echo "stub claude in $(pwd) session $id$resumed$name"
event SessionStart ',"source":"startup"'
while IFS= read -r line; do
  case "$line" in
    exit) event SessionEnd ''; exit 0 ;;
    ask*) event UserPromptSubmit ",\"prompt\":\"$line\""; event Notification ',"message":"Claude needs your permission to use Bash","notification_type":"permission_prompt"' ;;
    *) event UserPromptSubmit ",\"prompt\":\"$line\""; echo "you said: $line"; event Stop '' ;;
  esac
done
