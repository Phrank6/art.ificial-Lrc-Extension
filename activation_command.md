# Terminal 1
cd /Users/franklv/Documents/probservatory/art.ificial-Lrc-Extension/.claude/worktrees/zen-vaughan-dd5733/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2
cd /Users/franklv/Documents/probservatory/art.ificial-Lrc-Extension/.claude/worktrees/zen-vaughan-dd5733/frontend
npm run dev   # already installed, node_modules is there