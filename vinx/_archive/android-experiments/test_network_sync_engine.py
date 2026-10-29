import unittest
from unittest.mock import MagicMock
from network_sync_engine import NetworkSyncEngine

class TestNetworkSyncEngine(unittest.TestCase):
    def test_network_sync(self):
        # Arrange
        network_sync_engine = NetworkSyncEngine()
        mock_data = MagicMock()
        mock_data.id = 1
        mock_data.source_app = "com.whatsapp"
        mock_data.capture_type = "notification"
        mock_data.raw_content = "Test message"

        # Act
        network_sync_engine.sync_data(mock_data)

        # Assert
        self.assertTrue(network_sync_engine.is_data_synced())

    def test_atomic_transmission_loop(self):
        # Arrange
        network_sync_engine = NetworkSyncEngine()
        mock_data = MagicMock()
        mock_data.id = 1
        mock_data.source_app = "com.whatsapp"
        mock_data.capture_type = "notification"
        mock_data.raw_content = "Test message"

        # Act
        network_sync_engine.sync_data(mock_data)

        # Assert
        self.assertTrue(network_sync_engine.is_transmission_loop_atomic())

if __name__ == '__main__':
    unittest.main()