import unittest
from unittest.mock import patch
import public_candidates
from public_candidates import candidate_name, linkedin_url

class CandidateDiscoveryTests(unittest.TestCase):
    def test_extracts_name_from_linkedin_result_title(self):
        self.assertEqual(candidate_name("Jane Smith - HGV Driver - LinkedIn"), "Jane Smith")
    def test_rejects_generic_title(self):
        self.assertIsNone(candidate_name("LinkedIn"))

    @patch("public_candidates.time.sleep", lambda _: None)
    @patch("public_candidates.profile_metadata")
    @patch("public_candidates.inspect_avatar")
    @patch("public_candidates.fetch_public_avatar")
    @patch("public_candidates.search_web")
    def test_only_badge_verified_candidates_are_returned(self, search, fetch_avatar, inspect, metadata):
        search.side_effect = [
            [
                {"title":"Jane Smith - HGV Driver - LinkedIn","url":"https://www.linkedin.com/in/jane-smith/","snippet":""},
                {"title":"John Brown - HGV Driver - LinkedIn","url":"https://www.linkedin.com/in/john-brown/","snippet":""},
            ],
            [],
        ]
        metadata.return_value={"avatar_url":"https://media.licdn.com/photo.jpg","page_title":"Candidate"}
        fetch_avatar.return_value=b"image"
        inspect.side_effect=[
            {"is_open_to_work":True,"status":"verified","confidence":0.9},
            {"is_open_to_work":False,"status":"unverified","confidence":0.0},
        ]
        progress=[]
        result=public_candidates.run_candidate_search({"role":"HGV Driver","location":"Cheshire","limit":10},progress.append)
        self.assertEqual(result["returned"],1)
        self.assertEqual(result["items"][0]["name"],"Jane Smith")
        self.assertTrue(result["items"][0]["open_to_work_verified"])
        self.assertEqual(result["items"][0]["cv_status"],"not_found")
        self.assertEqual(result["unverified"],1)

    def test_only_linkedin_profile_urls(self):
        self.assertTrue(linkedin_url("https://www.linkedin.com/in/jane-smith/"))
        self.assertFalse(linkedin_url("https://example.com/in/jane-smith"))

if __name__ == "__main__":
    unittest.main()
