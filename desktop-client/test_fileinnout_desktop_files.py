import os
from pathlib import Path
import stat
import tempfile
import unittest

from fileinnout_desktop_files import make_file_readonly, make_file_writable, make_tree_writable


class DesktopFileHelperTest(unittest.TestCase):
    def test_make_file_readonly_and_writable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "file.txt"
            path.write_text("data", encoding="utf-8")

            make_file_readonly(path)
            readonly_mode = path.stat().st_mode
            self.assertFalse(readonly_mode & stat.S_IWUSR)

            make_file_writable(path)
            writable_mode = path.stat().st_mode
            self.assertTrue(writable_mode & stat.S_IWUSR)

    def test_make_tree_writable_tolerates_nested_readonly_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            nested_dir = root / "nested"
            nested_dir.mkdir()
            file_path = nested_dir / "file.txt"
            file_path.write_text("data", encoding="utf-8")
            make_file_readonly(file_path)

            make_tree_writable(root)

            self.assertTrue(file_path.stat().st_mode & stat.S_IWUSR)
            os.remove(file_path)


if __name__ == "__main__":
    unittest.main()