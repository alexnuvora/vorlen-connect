import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "worker"))
from native_jobs import parse_cards, parse_detail

class NativeJobsParserTests(unittest.TestCase):
    def test_card_extracts_job_id_company_title_and_location(self):
        html = """<ul><li><div class="base-card"><a href="/jobs/view/software-engineer-at-example-1234567890"><div class="base-search-card__title">Software Engineer</div></a><a href="/company/example"><h4 class="base-search-card__subtitle">Example Ltd</h4></a><div class="job-search-card__location">Manchester, England</div><time datetime="2026-10-23">2 hours ago</time></div></li></ul>"""
        jobs = parse_cards(html, "Software Engineer")
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["job_id"], "1234567890")
        self.assertEqual(jobs[0]["job_title"], "Software Engineer")
        self.assertEqual(jobs[0]["company_name"], "Example Ltd")
        self.assertEqual(jobs[0]["location"], "Manchester, England")
        self.assertEqual(jobs[0]["posted_date"], "2026-10-23")

    def test_detail_keeps_paragraphs_company_url_and_qualified_applicant_count(self):
        html = """<div class="topcard__org-name-link" href="https://www.linkedin.com/company/example-ltd">Example Ltd</div><div class="show-more-less-html__markup"><p>First paragraph with responsibilities.</p><p>Contact hiring@example.com for details.</p></div><div>Over 200 applicants</div><h3>Employment type</h3><span>Full-time</span>"""
        # Anchor semantics matter for company URL; href before class is a common real-world order.
        html = html.replace('<div class="topcard__org-name-link" href=', '<a href=').replace('">Example Ltd</div>', '" class="topcard__org-name-link">Example Ltd</a>')
        item = parse_detail(html, {"job_id":"1234567890","job_url":"https://www.linkedin.com/jobs/view/1234567890","job_title":"Example role","company_name":"Example Ltd"})
        self.assertIn("First paragraph", item["job_description"])
        self.assertIn("Contact hiring@example.com", item["job_description"])
        self.assertEqual(item["contact_email"], "hiring@example.com")
        self.assertEqual(item["company_url"], "https://www.linkedin.com/company/example-ltd")
        self.assertEqual(item["num_applicants"], "Over 200 applicants")
        self.assertEqual(item["employment_type"], "Full-time")

if __name__ == "__main__":
    unittest.main()
