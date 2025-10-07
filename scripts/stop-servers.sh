#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0


echo "🛑 Stopping all local servers..."

echo "Stopping backend (uvicorn)..."
if pgrep -f "uvicorn.*rawscribe.main" > /dev/null; then
    # Get the PIDs and kill them
    PIDS=$(pgrep -f "uvicorn.*rawscribe.main")
    echo "  Found uvicorn processes: $PIDS"
    for pid in $PIDS; do
        kill -9 $pid 2>/dev/null
    done
    # Also kill any child processes
    CHILD_PIDS=$(pgrep -P $PIDS 2>/dev/null)
    for pid in $CHILD_PIDS; do
        kill -9 $pid 2>/dev/null
    done
    echo "  Backend stopped"
else
    echo "  (no uvicorn process found)"
fi

echo "Stopping frontend (vite/npm)..."
if pgrep -f "vite" > /dev/null; then
    PIDS=$(pgrep -f "vite")
    for pid in $PIDS; do
        kill -9 $pid 2>/dev/null
    done
    echo "  Frontend stopped"
elif pgrep -f "npm.*dev" > /dev/null; then
    PIDS=$(pgrep -f "npm.*dev")
    for pid in $PIDS; do
        kill -9 $pid 2>/dev/null
    done
    echo "  Frontend stopped"
else
    echo "  (no vite/npm process found)"
fi

echo "✅ All servers stopped"
