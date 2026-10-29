import unittest
from unittest.mock import MagicMock
from notification_engine import NotificationEngine

class TestNotificationEngine(unittest.TestCase):
    def test_notification_ingestion(self):
        # Arrange
        notification_engine = NotificationEngine()
        mock_notification = MagicMock()
        mock_notification.packageName = "com.whatsapp"
        mock_notification.extras.getCharSequence.return_value = "Test message"

        # Act
        notification_engine.onNotificationPosted(mock_notification)

        # Assert
        self.assertTrue(notification_engine.is_notification_ingested())

    def test_notification_filtering(self):
        # Arrange
        notification_engine = NotificationEngine()
        mock_notification = MagicMock()
        mock_notification.packageName = "com.system"

        # Act
        notification_engine.onNotificationPosted(mock_notification)

        # Assert
        self.assertFalse(notification_engine.is_notification_ingested())

if __name__ == '__main__':
    unittest.main()