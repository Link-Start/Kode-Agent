#!/usr/bin/env python3
"""Release and query Lingguang Flash Apps through the production OpenAPI."""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import re
import shlex
import stat
import subprocess
import sys
import tarfile
import tempfile
import uuid
from pathlib import Path, PurePosixPath
from typing import Any, Mapping
from urllib.parse import quote, urlparse


API_BASE_URL = "https://cognihome.lingguang.com"
WEB_ORIGIN = "https://www.lingguang.com"
WEB_REFERER = "https://www.lingguang.com/"
RELEASE_PATH = "/openapi/flashapp/releaseApp.json"
QUERY_PATH = "/openapi/flashapp/queryAppInfo.json"
TOKEN_ENV = "LINGGUANG_FLASH_APPS_ACCESS_TOKEN"
APP_DIRECTORY_NAME = "lingguang-flash-apps"
TOKEN_SETTINGS_URL = "https://www.lingguang.com/settings"
IDENTITY_FILE_NAME = "flashapp-artifact.json"
QR_CACHE_DIRECTORY_NAME = f"{APP_DIRECTORY_NAME}/qrcodes"
REQUIREMENTS_PATH = Path(__file__).resolve().parents[1] / "requirements.txt"
QR_DEEP_LINK_PREFIX = (
    "leopards://platformapi/startapp?appId=20002117&target=flashAppDetail&"
    "fullUrl=https%3A%2F%2Fagi-static.lingguang.com%2Fapp-shell.html%3Fhtml_url%3D"
)
ENCODE_URI_COMPONENT_SAFE = "-_.!~*'()"
FORMAL_VIEW_HINT = "可前往灵光 App 或网页版「我的创作」查看"
CHUNK_SIZE = 1024 * 1024

EXIT_USAGE_OR_CONFIG = 2
EXIT_TRANSPORT = 3
EXIT_API = 4


def default_config_path(
    *,
    environ: Mapping[str, str] | None = None,
    home: Path | None = None,
    platform_name: str | None = None,
) -> Path:
    """Return the platform-native per-user config path."""
    environment = os.environ if environ is None else environ
    user_home = Path.home() if home is None else home
    platform = os.name if platform_name is None else platform_name
    if platform == "nt":
        configured_root = environment.get("APPDATA", "").strip()
        root = (
            Path(configured_root) if configured_root else user_home / "AppData/Roaming"
        )
    else:
        configured_root = environment.get("XDG_CONFIG_HOME", "").strip()
        root = (
            Path(configured_root).expanduser()
            if configured_root
            else user_home / ".config"
        )
    return root / APP_DIRECTORY_NAME / "config.json"


def legacy_config_path(*, home: Path | None = None) -> Path:
    """Return the original cross-platform config path used by older releases."""
    user_home = Path.home() if home is None else home
    return user_home / ".config" / APP_DIRECTORY_NAME / "config.json"


def default_qr_cache_directory(
    *,
    environ: Mapping[str, str] | None = None,
    home: Path | None = None,
    platform_name: str | None = None,
) -> Path:
    """Return the platform-native directory for generated QR codes."""
    environment = os.environ if environ is None else environ
    user_home = Path.home() if home is None else home
    platform = os.name if platform_name is None else platform_name
    if platform == "nt":
        configured_root = environment.get("LOCALAPPDATA", "").strip()
        root = Path(configured_root) if configured_root else user_home / "AppData/Local"
    else:
        configured_root = environment.get("XDG_CACHE_HOME", "").strip()
        root = (
            Path(configured_root).expanduser()
            if configured_root
            else user_home / ".cache"
        )
    return root / QR_CACHE_DIRECTORY_NAME


DEFAULT_CONFIG_PATH = default_config_path()


def resolve_config_path(
    config_path: Path,
    *,
    environ: Mapping[str, str] | None = None,
    home: Path | None = None,
    platform_name: str | None = None,
) -> Path:
    """Resolve a config path, preserving the pre-Windows-adaptation fallback."""
    path = config_path.expanduser().resolve()
    if path.is_file():
        return path

    platform = os.name if platform_name is None else platform_name
    if platform == "nt":
        native_default = (
            default_config_path(
                environ=environ,
                home=home,
                platform_name=platform,
            )
            .expanduser()
            .resolve()
        )
        if path == native_default:
            legacy = legacy_config_path(home=home).expanduser().resolve()
            if legacy.is_file():
                return legacy
    return path


def configure_standard_streams(
    *,
    platform_name: str | None = None,
    stdout: Any | None = None,
    stderr: Any | None = None,
) -> None:
    """Use UTF-8 for JSON and Chinese diagnostics in Windows terminals."""
    platform = os.name if platform_name is None else platform_name
    if platform != "nt":
        return
    output_stream = sys.stdout if stdout is None else stdout
    error_stream = sys.stderr if stderr is None else stderr
    for stream in (output_stream, error_stream):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")


def pip_install_command(
    *,
    executable: str | None = None,
    platform_name: str | None = None,
) -> str:
    """Build a copyable dependency command for the current interpreter."""
    arguments = [
        sys.executable if executable is None else executable,
        "-m",
        "pip",
        "install",
        "-r",
        str(REQUIREMENTS_PATH),
    ]
    platform = os.name if platform_name is None else platform_name
    if platform == "nt":
        return subprocess.list2cmdline(arguments)
    return shlex.join(arguments)


class FlashAppError(Exception):
    exit_code = EXIT_API


class UsageError(FlashAppError):
    exit_code = EXIT_USAGE_OR_CONFIG


class ConfigError(FlashAppError):
    exit_code = EXIT_USAGE_OR_CONFIG


class ConfigPermissionError(ConfigError):
    pass


class TransportError(FlashAppError):
    exit_code = EXIT_TRANSPORT


class HttpApiError(FlashAppError):
    exit_code = EXIT_TRANSPORT


class ResponseFormatError(FlashAppError):
    exit_code = EXIT_API


class BusinessApiError(FlashAppError):
    exit_code = EXIT_API


class IdentityConflictError(FlashAppError):
    exit_code = EXIT_API


def _redact(value: object, token: str) -> str:
    text = str(value)
    if token:
        text = text.replace(f"Bearer {token}", "Bearer [REDACTED]")
        text = text.replace(token, "[REDACTED]")
    return text


def _require_nonempty_string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ResponseFormatError(f"response is missing non-empty {label}")
    return value.strip()


def _require_display_value(value: object, label: str) -> str:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ResponseFormatError(f"response is missing non-empty {label}")
    normalized = str(value).strip()
    if not normalized:
        raise ResponseFormatError(f"response is missing non-empty {label}")
    return normalized


def load_access_token(
    config_path: Path = DEFAULT_CONFIG_PATH,
    *,
    environ: Mapping[str, str] | None = None,
) -> str:
    environment = os.environ if environ is None else environ
    env_token = environment.get(TOKEN_ENV, "").strip()
    if env_token:
        return _normalize_token(env_token)

    path = resolve_config_path(config_path, environ=environment)
    if not path.is_file():
        raise ConfigError(
            f"access token config does not exist: {path}; obtain a token at {TOKEN_SETTINGS_URL}"
        )

    if os.name == "posix":
        permissions = stat.S_IMODE(path.stat().st_mode)
        if permissions & 0o077:
            raise ConfigPermissionError(
                f"access token config must not be readable by group or others: {path}; run chmod 600"
            )

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConfigError(f"cannot read access token config: {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ConfigError(f"access token config must contain a JSON object: {path}")
    raw_token = payload.get("access_token")
    if not isinstance(raw_token, str) or not raw_token.strip():
        raise ConfigError(f"access_token is missing from config: {path}")
    return _normalize_token(raw_token)


def _normalize_token(raw_token: str) -> str:
    token = raw_token.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token or token.lower().startswith("replace-") or token == "yourAccessToken":
        raise ConfigError(
            f"access token is still a placeholder; obtain a token at {TOKEN_SETTINGS_URL}"
        )
    return token


def validate_package(package_path: Path) -> Path:
    path = package_path.expanduser().resolve()
    if not path.is_file():
        raise UsageError(f"package does not exist or is not a file: {path}")
    if path.stat().st_size == 0:
        raise UsageError(f"package is empty: {path}")
    if not (path.name.endswith(".tar") or path.name.endswith(".tar.gz")):
        raise UsageError("package filename must end with .tar or .tar.gz")
    if not tarfile.is_tarfile(path):
        raise UsageError(f"package is not a readable tar archive: {path}")

    excluded_dirs = {".git", "node_modules", "dist"}
    excluded_files = {".DS_Store", IDENTITY_FILE_NAME}
    root_files: set[str] = set()
    member_count = 0
    try:
        with tarfile.open(path, "r:*") as archive:
            for member in archive.getmembers():
                member_count += 1
                normalized = member.name.replace("\\", "/")
                pure_path = PurePosixPath(normalized)
                parts = tuple(part for part in pure_path.parts if part not in {"", "."})
                if pure_path.is_absolute() or ".." in parts:
                    raise UsageError(f"package contains unsafe path: {member.name}")
                if member.issym() or member.islnk():
                    raise UsageError(f"package must not contain links: {member.name}")
                if any(part in excluded_dirs for part in parts):
                    raise UsageError(
                        f"package contains excluded directory: {member.name}"
                    )
                if parts and parts[-1] in excluded_files:
                    raise UsageError(f"package contains excluded file: {member.name}")
                if parts and (
                    parts[-1].startswith(".env")
                    or parts[-1].lower().endswith((".pem", ".key"))
                ):
                    raise UsageError(
                        f"package contains a potential secret file: {member.name}"
                    )
                if len(parts) == 1 and member.isfile():
                    root_files.add(parts[0])
    except (OSError, tarfile.TarError) as exc:
        raise UsageError(f"cannot inspect package: {path}: {exc}") from exc

    if member_count == 0:
        raise UsageError(f"package has no members: {path}")
    missing = sorted({"package.json", "manifest.json"} - root_files)
    if missing:
        raise UsageError(
            f"package is missing required root files: {', '.join(missing)}"
        )
    return path


def _project_directory(project_dir: Path) -> Path:
    path = project_dir.expanduser().resolve()
    if not path.is_dir():
        raise UsageError(f"project directory does not exist: {path}")
    return path


def _identity_path(project_dir: Path) -> Path:
    return _project_directory(project_dir) / IDENTITY_FILE_NAME


def load_identity(project_dir: Path) -> dict[str, Any] | None:
    path = _identity_path(project_dir)
    if not path.exists():
        return None
    if not path.is_file():
        raise UsageError(f"artifact identity path is not a file: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise UsageError(f"cannot read artifact identity: {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise UsageError(f"artifact identity must contain a JSON object: {path}")
    if payload.get("schemaVersion") != 1 or payload.get("environment") != "pre":
        raise UsageError(
            f"artifact identity must use schemaVersion 1 and environment pre: {path}"
        )
    artifact_id = payload.get("artifactId")
    if not isinstance(artifact_id, str) or not artifact_id.strip():
        raise UsageError(f"artifact identity has no non-empty artifactId: {path}")
    return {
        "schemaVersion": 1,
        "environment": "pre",
        "artifactId": artifact_id.strip(),
    }


def resolve_release_artifact_id(
    project_dir: Path,
    *,
    explicit_artifact_id: str | None,
    new_artifact: bool,
) -> str | None:
    if explicit_artifact_id and new_artifact:
        raise UsageError("--artifact-id and --new-artifact are mutually exclusive")
    if explicit_artifact_id is not None:
        artifact_id = explicit_artifact_id.strip()
        if not artifact_id:
            raise UsageError("--artifact-id must not be empty")
        return artifact_id
    if new_artifact:
        return None
    identity = load_identity(project_dir)
    if identity is None:
        raise UsageError(
            f"{IDENTITY_FILE_NAME} is missing; pass --new-artifact to create a new app, "
            "or --artifact-id to update an existing app"
        )
    return str(identity["artifactId"])


def _write_identity(project_dir: Path, artifact_id: str) -> Path:
    path = _identity_path(project_dir)
    payload = {
        "schemaVersion": 1,
        "environment": "pre",
        "artifactId": artifact_id,
    }
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
            temporary_path = Path(handle.name)
        os.replace(temporary_path, path)
    except OSError as exc:
        if temporary_path is not None:
            try:
                temporary_path.unlink(missing_ok=True)
            except OSError:
                pass
        raise UsageError(f"cannot write artifact identity: {path}: {exc}") from exc
    return path


class FlashAppClient:
    def __init__(self, access_token: str, *, base_url: str = API_BASE_URL):
        self.access_token = _normalize_token(access_token)
        parsed = urlparse(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ConfigError(f"invalid API base URL: {base_url}")
        self.scheme = parsed.scheme
        self.hostname = parsed.hostname
        self.port = parsed.port
        self.base_path = parsed.path.rstrip("/")

    def _connection(self, timeout: float) -> http.client.HTTPConnection:
        connection_type = (
            http.client.HTTPSConnection
            if self.scheme == "https"
            else http.client.HTTPConnection
        )
        return connection_type(self.hostname, self.port, timeout=timeout)

    def _path(self, endpoint: str) -> str:
        return f"{self.base_path}{endpoint}"

    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json, text/plain, */*",
            "Authorization": f"Bearer {self.access_token}",
            "Origin": WEB_ORIGIN,
            "Referer": WEB_REFERER,
        }

    def _read_response(
        self,
        response: http.client.HTTPResponse,
        *,
        operation: str,
    ) -> dict[str, Any]:
        body = response.read()
        if not 200 <= response.status < 300:
            raise HttpApiError(f"{operation} returned HTTP {response.status}")
        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ResponseFormatError(f"{operation} returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise ResponseFormatError(f"{operation} response must be a JSON object")
        self._validate_business_response(payload, operation=operation)
        return payload

    def _validate_business_response(
        self, payload: dict[str, Any], *, operation: str
    ) -> None:
        stat_value = payload.get("stat")
        if isinstance(stat_value, str) and stat_value.lower() in {
            "deny",
            "fail",
            "failed",
        }:
            message = _redact(payload.get("msg", "request denied"), self.access_token)
            raise BusinessApiError(
                f"{operation} denied: stat={stat_value}; msg={message}"
            )
        if payload.get("success") is not True or payload.get("code") != "SUCCESS":
            code = _redact(payload.get("code", "unknown"), self.access_token)
            message = _redact(payload.get("msg", "request failed"), self.access_token)
            trace_id = _redact(payload.get("traceId", ""), self.access_token)
            raise BusinessApiError(
                f"{operation} failed: code={code}; msg={message}; traceId={trace_id}"
            )

    def release(
        self,
        package_path: Path,
        *,
        artifact_id: str | None,
        preview: bool,
        timeout: float,
    ) -> dict[str, Any]:
        package = validate_package(package_path)
        boundary = f"----lingguang-flash-apps-{uuid.uuid4().hex}"
        prefix = self._multipart_prefix(boundary, package, artifact_id, preview=preview)
        suffix = f"\r\n--{boundary}--\r\n".encode("utf-8")
        headers = self._headers()
        headers.update(
            {
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Content-Length": str(
                    len(prefix) + package.stat().st_size + len(suffix)
                ),
            }
        )

        connection = self._connection(timeout)
        try:
            connection.putrequest("POST", self._path(RELEASE_PATH))
            for key, value in headers.items():
                connection.putheader(key, value)
            connection.endheaders()
            connection.send(prefix)
            with package.open("rb") as handle:
                for chunk in iter(lambda: handle.read(CHUNK_SIZE), b""):
                    connection.send(chunk)
            connection.send(suffix)
            response = connection.getresponse()
            payload = self._read_response(response, operation="release")
        except FlashAppError:
            raise
        except (OSError, http.client.HTTPException) as exc:
            raise TransportError(
                f"release transport failed: {_redact(exc, self.access_token)}"
            ) from exc
        finally:
            connection.close()

        result = payload.get("result")
        if not isinstance(result, dict):
            raise ResponseFormatError("release response is missing result object")
        _require_nonempty_string(result.get("instanceId"), "result.instanceId")
        return payload

    def _multipart_prefix(
        self,
        boundary: str,
        package: Path,
        artifact_id: str | None,
        *,
        preview: bool,
    ) -> bytes:
        sections: list[str] = []
        if preview:
            sections.append(
                f"--{boundary}\r\n"
                'Content-Disposition: form-data; name="preview"\r\n\r\n'
                "true\r\n"
            )
        if artifact_id:
            sections.append(
                f"--{boundary}\r\n"
                'Content-Disposition: form-data; name="artifactId"\r\n\r\n'
                f"{artifact_id}\r\n"
            )
        safe_filename = (
            package.name.replace('"', "_").replace("\r", "_").replace("\n", "_")
        )
        content_type = (
            "application/gzip" if safe_filename.endswith(".gz") else "application/x-tar"
        )
        sections.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="Filedata"; filename="{safe_filename}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        )
        return "".join(sections).encode("utf-8")

    def query(self, instance_id: str, *, timeout: float) -> dict[str, Any]:
        normalized_instance_id = instance_id.strip()
        if not normalized_instance_id:
            raise UsageError("instanceId must not be empty")
        path = f"{self._path(QUERY_PATH)}?instanceId={quote(normalized_instance_id, safe='')}"
        connection = self._connection(timeout)
        try:
            connection.request("GET", path, headers=self._headers())
            response = connection.getresponse()
            payload = self._read_response(response, operation="query")
        except FlashAppError:
            raise
        except (OSError, http.client.HTTPException) as exc:
            raise TransportError(
                f"query transport failed: {_redact(exc, self.access_token)}"
            ) from exc
        finally:
            connection.close()
        result = payload.get("result")
        if not isinstance(result, dict):
            raise ResponseFormatError("query response is missing result object")
        return payload


def _default_qr_output_path(
    artifact_id: str,
    artifact_version: str,
    access_url: str,
) -> Path:
    safe_artifact_id = (
        re.sub(r"[^A-Za-z0-9._-]+", "-", artifact_id).strip("-.") or "flashapp"
    )
    safe_version = (
        re.sub(r"[^A-Za-z0-9._-]+", "-", artifact_version).strip("-.") or "unknown"
    )
    url_digest = hashlib.sha256(access_url.encode("utf-8")).hexdigest()[:12]
    return (
        default_qr_cache_directory()
        / f"{safe_artifact_id}-v{safe_version}-{url_digest}.svg"
    )


def build_qr_target_url(access_url: str) -> str:
    encoded_once = quote(access_url, safe=ENCODE_URI_COMPONENT_SAFE)
    encoded_twice = quote(encoded_once, safe=ENCODE_URI_COMPONENT_SAFE)
    return f"{QR_DEEP_LINK_PREFIX}{encoded_twice}"


def generate_qr_code(qr_content: str, output_path: Path) -> Path:
    try:
        import qrcode
        from qrcode.image.svg import SvgPathImage
    except ModuleNotFoundError as exc:
        raise ConfigError(
            "QR code generation requires qrcode==8.2; install the skill requirements with "
            f"{pip_install_command()}"
        ) from exc

    path = output_path.expanduser().resolve()
    if path.suffix.lower() != ".svg":
        raise UsageError("--qr-output must end with .svg")
    temporary_path: Path | None = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        qr_code = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr_code.add_data(qr_content)
        qr_code.make(fit=True)
        image = qr_code.make_image(image_factory=SvgPathImage)

        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=path.parent,
            prefix=f".{path.stem}.",
            suffix=".tmp.svg",
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            image.save(handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    except OSError as exc:
        if temporary_path is not None:
            try:
                temporary_path.unlink(missing_ok=True)
            except OSError:
                pass
        raise UsageError(f"cannot write QR code: {path}: {exc}") from exc
    return path


def build_release_summary(
    result: Mapping[str, Any],
    *,
    preview: bool,
    qr_output: Path | None = None,
) -> dict[str, str]:
    name = _require_nonempty_string(result.get("name"), "result.name")
    artifact_id = _require_nonempty_string(
        result.get("artifactId"), "result.artifactId"
    )
    artifact_version = _require_display_value(
        result.get("artifactVersion"), "result.artifactVersion"
    )
    access_url = _require_nonempty_string(result.get("packageUrl"), "result.packageUrl")
    parsed_access_url = urlparse(access_url)
    if (
        parsed_access_url.scheme not in {"http", "https"}
        or not parsed_access_url.netloc
    ):
        raise ResponseFormatError("result.packageUrl must be an absolute HTTP(S) URL")
    qr_path = qr_output or _default_qr_output_path(
        artifact_id, artifact_version, access_url
    )
    qr_target_url = build_qr_target_url(access_url)
    generated_qr_path = generate_qr_code(qr_target_url, qr_path)
    summary = {
        "name": name,
        "artifactId": artifact_id,
        "artifactVersion": artifact_version,
        "releaseType": "preview" if preview else "formal",
        "qrCodePath": str(generated_qr_path),
    }
    if not preview:
        summary["viewHint"] = FORMAL_VIEW_HINT
    return summary


def query_and_update_identity(
    client: FlashAppClient,
    instance_id: str,
    project_dir: Path,
    *,
    replace: bool,
    timeout: float,
    preview: bool = False,
    qr_output: Path | None = None,
) -> tuple[dict[str, Any], bool]:
    project = _project_directory(project_dir)
    response = client.query(instance_id, timeout=timeout)
    result = response["result"]
    if result.get("status") != "PASS":
        return response, False

    artifact_id = _require_nonempty_string(
        result.get("artifactId"), "result.artifactId"
    )
    current = load_identity(project)
    if current is not None and current["artifactId"] != artifact_id and not replace:
        raise IdentityConflictError(
            f"query returned artifactId {artifact_id}, but {IDENTITY_FILE_NAME} contains "
            f"{current['artifactId']}; use --replace-artifact-id only when intentionally changing app identity"
        )
    summary = build_release_summary(result, preview=preview, qr_output=qr_output)
    if current is not None and current["artifactId"] == artifact_id:
        updated = False
    else:
        _write_identity(project, artifact_id)
        updated = True
    result.pop("packageUrl", None)
    response["releaseSummary"] = summary
    return response, updated


def _positive_timeout(value: str) -> float:
    try:
        timeout = float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("timeout must be a number") from exc
    if timeout <= 0:
        raise argparse.ArgumentTypeError("timeout must be greater than zero")
    return timeout


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Release and query Lingguang Flash Apps through the production OpenAPI."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    release_parser = subparsers.add_parser(
        "release", help="Upload a .tar or .tar.gz source package"
    )
    release_parser.add_argument(
        "--package", required=True, type=Path, help="Source package to upload"
    )
    release_parser.add_argument("--project-dir", type=Path, default=Path.cwd())
    release_parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    release_parser.add_argument("--timeout", type=_positive_timeout, default=300.0)
    release_parser.add_argument(
        "--preview",
        action="store_true",
        help="Create a preview release; omit this flag for a formal release",
    )
    identity_group = release_parser.add_mutually_exclusive_group()
    identity_group.add_argument("--artifact-id", help="Explicit existing app identity")
    identity_group.add_argument(
        "--new-artifact",
        action="store_true",
        help="Intentionally create a new app by omitting artifactId",
    )

    query_parser = subparsers.add_parser("query", help="Query one release instance")
    query_parser.add_argument("--instance-id", required=True)
    query_parser.add_argument("--project-dir", type=Path, default=Path.cwd())
    query_parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH)
    query_parser.add_argument("--timeout", type=_positive_timeout, default=30.0)
    query_parser.add_argument(
        "--preview",
        action="store_true",
        help="Format this query as a preview result; omit for a formal release result",
    )
    query_parser.add_argument(
        "--qr-output",
        type=Path,
        help="Write the PASS result QR code to this .svg path instead of the default cache path",
    )
    query_parser.add_argument(
        "--replace-artifact-id",
        action="store_true",
        help="Allow a PASS result to replace a conflicting local artifactId",
    )
    return parser


def run(
    args: argparse.Namespace, *, environ: Mapping[str, str] | None = None
) -> dict[str, Any]:
    token = load_access_token(args.config, environ=environ)
    client = FlashAppClient(token)
    if args.command == "release":
        project = _project_directory(args.project_dir)
        package = validate_package(args.package)
        artifact_id = resolve_release_artifact_id(
            project,
            explicit_artifact_id=args.artifact_id,
            new_artifact=args.new_artifact,
        )
        return client.release(
            package,
            artifact_id=artifact_id,
            preview=args.preview,
            timeout=args.timeout,
        )
    if args.command == "query":
        response, _updated = query_and_update_identity(
            client,
            args.instance_id,
            args.project_dir,
            replace=args.replace_artifact_id,
            timeout=args.timeout,
            preview=args.preview,
            qr_output=args.qr_output,
        )
        return response
    raise UsageError(f"unknown command: {args.command}")


def main(argv: list[str] | None = None) -> int:
    configure_standard_streams()
    parser = build_parser()
    args = parser.parse_args(argv)
    token = ""
    try:
        token = load_access_token(args.config)
        client = FlashAppClient(token)
        if args.command == "release":
            project = _project_directory(args.project_dir)
            package = validate_package(args.package)
            artifact_id = resolve_release_artifact_id(
                project,
                explicit_artifact_id=args.artifact_id,
                new_artifact=args.new_artifact,
            )
            response = client.release(
                package,
                artifact_id=artifact_id,
                preview=args.preview,
                timeout=args.timeout,
            )
        else:
            response, _updated = query_and_update_identity(
                client,
                args.instance_id,
                args.project_dir,
                replace=args.replace_artifact_id,
                timeout=args.timeout,
                preview=args.preview,
                qr_output=args.qr_output,
            )
        print(json.dumps(response, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except FlashAppError as exc:
        sys.stderr.write(f"ERROR: {_redact(exc, token)}\n")
        return exc.exit_code
    except KeyboardInterrupt:
        sys.stderr.write("ERROR: interrupted\n")
        return 130
    except Exception as exc:
        sys.stderr.write(
            f"ERROR: unexpected {type(exc).__name__}: {_redact(exc, token)}\n"
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
