import unittest
from unittest.mock import MagicMock
from screen_crawler import ScreenCrawler

class TestScreenCrawler(unittest.TestCase):
    def test_screen_crawling(self):
        # Arrange
        screen_crawler = ScreenCrawler()
        mock_layout = MagicMock()
        mock_layout.traverse.return_value = ["Test text"]

        # Act
        screen_crawler.crawl_screen(mock_layout)

        # Assert
        self.assertTrue(screen_crawler.is_screen_crawled())

    def test_layout_traversal(self):
        # Arrange
        screen_crawler = ScreenCrawler()
        mock_layout = MagicMock()
        mock_layout.traverse.return_value = ["Test text"]

        # Act
        screen_crawler.traverse_layout(mock_layout)

        # Assert
        self.assertTrue(screen_crawler.is_layout_traversed())

if __name__ == '__main__':
    unittest.main()