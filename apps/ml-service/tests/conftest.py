import sys
from pathlib import Path

# Make app modules importable as `import model`, `import router`, etc.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
