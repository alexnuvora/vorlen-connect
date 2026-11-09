import unittest
from public_candidates import candidate_name, linkedin_url

class CandidateDiscoveryTests(unittest.TestCase):
    def test_extracts_name_from_linkedin_result_title(self):
        self.assertEqual(candidate_name("Jane Smith - HGV Driver - LinkedIn"), "Jane Smith")
    def test_rejects_generic_title(self):
        self.assertIsNone(candidate_name("LinkedIn"))
    def test_only_linkedin_profile_urls(self):
        self.assertTrue(linkedin_url("https://www.linkedin.com/in/jane-smith/"))
        self.assertFalse(linkedin_url("https://example.com/in/jane-smith"))

if __name__ == "__main__":
    unittest.main()
