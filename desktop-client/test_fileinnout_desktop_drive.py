from pathlib import Path
import unittest

from fileinnout_desktop_drive import (
    configured_drive_root,
    drive_letter_target_to_drive_root,
    logical_desktop_target_path,
    logical_relative_path,
    path_is_inside,
    path_is_inside_logical,
    safe_drive_link_name,
    shared_drive_link_name,
    shared_remote_parts,
)


class DesktopDriveHelperTest(unittest.TestCase):
    def test_sanitizes_drive_link_names(self) -> None:
        self.assertEqual(safe_drive_link_name('Project: Plan*.', ''), 'Project_ Plan_')
        self.assertEqual(safe_drive_link_name('', Path('C:/Sync/Reports')), 'Reports')
        self.assertEqual(safe_drive_link_name('...', ''), 'Sync folder')

    def test_resolves_shared_remote_names(self) -> None:
        self.assertEqual(
            shared_remote_parts('Shared/owner@example.com/Team Docs'),
            ('owner@example.com', 'Team Docs'),
        )
        self.assertEqual(shared_remote_parts('My Drive/Team Docs'), ('', ''))
        self.assertEqual(
            shared_drive_link_name(
                {'name': 'Team Docs (owner@example.com)'},
                'Shared/owner@example.com/Team Docs',
                'C:/Sync/Team Docs',
            ),
            'Team Docs',
        )

    def test_resolves_drive_letter_targets_to_configured_root(self) -> None:
        config = {'driveRoot': 'C:/Users/test/FileInNOut', 'driveLetter': 'F'}

        self.assertEqual(configured_drive_root(config), Path('C:/Users/test/FileInNOut'))
        mapped = drive_letter_target_to_drive_root(config, 'F:/Shared/owner/Team')
        self.assertIsNotNone(mapped)
        self.assertEqual(str(mapped).replace('\\', '/'), 'C:/Users/test/FileInNOut/Shared/owner/Team')
        self.assertEqual(logical_desktop_target_path(config, 'F:/Shared/owner/Team'), mapped)
        self.assertIsNone(drive_letter_target_to_drive_root(config, 'G:/Shared/owner/Team'))

    def test_logical_containment_and_relative_paths(self) -> None:
        root = Path('C:/Sync')
        child = Path('C:/Sync/Folder/Plan.txt')

        self.assertTrue(path_is_inside(root, child))
        self.assertTrue(path_is_inside_logical(root, child))
        self.assertEqual(logical_relative_path(root, child), 'Folder/Plan.txt')
        self.assertEqual(logical_relative_path(root, root), '')
        self.assertIsNone(logical_relative_path(root, Path('C:/Other/Plan.txt')))


if __name__ == '__main__':
    unittest.main()
