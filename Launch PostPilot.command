#!/bin/bash
# Double-click this file to start PostPilot. No terminal typing required.
cd "$(dirname "$0")"

echo "Starting PostPilot..."
echo ""

# One-time setup: install dependencies if this is the first run.
if [ ! -d "node_modules" ]; then
  echo "First time setup — this may take a few minutes. Please wait..."
  npm install
  npx playwright install chromium
  echo ""
  echo "Setup complete!"
  echo ""
fi

# Open the browser automatically once the server is ready.
(
  for i in $(seq 1 60); do
    if curl -s http://localhost:8080 > /dev/null 2>&1; then
      open "http://localhost:8080"
      break
    fi
    sleep 1
  done
) &

echo "Launching PostPilot — keep this window open while you work."
echo "Close this window to stop PostPilot."
echo ""

npm run dev
