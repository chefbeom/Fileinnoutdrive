import tempfile
import unittest
from pathlib import Path

from fileinnout_desktop_models import DesktopError
from fileinnout_desktop_profiles import (
    add_or_update_sync_folder_profile,
    configured_sync_folders,
    ensure_shared_sync_profile,
    join_scope_rel,
    normalize_sync_direction,
    shared_profile_direction,
    strip_scope_rel,
    unique_local_child_path,
    unique_profile_name,
    unique_remote_path,
)


class DesktopProfileHelperTest(unittest.TestCase):
    def test_normalizes_direction_aliases(self):
        self.assertEqual(normalize_sync_direction('push'), 'upload')
        self.assertEqual(normalize_sync_direction('cloud_to_local'), 'download')
        self.assertEqual(normalize_sync_direction('unexpected'), 'two-way')

    def test_joins_and_strips_scoped_paths(self):
        self.assertEqual(join_scope_rel('Team Docs', 'Plan/report.txt'), 'Team Docs/Plan/report.txt')
        self.assertEqual(join_scope_rel('', 'Plan/report.txt'), 'Plan/report.txt')
        self.assertEqual(strip_scope_rel('Team Docs/Plan/report.txt', 'Team Docs'), 'Plan/report.txt')
        self.assertEqual(strip_scope_rel('Team Docs', 'Team Docs'), '')
        self.assertIsNone(strip_scope_rel('Other/report.txt', 'Team Docs'))

    def test_configured_sync_folders_normalizes_profiles_and_legacy(self):
        config = {
            'syncFolders': [
                {'name': 'Docs', 'localPath': 'C:/Sync/Docs', 'remotePath': 'Team/Docs', 'direction': 'pull', 'permission': 'read'},
                {'name': 'Bad'},
            ]
        }
        self.assertEqual(configured_sync_folders(config), [{
            'name': 'Docs',
            'localPath': 'C:/Sync/Docs',
            'remotePath': 'Team/Docs',
            'direction': 'download',
            'enabled': True,
            'permission': 'READ',
        }])
        legacy = configured_sync_folders({'syncDir': 'C:/Sync/Legacy'})
        self.assertEqual(legacy[0]['remotePath'], 'Legacy')

    def test_add_or_update_sync_folder_profile_rejects_overlaps(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = root / 'First'
            nested = first / 'Nested'
            first.mkdir()
            nested.mkdir()
            config = {}
            profile, added = add_or_update_sync_folder_profile(config, first, remote_path='First')
            self.assertTrue(added)
            self.assertEqual(profile['remotePath'], 'First')
            with self.assertRaises(DesktopError):
                add_or_update_sync_folder_profile(config, nested, remote_path='Nested')

    def test_unique_name_helpers(self):
        used = {'docs'}
        self.assertEqual(unique_remote_path('Docs', used), 'Docs 2')
        self.assertIn('docs 2', used)
        profiles = [{'name': 'Team', 'remotePath': 'Shared/a/Team'}]
        self.assertEqual(unique_profile_name(profiles, 'Team', 'Shared/b/Team'), 'Team 2')
        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp)
            (parent / 'Plan.txt').write_text('x', encoding='utf-8')
            self.assertEqual(unique_local_child_path(parent, 'Plan.txt').name, 'Plan (2).txt')

    def test_ensure_shared_sync_profile(self):
        config = {'syncFolders': []}
        item = {'nodeType': 'FOLDER', 'permission': 'READ'}
        self.assertTrue(ensure_shared_sync_profile(config, 'Shared/owner@example.com/Team', item))
        profile = config['syncFolders'][0]
        self.assertEqual(profile['remotePath'], 'Shared/owner@example.com/Team')
        self.assertEqual(profile['direction'], 'download')
        self.assertEqual(profile['permission'], 'READ')
        self.assertFalse(ensure_shared_sync_profile(config, 'Shared/owner@example.com/File', {'nodeType': 'FILE'}))
        self.assertEqual(shared_profile_direction({'permission': 'UPLOAD'}), 'upload')


if __name__ == '__main__':
    unittest.main()