import unittest
from unittest.mock import MagicMock
from database_caching import DatabaseCaching

class TestDatabaseCaching(unittest.TestCase):
    def test_database_caching(self):
        # Arrange
        database_caching = DatabaseCaching()
        mock_data = MagicMock()
        mock_data.id = 1
        mock_data.source_app = "com.whatsapp"
        mock_data.capture_type = "notification"
        mock_data.raw_content = "Test message"

        # Act
        database_caching.cache_data(mock_data)

        # Assert
        self.assertTrue(database_caching.is_data_cached())

    def test_auto_pruning(self):
        # Arrange
        database_caching = DatabaseCaching()
        mock_data = MagicMock()
        mock_data.id = 1
        mock_data.source_app = "com.whatsapp"
        mock_data.capture_type = "notification"
        mock_data.raw_content = "Test message"

        # Act
        database_caching.cache_data(mock_data)
        database_caching.prune_data()

        # Assert
        self.assertFalse(database_caching.is_data_cached())

if __name__ == '__main__':
    unittest.main()