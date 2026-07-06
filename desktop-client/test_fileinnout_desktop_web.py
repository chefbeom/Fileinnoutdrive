import os
from pathlib import Path
import unittest
from unittest.mock import patch

from fileinnout_desktop_models import DesktopError
from fileinnout_desktop_web import (
    build_share_address,
    default_backend_url,
    desktop_web_url_for_cloud_path,
    frontend_url_from_config,
    parse_share_address,
    tsv_field,
)


class DesktopWebHelperTest(unittest.TestCase):
    def test_backend_and_frontend_url_defaults(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(default_backend_url(), "http://localhost/api")
            self.assertEqual(frontend_url_from_config({}), "http://localhost")

        with patch.dict(os.environ, {"FILEINNOUT_DESKTOP_SERVER": "   "}):
            self.assertEqual(default_backend_url(), "http://localhost/api")

        with patch.dict(os.environ, {"FILEINNOUT_DESKTOP_SERVER": "https://drive.example.com/api/"}):
            self.assertEqual(default_backend_url(), "https://drive.example.com/api")
            self.assertEqual(frontend_url_from_config({}), "https://drive.example.com")

        self.assertEqual(
            frontend_url_from_config({"server": "https://drive.example.com/api"}),
            "https://drive.example.com",
        )
        self.assertEqual(
            frontend_url_from_config({"frontendUrl": "https://app.example.com/", "server": "https://api.example.com/api"}),
            "https://app.example.com",
        )

    def test_desktop_web_url_for_cloud_path_routes_personal_and_shared_paths(self) -> None:
        config = {"frontendUrl": "https://drive.example.com"}

        self.assertEqual(
            desktop_web_url_for_cloud_path(config, Path("Team") / "Plan.txt"),
            "https://drive.example.com/main/home?desktopPath=Team%2FPlan.txt",
        )
        self.assertEqual(
            desktop_web_url_for_cloud_path(config, "Shared/owner@example.com/Team"),
            "https://drive.example.com/main/shareFile?desktopPath=Shared%2Fowner%40example.com%2FTeam",
        )

    def test_build_share_address_uses_login_email_for_owned_paths(self) -> None:
        self.assertEqual(
            build_share_address({"email": "owner@example.com"}, "Team"),
            "fileinnout://shared/owner%40example.com/Team",
        )
        self.assertEqual(
            build_share_address({}, "Shared/owner@example.com/Team"),
            "fileinnout://shared/owner%40example.com/Team",
        )
        with self.assertRaises(DesktopError):
            build_share_address({}, "Team")

    def test_parse_share_address_accepts_scheme_plain_and_query_forms(self) -> None:
        self.assertEqual(
            parse_share_address("fileinnout://shared/owner%40example.com/Team"),
            "Shared/owner@example.com/Team",
        )
        self.assertEqual(
            parse_share_address("fileinnout://owner%40example.com/Team"),
            "Shared/owner@example.com/Team",
        )
        self.assertEqual(
            parse_share_address("Shared/owner@example.com/Team"),
            "Shared/owner@example.com/Team",
        )
        self.assertEqual(
            parse_share_address("fileinnout://shared?path=Shared%2Fowner%40example.com%2FTeam"),
            "Shared/owner@example.com/Team",
        )
        with self.assertRaises(DesktopError):
            parse_share_address("fileinnout://shared")

    def test_tsv_field_flattens_control_separators(self) -> None:
        self.assertEqual(tsv_field(" alpha\tbeta\r\n gamma "), "alpha beta   gamma")

if __name__ == "__main__":
    unittest.main()
