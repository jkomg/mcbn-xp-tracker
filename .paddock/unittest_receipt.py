"""Run discovery and write a completion receipt only after unittest returns."""
import argparse
import json
import os
from pathlib import Path
import sys
import unittest

p = argparse.ArgumentParser()
p.add_argument('-s', '--start-directory', default='tests')
p.add_argument('-p', '--pattern', default='test*.py')
a = p.parse_args()
# Match python -m unittest: project modules must be importable when this adapter
# is executed by path from .paddock/.
sys.path.insert(0, os.getcwd())
suite = unittest.defaultTestLoader.discover(a.start_directory, pattern=a.pattern)
r = unittest.TextTestRunner(verbosity=2).run(suite)
failed = len(r.failures) + len(r.errors) + len(r.unexpectedSuccesses)
skipped = len(r.skipped) + len(r.expectedFailures)
receipt = {'completed': True, 'passed': max(0, r.testsRun - failed - skipped), 'failed': failed, 'skipped': skipped}
Path(os.environ['PADDOCK_CHECK_RECEIPT']).write_text(json.dumps(receipt), encoding='utf-8')
sys.exit(0 if r.wasSuccessful() else 1)
