#!/usr/bin/env python3
"""
GhostStack composite MCP server (FastMCP).
Proxies orchestration capabilities to the GhostStack HTTP API.
Requires: pip install fastmcp  (or run from apps/fastmcp venv)
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

try:
    from fastmcp import FastMCP
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "fastmcp is required. Install with: pip install fastmcp\n"
        "Or: cd apps/fastmcp && uv sync"
    ) from exc

API_BASE = os.environ.get("GHOSTSTACK_API_URL", "http://127.0.0.1:3000").rstrip("/")
MCP_HOST = os.environ.get("GHOSTSTACK_MCP_HOST", "127.0.0.1")
MCP_PORT = int(os.environ.get("GHOSTSTACK_MCP_PORT", "8100"))

mcp = FastMCP("GhostStack Federation")


def _request(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{API_BASE}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} {path}: {detail[:500]}") from e


@mcp.tool
def ghoststack_health() -> dict:
    """Return orchestrator and federation health."""
    return _request("GET", "/health")


@mcp.tool
def ghoststack_list_workflows() -> list:
    """List loaded workflow definitions."""
    return _request("GET", "/runtime/workflows")


@mcp.tool
def ghoststack_execute_workflow(workflow_id: str, execution_id: str | None = None) -> dict:
    """Execute a registered workflow by id."""
    return _request(
        "POST",
        "/runtime/workflows/execute",
        {"workflowId": workflow_id, "executionId": execution_id or f"mcp-{workflow_id}"},
    )


@mcp.tool
def ghoststack_floci_execute(action: str, payload: dict | None = None) -> dict:
    """Run a Floci adapter action (create_s3_bucket, invoke_lambda, etc.)."""
    return _request(
        "POST",
        "/runtime/floci/execute",
        {"action": action, "payload": payload or {}},
    )


@mcp.tool
def ghoststack_adapters() -> dict:
    """Return vendored adapter manifest and Floci probe."""
    return _request("GET", "/runtime/adapters")


@mcp.tool
def ghoststack_run_e2e(strict: bool = True, cleanup: bool = True) -> dict:
    """Run federation E2E: S3 bucket → Lambda deploy → invoke (requires live Floci)."""
    return _request(
        "POST",
        "/runtime/e2e/federation",
        {"strict": strict, "cleanup": cleanup},
    )


@mcp.tool
def ghoststack_federation_status() -> dict:
    """Return persisted federation supervisor status."""
    return _request("GET", "/runtime/federation/status")


if __name__ == "__main__":
    transport = os.environ.get("GHOSTSTACK_MCP_TRANSPORT", "streamable-http")
    mcp.run(transport=transport, host=MCP_HOST, port=MCP_PORT)
