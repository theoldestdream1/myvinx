import unittest
from unittest.mock import Mock

class TestSystemSyncEngine(unittest.TestCase):
    def test_sync_engine(self):
        # Mock the WorkManager
        work_manager = Mock()
        work_manager.enqueue = Mock(return_value=None)

        # Test the system sync engine
        system_sync_engine = SystemSyncEngine(work_manager)
        system_sync_engine.sync_data()

        # Assert that the WorkManager was called
        work_manager.enqueue.assert_called_once()

if __name__ == '__main__':
    unittest.main()