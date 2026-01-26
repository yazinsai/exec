#!/bin/bash

# Voice Listener - Start both workers
# Usage: ./start.sh [--once] [--help]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Help function
show_help() {
  echo -e "${BLUE}Voice Listener - Start Script${NC}"
  echo ""
  echo "Usage: ./start.sh [OPTIONS]"
  echo ""
  echo "Options:"
  echo "  --once     Run workers once and exit after processing"
  echo "  --help, -h Show this help message"
  echo ""
  echo "Description:"
  echo "  Starts both the extraction and execution workers for voice action processing."
  echo "  Workers run continuously until interrupted (Ctrl+C) unless --once is used."
  exit 0
}

# Check for help flag
if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
  show_help
fi

# Trap to kill both processes on exit
cleanup() {
  echo -e "\n${YELLOW}Shutting down workers...${NC}"
  kill $EXTRACT_PID $EXECUTE_PID 2>/dev/null
  wait $EXTRACT_PID $EXECUTE_PID 2>/dev/null
  echo -e "${GREEN}Done.${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Voice Listener - Starting...       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if --once flag is passed
ONCE_FLAG=""
if [[ "$1" == "--once" ]]; then
  ONCE_FLAG="--once"
  echo -e "${YELLOW}Running in ONCE mode (will exit after processing)${NC}"
  echo ""
fi

# Start extraction worker
echo -e "${GREEN}[1/2] Starting extraction worker...${NC}"
bun run src/index.ts $ONCE_FLAG 2>&1 | sed 's/^/[extract] /' &
EXTRACT_PID=$!

# Small delay to stagger startup
sleep 1

# Start execution worker
echo -e "${GREEN}[2/2] Starting execution worker...${NC}"
bun run src/action-executor.ts $ONCE_FLAG 2>&1 | sed 's/^/[execute] /' &
EXECUTE_PID=$!

echo ""
echo -e "${BLUE}Both workers running. Press Ctrl+C to stop.${NC}"
echo ""

# Wait for both processes
wait $EXTRACT_PID $EXECUTE_PID
