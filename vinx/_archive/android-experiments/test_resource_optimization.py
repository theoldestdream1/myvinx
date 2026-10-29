import unittest
from unittest.mock import MagicMock
from resource_optimization import ResourceOptimization

class TestResourceOptimization(unittest.TestCase):
    def test_resource_optimization(self):
        # Arrange
        resource_optimization = ResourceOptimization()
        mock_data = MagicMock()
        mock_data.id = 1
        mock_data.source_app = "com.whatsapp"
        mock_data.capture_type = "notification"
        mock_data.raw_content = "Test message"

        # Act
        resource_optimization.optimize_resources(mock_data)

        # Assert
        self.assertTrue(resource_optimization.is_resource_optimized())

    def test_battery_exemptions(self):
        # Arrange
        resource_optimization = ResourceOptimization()
        mock_data = MagicMock()
        mock_data.id = 1
        mock_data.source_app = "com.whatsapp"
        mock_data.capture_type = "notification"
        mock_data.raw_content = "Test message"

        # Act
        resource_optimization.optimize_resources(mock_data)

        # Assert
        self.assertTrue(resource_optimization.is_battery_exempt())

if __name__ == '__main__':
    unittest.main()