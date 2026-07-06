from pathlib import Path
import unittest

from fileinnout_desktop_paths import (
    can_treat_as_local_file_move,
    can_treat_as_local_folder_move,
    has_ancestor_rel,
    is_descendant_rel,
    normalize_rel,
    parent_rel_of,
    rel_suffix_under,
    replace_rel_prefix,
    safe_segment,
)


class DesktopPathHelperTest(unittest.TestCase):
    def test_path_helpers(self) -> None:
        self.assertEqual(normalize_rel(r"/Shared\\owner@example.com\\Team/../Plan"), "Shared/owner@example.com/Team/Plan")
        self.assertEqual(safe_segment('bad<>:"\\|?*name. '), "bad________name")
        self.assertTrue(is_descendant_rel("Team/Docs/Plan.txt", "Team/Docs"))
        self.assertFalse(is_descendant_rel("TeamX/Docs", "Team"))
        self.assertEqual(replace_rel_prefix("Team/Docs/Plan.txt", "Team", "Archive"), "Archive/Docs/Plan.txt")
        self.assertEqual(replace_rel_prefix("Team/Docs", "Team/Docs", "Archive/Docs"), "Archive/Docs")
        self.assertTrue(has_ancestor_rel("Team/Docs/Plan.txt", {"Team"}))
        self.assertEqual(parent_rel_of("Team/Docs/Plan.txt"), "Team/Docs")
        self.assertEqual(parent_rel_of("Plan.txt"), "")
        self.assertTrue(can_treat_as_local_file_move("Team/old.txt", "Team/new.txt"))
        self.assertTrue(can_treat_as_local_file_move("Old/name.txt", "New/name.txt"))
        self.assertTrue(can_treat_as_local_folder_move("Team/Old", "Team/New"))
        self.assertEqual(rel_suffix_under("Team/Docs/Plan.txt", "Team"), "Docs/Plan.txt")
        self.assertEqual(rel_suffix_under("Team", "Team"), "")
        self.assertEqual(normalize_rel(Path("Team") / "Docs"), "Team/Docs")


if __name__ == "__main__":
    unittest.main()