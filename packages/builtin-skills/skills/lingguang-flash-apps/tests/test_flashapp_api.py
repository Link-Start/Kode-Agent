from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "flashapp_api.py"
SPEC = importlib.util.spec_from_file_location("flashapp_api", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
flashapp_api = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(flashapp_api)


class EndpointConfigTests(unittest.TestCase):
    def test_defaults_use_production_endpoints(self) -> None:
        self.assertEqual(
            flashapp_api.API_BASE_URL, "https://cognihome.lingguang.com"
        )
        self.assertEqual(flashapp_api.WEB_ORIGIN, "https://www.lingguang.com")
        self.assertEqual(flashapp_api.WEB_REFERER, "https://www.lingguang.com/")
        self.assertEqual(
            flashapp_api.TOKEN_SETTINGS_URL,
            "https://www.lingguang.com/settings",
        )


class ReleaseModeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = flashapp_api.FlashAppClient(
            "test-token", base_url="http://localhost"
        )

    def test_preview_flag_is_opt_in(self) -> None:
        parser = flashapp_api.build_parser()

        formal_args = parser.parse_args(["release", "--package", "/tmp/app.tar.gz"])
        preview_args = parser.parse_args(
            ["release", "--package", "/tmp/app.tar.gz", "--preview"]
        )

        self.assertFalse(formal_args.preview)
        self.assertTrue(preview_args.preview)

    def test_preview_release_sends_preview_true(self) -> None:
        prefix = self.client._multipart_prefix(
            "boundary",
            Path("app.tar.gz"),
            artifact_id=None,
            preview=True,
        )

        self.assertIn(b'name="preview"', prefix)
        self.assertIn(b"true\r\n", prefix)

    def test_formal_release_omits_preview_field(self) -> None:
        prefix = self.client._multipart_prefix(
            "boundary",
            Path("app.tar.gz"),
            artifact_id="flashapp-existing",
            preview=False,
        )

        self.assertNotIn(b'name="preview"', prefix)
        self.assertIn(b'name="artifactId"', prefix)

    def test_query_preview_flag_is_opt_in(self) -> None:
        parser = flashapp_api.build_parser()

        formal_args = parser.parse_args(["query", "--instance-id", "formal-1"])
        preview_args = parser.parse_args(
            ["query", "--instance-id", "preview-1", "--preview"]
        )

        self.assertFalse(formal_args.preview)
        self.assertTrue(preview_args.preview)


class WindowsCompatibilityTests(unittest.TestCase):
    def test_windows_config_path_uses_appdata(self) -> None:
        path = flashapp_api.default_config_path(
            environ={"APPDATA": "C:/Users/Alice/AppData/Roaming"},
            home=Path("C:/Users/Alice"),
            platform_name="nt",
        )

        self.assertEqual(
            path,
            Path("C:/Users/Alice/AppData/Roaming/lingguang-flash-apps/config.json"),
        )

    def test_windows_config_path_falls_back_to_home_appdata(self) -> None:
        path = flashapp_api.default_config_path(
            environ={},
            home=Path("C:/Users/Alice"),
            platform_name="nt",
        )

        self.assertEqual(
            path,
            Path("C:/Users/Alice/AppData/Roaming/lingguang-flash-apps/config.json"),
        )

    def test_windows_qr_cache_uses_localappdata(self) -> None:
        path = flashapp_api.default_qr_cache_directory(
            environ={"LOCALAPPDATA": "C:/Users/Alice/AppData/Local"},
            home=Path("C:/Users/Alice"),
            platform_name="nt",
        )

        self.assertEqual(
            path,
            Path("C:/Users/Alice/AppData/Local/lingguang-flash-apps/qrcodes"),
        )

    def test_windows_default_config_falls_back_to_legacy_dot_config(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            home = Path(temporary_directory)
            new_path = home / "AppData/Roaming/lingguang-flash-apps/config.json"
            legacy_path = home / ".config/lingguang-flash-apps/config.json"
            legacy_path.parent.mkdir(parents=True)
            legacy_path.write_text('{"access_token":"test-token"}', encoding="utf-8")

            resolved = flashapp_api.resolve_config_path(
                new_path,
                environ={"APPDATA": str(home / "AppData/Roaming")},
                home=home,
                platform_name="nt",
            )

        self.assertEqual(resolved, legacy_path.resolve())

    def test_windows_stdio_is_reconfigured_to_utf8(self) -> None:
        stdout = mock.Mock()
        stderr = mock.Mock()

        flashapp_api.configure_standard_streams(
            platform_name="nt",
            stdout=stdout,
            stderr=stderr,
        )

        stdout.reconfigure.assert_called_once_with(encoding="utf-8", errors="replace")
        stderr.reconfigure.assert_called_once_with(encoding="utf-8", errors="replace")

    def test_dependency_install_command_uses_current_python_interpreter(self) -> None:
        command = flashapp_api.pip_install_command(
            executable=r"C:\Program Files\Python\python.exe",
            platform_name="nt",
        )

        self.assertIn('"C:\\Program Files\\Python\\python.exe"', command)
        self.assertIn("-m pip install -r", command)
        self.assertNotIn("python3", command)


class QrTargetTests(unittest.TestCase):
    def test_qr_target_double_encodes_original_url_with_encode_uri_component_rules(
        self,
    ) -> None:
        original_url = "https://content.example.com/p/demo/index.html?x=1&y=a-b"

        target = flashapp_api.build_qr_target_url(original_url)

        self.assertEqual(
            target,
            "leopards://platformapi/startapp?appId=20002117&target=flashAppDetail&"
            "fullUrl=https%3A%2F%2Fagi-static.lingguang.com%2Fapp-shell.html%3F"
            "html_url%3Dhttps%253A%252F%252Fcontent.example.com%252Fp%252Fdemo%252F"
            "index.html%253Fx%253D1%2526y%253Da-b",
        )


class ReleaseSummaryTests(unittest.TestCase):
    def test_pass_result_generates_complete_summary_and_svg_qr_code(self) -> None:
        result = {
            "name": "简易计算器",
            "artifactId": "flashapp-123",
            "artifactVersion": "7",
            "packageUrl": "https://preview.lingguangcontent.com/example/index.html",
            "status": "PASS",
        }

        with tempfile.TemporaryDirectory() as temporary_directory:
            qr_path = Path(temporary_directory) / "release.svg"
            summary = flashapp_api.build_release_summary(
                result,
                preview=True,
                qr_output=qr_path,
            )

            self.assertEqual(
                summary,
                {
                    "name": "简易计算器",
                    "artifactId": "flashapp-123",
                    "artifactVersion": "7",
                    "releaseType": "preview",
                    "qrCodePath": str(qr_path.resolve()),
                },
            )
            self.assertNotIn("accessUrl", summary)
            self.assertTrue(qr_path.is_file())
            svg = qr_path.read_text(encoding="utf-8")
            self.assertIn("<svg", svg)
            self.assertIn("<path", svg)

    def test_summary_encodes_deep_link_in_qr_instead_of_original_url(self) -> None:
        original_url = "https://content.example.com/p/qr-target/index.html"
        result = {
            "name": "深链测试",
            "artifactId": "flashapp-deep-link",
            "artifactVersion": "2",
            "packageUrl": original_url,
            "status": "PASS",
        }

        with tempfile.TemporaryDirectory() as temporary_directory:
            qr_path = Path(temporary_directory) / "deep-link.svg"
            with mock.patch.object(
                flashapp_api,
                "generate_qr_code",
                return_value=qr_path.resolve(),
            ) as generate_qr_code:
                flashapp_api.build_release_summary(
                    result,
                    preview=True,
                    qr_output=qr_path,
                )

        generate_qr_code.assert_called_once_with(
            flashapp_api.build_qr_target_url(original_url),
            qr_path,
        )

    def test_non_pass_query_does_not_generate_release_summary(self) -> None:
        client = _StubClient(
            {
                "success": True,
                "code": "SUCCESS",
                "result": {"status": "BUILDING"},
            }
        )

        with tempfile.TemporaryDirectory() as project_directory:
            response, updated = flashapp_api.query_and_update_identity(
                client,
                "instance-123",
                Path(project_directory),
                replace=False,
                timeout=30.0,
                preview=False,
            )

        self.assertFalse(updated)
        self.assertNotIn("releaseSummary", response)

    def test_pass_query_adds_summary_qr_code_and_identity(self) -> None:
        client = _StubClient(
            {
                "success": True,
                "code": "SUCCESS",
                "result": {
                    "name": "天气卡片",
                    "artifactId": "flashapp-weather",
                    "artifactVersion": 3,
                    "packageUrl": "https://lingguangcontent.com/weather/index.html",
                    "status": "PASS",
                },
            }
        )

        with tempfile.TemporaryDirectory() as temporary_directory:
            project_directory = Path(temporary_directory) / "project"
            project_directory.mkdir()
            qr_path = Path(temporary_directory) / "formal-release.svg"
            response, updated = flashapp_api.query_and_update_identity(
                client,
                "instance-formal",
                project_directory,
                replace=False,
                timeout=30.0,
                preview=False,
                qr_output=qr_path,
            )

            self.assertTrue(updated)
            self.assertEqual(response["releaseSummary"]["artifactVersion"], "3")
            self.assertEqual(response["releaseSummary"]["releaseType"], "formal")
            self.assertEqual(
                response["releaseSummary"]["viewHint"],
                "可前往灵光 App 或网页版「我的创作」查看",
            )
            self.assertNotIn("accessUrl", response["releaseSummary"])
            self.assertNotIn("packageUrl", response["result"])
            self.assertEqual(
                response["releaseSummary"]["qrCodePath"], str(qr_path.resolve())
            )
            self.assertTrue(qr_path.is_file())
            identity = flashapp_api.load_identity(project_directory)
            self.assertEqual(identity["artifactId"], "flashapp-weather")

    def test_preview_pass_query_hides_original_url_and_has_no_formal_hint(self) -> None:
        client = _StubClient(
            {
                "success": True,
                "code": "SUCCESS",
                "result": {
                    "name": "预览应用",
                    "artifactId": "flashapp-preview",
                    "artifactVersion": "1",
                    "packageUrl": "https://preview.example.com/app/index.html",
                    "status": "PASS",
                },
            }
        )

        with tempfile.TemporaryDirectory() as temporary_directory:
            project_directory = Path(temporary_directory) / "project"
            project_directory.mkdir()
            response, _updated = flashapp_api.query_and_update_identity(
                client,
                "instance-preview",
                project_directory,
                replace=False,
                timeout=30.0,
                preview=True,
                qr_output=Path(temporary_directory) / "preview.svg",
            )

        self.assertNotIn("packageUrl", response["result"])
        self.assertNotIn("accessUrl", response["releaseSummary"])
        self.assertNotIn("viewHint", response["releaseSummary"])
        self.assertEqual(response["releaseSummary"]["releaseType"], "preview")
        self.assertNotIn(
            "preview.example.com", json.dumps(response, ensure_ascii=False)
        )

    def test_missing_success_metadata_does_not_write_identity(self) -> None:
        client = _StubClient(
            {
                "success": True,
                "code": "SUCCESS",
                "result": {
                    "artifactId": "flashapp-incomplete",
                    "status": "PASS",
                },
            }
        )

        with tempfile.TemporaryDirectory() as project_directory:
            with self.assertRaises(flashapp_api.ResponseFormatError):
                flashapp_api.query_and_update_identity(
                    client,
                    "instance-incomplete",
                    Path(project_directory),
                    replace=False,
                    timeout=30.0,
                    preview=True,
                )
            self.assertIsNone(flashapp_api.load_identity(Path(project_directory)))


class _StubClient:
    def __init__(self, response: dict[str, object]):
        self.response = response

    def query(self, instance_id: str, *, timeout: float) -> dict[str, object]:
        return self.response


if __name__ == "__main__":
    unittest.main()
