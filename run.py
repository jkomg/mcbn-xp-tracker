from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parent
runpy.run_path(str(ROOT / "apps" / "web" / "run.py"), run_name="__main__")
