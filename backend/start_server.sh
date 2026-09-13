#!/bin/bash

# StudyFocus AI Server Startup Script
echo "🚀 Starting StudyFocus AI Server..."

# Activate virtual environment if one exists
if [ -f myenv/bin/activate ]; then
    source myenv/bin/activate
else
    echo "⚠️  No myenv/ virtualenv found, using system python3"
fi

# Check if port 8001 is available, otherwise try 8002, 8003, etc.
PORT=8001
while lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null; do
    echo "⚠️  Port $PORT is busy, trying port $((PORT+1))..."
    PORT=$((PORT+1))
done

echo "🌐 Starting server on http://0.0.0.0:$PORT"
echo "📚 StudyFocus AI is ready for your deep work session!"
echo "💡 Press CTRL+C to stop the server"
echo ""

# Start the server
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port $PORT