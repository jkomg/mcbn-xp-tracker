#!/usr/bin/env python3
"""Paddock's portable onboarding, project and evidence CLI (Python 3.11+)."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PureWindowsPath
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid

VERSION = "0.1.0-preview"
ROLES = ("coordinator", "builder", "reviewer", "adversary")
PROVIDERS = ("claude", "codex", "gemini", "litellm", "cursor")
MARKER = "<!-- paddock-crew -->"


def fail(message):
    raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def digest(value):
    return sha(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def read(path):
    data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict):
        fail("Expected a JSON object: " + str(path))
    return data


def write_atomic(path, content):
    """Replace a file in one step: readers never see a half-written file, and a crash
    leaves either the old content or the new. Returns the SHA-256 of what is on disk."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name("." + path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with open(tmp, "wb") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        delay = 0.01
        for attempt in range(20):
            try:
                os.replace(tmp, path)
                break
            except PermissionError:
                if attempt == 19:
                    raise
                time.sleep(delay)
                delay = min(delay * 2, 0.25)
    finally:
        if tmp.exists():
            tmp.unlink()
    return proven(path, content)


def proven(path, content):
    """Re-read a file just written and prove it holds the intended bytes."""
    actual = Path(path).read_bytes()
    if actual != content:
        fail("Wrote " + str(path) + " but it does not hold the intended content")
    return sha(actual)


def save(path, data):
    return write_atomic(path, (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))


def emit(data):
    print(json.dumps(data, indent=2, ensure_ascii=False))


def no_links(path):
    path = Path(path).absolute()
    for p in (path, *path.parents):
        if p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction()):
            fail("Refusing symlink/junction destination: " + str(p))
    return path


def within(root, relative):
    p = Path(relative)
    win = PureWindowsPath(relative)
    if p.anchor or win.anchor or ".." in p.parts or ".." in win.parts or not p.parts or any(":" in part for part in win.parts):
        fail("Expected a relative in-project path: " + str(relative))
    base = no_links(root).resolve()
    candidate = no_links(base / p)
    if not candidate.resolve().is_relative_to(base):
        fail("Path escapes its project: " + str(relative))
    return candidate


def git(root, *args):
    r = subprocess.run(["git", "-C", str(root), *args], capture_output=True)
    if r.returncode:
        fail("Git failed: " + r.stderr.decode(errors="replace").strip())
    return r.stdout


def project_root(path):
    root = no_links(path).resolve()
    actual = Path(os.fsdecode(git(root, "rev-parse", "--show-toplevel")).strip()).resolve()
    if actual != root:
        fail("Use the repository root, not a subdirectory: " + str(actual))
    return root


def source_state(root):
    paths = {os.fsdecode(p) for p in git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z").split(b"\0") if p}
    paths.update((".paddock/crew.json", ".paddock/project.json", ".paddock/RULES.md", ".paddock/paddock.py"))
    result = {}
    for name in sorted(paths):
        if name.startswith(".paddock/runs/"):
            continue
        p = root / name
        if p.is_symlink():
            result[name] = "symlink:" + os.readlink(p)
        elif p.is_file():
            result[name] = {"sha256": sha(p.read_bytes()),
                            "mode": (p.stat().st_mode & 0o777) if os.name != "nt" else None}
        elif not p.exists():
            result[name] = "missing"
        else:
            fail("Unsupported source entry (e.g. submodule); define its evidence separately: " + name)
    return {"digest": digest(result), "files": result}


def run_dir(root, task):
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", task):
        fail("Task ID must be 1-64 lowercase letters, digits, underscores or hyphens")
    return within(root, ".paddock/runs/" + task)


def crew_config(path):
    c = read(path)
    if c.get("schema") != 1 or not isinstance(c.get("providers"), dict):
        fail("Invalid crew schema")
    if not c["providers"]:
        fail("No approved resources configured")
    if set(c.get("roles", {})) != set(ROLES):
        fail("Configure coordinator, builder, reviewer and adversary roles")
    for role, key in c["roles"].items():
        if key not in c["providers"] or c["providers"][key].get("approved") is not True:
            fail("Role has no approved resource: " + role)
    if c.get("local_models") is not False:
        fail("Local models are not supported by the core preview; keep them disabled")
    if c.get("max_builders") != 1 or c.get("max_review_rounds") not in (1, 2):
        fail("Preview supports one builder and one or two repair rounds")
    return c


def catalog_provider(path, instance, model):
    catalog = read(path)
    catalog = catalog.get("structuredContent", catalog)
    found = [p for p in catalog.get("providers", []) if p.get("providerInstanceId") == instance]
    if len(found) != 1 or found[0].get("canRunChildTask") is not True:
        fail("Provider instance unavailable or cannot run child tasks: " + instance)
    if model not in [m.get("id") for m in found[0].get("models", [])]:
        fail("Model not in supplied live catalog; expand host model search: " + model)
    return found[0]


def ask(prompt):
    """Prompt on stderr so stdout stays one machine-readable JSON document."""
    print(prompt, end="", file=sys.stderr, flush=True)
    return input()


def interview(args):
    print("Company-approved resources: Claude, ChatGPT/Codex, Gemini, LiteLLM, Cursor.", file=sys.stderr)
    chosen = ask("Resource keys (comma-separated: claude,codex,gemini,litellm,cursor): ").strip().lower().split(",")
    chosen = list(dict.fromkeys(k.strip() for k in chosen))
    if not chosen or any(k not in PROVIDERS for k in chosen):
        fail("Choose one or more listed resource keys; custom resources can be added to the JSON explicitly")
    roles = {}
    for role in ROLES:
        answer = ask(f"{role} resource [{chosen[0]}]: ").strip().lower() or chosen[0]
        if answer not in chosen:
            fail("Role must use a resource selected above")
        roles[role] = answer
    c = {"schema": 1, "providers": {k: {"approved": True, "instance_id": None, "model": None} for k in chosen},
         "roles": roles, "local_models": False, "max_builders": 1, "max_review_rounds": 2}
    path = no_links(args.output)
    written = {}
    if args.apply:
        if path.exists():
            fail("Crew config already exists; edit it deliberately rather than overwriting it")
        written[str(path)] = save(path, c)
    emit({"applied": args.apply, "path": str(path), "crew": c, "state": "unbound", "written": written})
    return 0


def bind(args):
    path = no_links(args.crew)
    c = crew_config(path)
    if args.provider not in c["providers"] or c["providers"][args.provider].get("approved") is not True:
        fail("Resource is not approved in this crew")
    if not args.confirm_approved_instance:
        fail("Confirm the specific company-approved instance, not merely its label")
    p = catalog_provider(args.catalog, args.instance, args.model)
    c["providers"][args.provider].update(instance_id=args.instance, model=args.model, driver_kind=p["driverKind"])
    written = {}
    if args.apply:
        written[str(path)] = save(path, c)
    emit({"applied": args.apply, "crew": c, "written": written})
    return 0


def route(args):
    c = crew_config(args.crew)
    p = c["providers"][c["roles"][args.role]]
    if not p.get("instance_id") or not p.get("model"):
        fail("Role is unbound; complete the T3 interview: " + args.role)
    live = catalog_provider(args.catalog, p["instance_id"], p["model"])
    if live["driverKind"] != p.get("driver_kind"):
        fail("Provider driver changed; re-confirm its binding")
    emit({"role": args.role, "target": {"providerInstanceId": p["instance_id"],
         "model": p["model"], "options": {}}, "scope": "preflight only; no host-wide enforcement"})
    return 0


def scaffold(args):
    root = no_links(args.directory)
    c = crew_config(args.crew)
    if args.new:
        if root.exists() and any(root.iterdir()):
            fail("--new requires a missing or empty directory")
        if not shutil.which("git"):
            fail("Git is required")
    else:
        project_root(root)
    assets = Path(__file__).resolve().parent.parent / "assets" / "project"
    if not assets.is_dir():
        fail("Use the installed skill or distribution CLI for project creation")
    files = {".paddock/paddock.py": Path(__file__).read_bytes(),
             ".paddock/crew.json": (json.dumps(c, indent=2) + "\n").encode()}
    for p in sorted(assets.iterdir()):
        if p.is_file():
            files[".paddock/" + p.name] = p.read_bytes()
    for name in files:
        p = within(root, name)
        if p.exists():
            fail("Existing scaffold file; refusing to overwrite: " + name)
    # Existing project files are appended to, never replaced. Plan every write before making
    # any, so a refusal leaves the project untouched.
    originals = {}  # files that already exist, with their bytes, to restore on failure
    for name in ("AGENTS.md", "CLAUDE.md", ".gitignore"):
        p = within(root, name)
        if p.exists():
            if not p.is_file():
                fail("Expected a regular file: " + name)
            originals[name] = p.read_bytes()
    for name in ("AGENTS.md", "CLAUDE.md"):
        if MARKER.encode() in originals.get(name, b""):
            fail("Project already contains a Paddock instruction block")
        block = f"\n\n{MARKER}\nFollow .paddock/RULES.md for Paddock coordination and evidence.\n{MARKER}\n"
        files[name] = originals.get(name, b"") + block.encode()
    files[".gitignore"] = originals.get(".gitignore", b"") + b"\n# Local Paddock evidence and machine-specific provider bindings\n.paddock/runs/\n.paddock/crew.json\n"
    written = {}
    if args.apply:
        written = apply_scaffold(root, files, originals, args.new)
    emit({"applied": args.apply, "project": str(root), "files": sorted(files), "written": written,
          "verification": "unconfigured", "host_registration": "not_run"})
    return 0


def apply_scaffold(root, files, originals, new):
    """Write the scaffold as one unit: on any failure, undo every change made so far.
    Returns {name: sha256} re-read from disk for every file written."""
    made_root = not root.exists()
    made_paddock = not (root / ".paddock").exists()
    done = []
    try:
        root.mkdir(parents=True, exist_ok=True)
        if new:
            git(root, "init")
        # Project files first, then .paddock/, so a late failure exercises the undo of both.
        for name in sorted(files, key=lambda n: (n.startswith(".paddock/"), n)):
            p = within(root, name)
            done.append(name)
            write_atomic(p, files[name])
        return {name: proven(within(root, name), files[name]) for name in sorted(files)}
    except BaseException:
        for name in reversed(done):
            p = root / name
            if name in originals:
                write_atomic(p, originals[name])
            elif p.exists():
                p.unlink()
        if made_paddock and (root / ".paddock").is_dir():
            shutil.rmtree(root / ".paddock")
        if new:
            # --new only accepts a missing or empty directory, so everything in it is ours.
            if made_root:
                shutil.rmtree(root, ignore_errors=True)
            else:
                for child in root.iterdir():
                    shutil.rmtree(child) if child.is_dir() and not child.is_symlink() else child.unlink()
        raise


def contract_state(root, rd):
    files = [rd / "request.md", rd / "contract.md", root / "AGENTS.md", root / "CLAUDE.md",
             root / ".paddock/RULES.md", root / ".paddock/project.json", root / ".paddock/crew.json"]
    missing = [str(p.relative_to(root)) for p in files if not p.is_file()]
    if missing:
        fail("Task or project setup incomplete; missing: " + ", ".join(missing))
    return digest({str(p.relative_to(root)): sha(p.read_bytes()) for p in files})


def task(args):
    root = project_root(args.project)
    rd = run_dir(root, args.task)
    if rd.exists():
        fail("Task already exists; preserve its evidence or choose a new task ID")
    request, contract = Path(args.request).read_bytes(), Path(args.contract).read_bytes()
    if not request.strip() or not contract.strip():
        fail("Original request and task contract must be nonempty")
    # Build the task folder beside its final place and move it in whole: an interrupted
    # start never leaves a half-made task that blocks reusing the ID.
    rd.parent.mkdir(parents=True, exist_ok=True)
    stage = rd.parent / (".stage-" + args.task + "-" + uuid.uuid4().hex)
    try:
        stage.mkdir()
        write_atomic(stage / "request.md", request)
        write_atomic(stage / "contract.md", contract)
        stage.rename(rd)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    written = {name: proven(rd / name, content) for name, content in (("request.md", request), ("contract.md", contract))}
    emit({"task": args.task, "directory": str(rd), "contract_digest": contract_state(root, rd), "written": written})
    return 0


def stop_tree(p):
    if os.name == "nt":
        try:
            r = subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"], capture_output=True, timeout=10)
            if r.returncode and p.poll() is None:
                p.kill()
        except (OSError, subprocess.TimeoutExpired):
            p.kill()
    else:
        try:
            os.killpg(p.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    p.wait(timeout=10)


def checks_config(root):
    c = read(root / ".paddock/project.json")
    if c.get("schema") != 1 or c.get("verification_mode") not in ("tests", "commands"):
        fail("Invalid project verification schema/mode")
    checks = c.get("checks")
    if not isinstance(checks, list) or not checks:
        fail("Verification unconfigured: supply actual project checks")
    ids = set()
    for x in checks:
        name = x.get("id", "")
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", name) or name in ids:
            fail("Check IDs must be unique simple lowercase names")
        ids.add(name)
        if x.get("kind") not in ("command", "test"):
            fail("Check kind must be command or test")
        if not isinstance(x.get("argv"), list) or not x["argv"] or not all(isinstance(v, str) and v for v in x["argv"]):
            fail("Each check requires a nonempty argv array")
        timeout = x.get("timeout", 120)
        if type(timeout) not in (int, float) or not 0 < timeout <= 3600:
            fail("Check timeout must be 0 < seconds <= 3600")
    return c


def verify(args):
    root = project_root(args.project)
    rd = run_dir(root, args.task)
    contract_state(root, rd)  # require an initialized task
    # A new attempt invalidates the last green result before any adapter executes.
    # An interrupted/crashed attempt leaves this non-success state in place.
    save(rd / "verification.json", {"schema": 1, "task": args.task, "status": "running",
         "source_digest": None, "source_unchanged": False, "checks": []})
    c = checks_config(root)
    start = source_state(root)
    evidence = rd / ("check-" + uuid.uuid4().hex)
    evidence.mkdir()
    results = []
    for check in c["checks"]:
        argv = [sys.executable if a == "{python}" else a for a in check["argv"]]
        log, receipt = evidence / (check["id"] + ".log"), evidence / (check["id"] + ".json")
        entry = {"id": check["id"], "kind": check["kind"], "argv": argv, "status": "error",
                 "log": str(log.relative_to(root)), "returncode": None}
        env = dict(os.environ, PADDOCK_CHECK_RECEIPT=str(receipt), PYTHONUNBUFFERED="1", PYTHONDONTWRITEBYTECODE="1")
        try:
            with log.open("wb") as out:
                p = subprocess.Popen(argv, cwd=root, env=env, stdout=out, stderr=subprocess.STDOUT,
                    start_new_session=os.name != "nt",
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0)
                try:
                    p.wait(timeout=check.get("timeout", 120))
                except subprocess.TimeoutExpired:
                    entry["status"] = "timeout"
                    stop_tree(p)
                except BaseException:
                    stop_tree(p)
                    raise
                entry["returncode"] = p.returncode
            if entry["status"] != "timeout":
                entry["status"] = "failed" if p.returncode != 0 else "command_passed"
                if check["kind"] == "test" and p.returncode == 0:
                    entry["status"] = "incomplete"
                    if receipt.is_file():
                        data = read(receipt)
                        counts = [data.get(k) for k in ("passed", "failed", "skipped")]
                        if data.get("completed") is True and all(type(n) is int and n >= 0 for n in counts):
                            entry["counts"] = data
                            entry["status"] = "test_passed" if counts[0] > 0 and counts[1:] == [0, 0] else "incomplete"
                            if counts[1]:
                                entry["status"] = "failed"
                        entry["receipt"] = str(receipt.relative_to(root))
                        entry["receipt_sha256"] = sha(receipt.read_bytes())
        except (OSError, ValueError, subprocess.TimeoutExpired) as e:
            entry["error"] = str(e)
            entry["status"] = "error"
        entry["log_sha256"] = sha(log.read_bytes()) if log.exists() else None
        results.append(entry)
    end = source_state(root)
    good = all(x["status"] in ("test_passed", "command_passed") for x in results)
    if c["verification_mode"] == "tests" and not any(x["status"] == "test_passed" for x in results):
        good = False
    report = {"schema": 1, "at": datetime.now(timezone.utc).isoformat(), "task": args.task,
        "source_digest": start["digest"], "source_unchanged": start == end,
        "status": "verified" if good and start == end else "incomplete_or_failed",
        "verification_mode": c["verification_mode"], "checks": results}
    save(evidence / "verification.json", report)
    save(rd / "verification.json", report)
    emit(report)
    return 0 if report["status"] == "verified" else 1


def evidence_inputs(root, rd):
    names = ["request.md", "contract.md", "claims.md", "host.json", "verification.json"]
    paths = [within(rd, n) for n in names]
    for p in paths:
        if not p.is_file():
            fail("Missing evidence artifact: " + str(p.relative_to(root)))
        if not p.read_bytes().strip():
            fail("Empty evidence artifact: " + str(p))
    v = read(rd / "verification.json")
    for check in v["checks"]:
        for field in ("log", "receipt"):
            if field in check:
                p = within(root, check[field])
                if sha(p.read_bytes()) != check.get(field + "_sha256"):
                    fail("Verification evidence changed: " + check[field])
                paths.append(p)
    host = read(rd / "host.json")
    if not isinstance(host.get("builder_session_ids"), list) or not host["builder_session_ids"] or not all(
            isinstance(v, str) and v for v in host["builder_session_ids"]):
        fail("host.json must identify actual builder/coordinator session IDs")
    if host.get("controls_state") not in ("observed", "unknown", "partially_observed"):
        fail("host.json must separate observed/unknown/partially_observed controls")
    if not isinstance(host.get("receipts"), list) or not host["receipts"]:
        fail("Actual host/tool receipt paths are required; absent data is incomplete")
    for relative in host["receipts"]:
        p = within(rd, relative)
        if not p.is_file() or not p.read_bytes().strip():
            fail("Empty or missing host/tool receipt: " + str(p))
        paths.append(p)
    return {str(p.relative_to(root)): sha(p.read_bytes()) for p in paths}


def packet(args):
    root = project_root(args.project)
    rd = run_dir(root, args.task)
    state = source_state(root)
    inputs = evidence_inputs(root, rd)
    data = {"schema": 1, "source_digest": state["digest"], "source_files": state["files"],
            "contract_digest": contract_state(root, rd), "inputs": inputs}
    emit({"packet": str(rd / "packet.json"), "packet_digest": save(rd / "packet.json", data),
          "contract_digest": data["contract_digest"], "review_status": "pending"})
    return 0


def attempt(errors, label, fn, *args):
    """Run one audit step; record why it could not run instead of crashing the audit."""
    try:
        return fn(*args)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as e:
        errors.append(label + ": " + (str(e) or type(e).__name__))
        return None


def audit(args):
    """Check the task's records against each other and report every gap found. Missing or
    corrupt records are reported as errors, never as a crash or a pass. The report names
    the digests it compared so anyone can recompute them."""
    root = project_root(args.project)
    rd = run_dir(root, args.task)
    errors, reviews = [], {kind: "pending" for kind in ("instruction", "code", "adversary")}
    obj = lambda name: attempt(errors, "Missing or unreadable " + name, read, rd / name) or {}
    data, v, host = obj("packet.json"), obj("verification.json"), obj("host.json")
    source = attempt(errors, "Cannot read project source", lambda: source_state(root)["digest"])
    inputs = attempt(errors, "Evidence incomplete", evidence_inputs, root, rd)
    contract = attempt(errors, "Contract or policy incomplete", contract_state, root, rd)
    packet_digest = attempt(errors, "Missing packet", lambda: sha((rd / "packet.json").read_bytes()))
    if data:
        if source is not None and data.get("source_digest") != source:
            errors.append("Source changed since packet")
        if inputs is not None and data.get("inputs") != inputs:
            errors.append("Evidence or proposed claims changed since packet")
        if contract is not None and data.get("contract_digest") != contract:
            errors.append("Contract/policy changed since packet")
    if (v.get("status") != "verified" or v.get("source_unchanged") is not True
            or not data or v.get("source_digest") != data.get("source_digest")):
        errors.append("Verification missing, failed, incomplete or stale")
    builders = host.get("builder_session_ids")
    builders = builders if isinstance(builders, list) else []
    ids = []
    for kind in reviews:
        p = rd / (kind + "-review.json")
        if not p.exists():
            errors.append("Missing " + kind + " review")
            continue
        r = attempt(errors, "Unreadable " + kind + " review", read, p)
        if r is None:
            continue
        expected = contract if kind == "instruction" else packet_digest
        rid = r.get("reviewer_session_id")
        if expected is None or r.get("input_digest") != expected:
            errors.append("Stale " + kind + " review")
        if not rid or rid in builders:
            errors.append("Review is not independent from builder: " + kind)
        if kind != "instruction":
            ids.append(rid)
            if set(r.get("builder_session_ids") or []) != set(builders):
                errors.append("Review does not identify actual builders: " + kind)
        findings = r.get("findings")
        if not r.get("coverage") or not isinstance(findings, list):
            errors.append("Missing coverage/findings: " + kind)
            findings = []
        if r.get("status") != "pass" or any(not isinstance(f, dict) or f.get("disposition") not in ("fixed", "accepted")
                                            for f in findings):
            errors.append("Incomplete or unresolved review: " + kind)
        receipt = attempt(errors, "Bad reviewer receipt path: " + kind, within, rd, str(r.get("receipt") or "missing"))
        if receipt is not None and (not receipt.is_file() or not receipt.read_bytes().strip()):
            errors.append("Missing actual reviewer receipt: " + kind)
        reviews[kind] = r.get("status", "pending")
    if len(ids) == 2 and ids[0] == ids[1]:
        errors.append("Code reviewer and process adversary must be separate fresh sessions")
    controls = host.get("controls_state")
    report = {"evidence_complete": not errors, "verification": v.get("status", "missing"), "reviews": reviews,
              "host_controls": controls if controls in ("observed", "partially_observed") else "unknown",
              "errors": errors,
              "compared": {"source_digest": source, "contract_digest": contract, "packet_digest": packet_digest},
              "limitation": "Local editable records; not authenticated host enforcement or proof of correctness"}
    emit(report)
    return 1 if errors else 0


def doctor(args):
    root = project_root(args.project)
    status = {}
    try:
        c = crew_config(root / ".paddock/crew.json")
        status["crew"] = "bound" if all(p.get("instance_id") and p.get("model") for p in c["providers"].values()) else "unbound"
    except (OSError, ValueError) as e:
        status["crew"] = str(e)
    try:
        checks_config(root)
        status["checks"] = "configured; not executed by doctor"
    except (OSError, ValueError) as e:
        status["checks"] = str(e)
    status["host_integration"] = "not tested by this CLI; verify inside T3"
    emit(status)
    return 0 if status["crew"] == "bound" and status["checks"].startswith("configured") else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--version", action="version", version=VERSION)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("interview", allow_abbrev=False)
    p.add_argument("--output", required=True); p.add_argument("--apply", action="store_true")
    p = sub.add_parser("bind", allow_abbrev=False)
    for name in ("crew", "provider", "instance", "model", "catalog"):
        p.add_argument("--" + name, required=True)
    p.add_argument("--confirm-approved-instance", action="store_true"); p.add_argument("--apply", action="store_true")
    p = sub.add_parser("route", allow_abbrev=False)
    p.add_argument("--role", choices=ROLES, required=True)
    p.add_argument("--crew", required=True); p.add_argument("--catalog", required=True)
    p = sub.add_parser("project", allow_abbrev=False)
    p.add_argument("directory"); p.add_argument("--crew", required=True)
    p.add_argument("--new", action="store_true"); p.add_argument("--apply", action="store_true")
    for name in ("task", "verify", "packet", "audit", "doctor"):
        p = sub.add_parser(name, allow_abbrev=False)
        p.add_argument("--project", default=".")
        if name != "doctor":
            p.add_argument("--task", required=True)
        if name == "task":
            p.add_argument("--request", required=True); p.add_argument("--contract", required=True)
    args = parser.parse_args(argv)
    return {"interview": interview, "bind": bind, "route": route, "project": scaffold,
            "task": task, "verify": verify, "packet": packet, "audit": audit, "doctor": doctor}[args.cmd](args)


if __name__ == "__main__":
    if sys.version_info < (3, 11):
        print("paddock: Python 3.11 or newer is required", file=sys.stderr)
        sys.exit(2)
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, EOFError) as e:
        print("paddock: " + str(e), file=sys.stderr)
        sys.exit(2)
