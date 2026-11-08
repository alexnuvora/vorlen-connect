import io
import unittest
from PIL import Image
from open_to_work import inspect_avatar, fetch_public_avatar


class OpenToWorkDetectorTests(unittest.TestCase):
    def png(self, color=(40, 80, 120)):
        image = Image.new("RGB", (240, 240), color)
        out = io.BytesIO()
        image.save(out, format="PNG")
        return out.getvalue()

    def test_plain_avatar_is_not_verified(self):
        result = inspect_avatar(self.png(), ocr_engine=lambda image: "")
        self.assertFalse(result["is_open_to_work"])
        self.assertEqual(result["status"], "unverified")

    def test_requires_ocr_confirmation(self):
        image = Image.new("RGB", (240, 240), (30, 30, 30))
        px = image.load()
        import math
        for y in range(240):
            for x in range(240):
                radius = math.sqrt(((x-120)/100)**2 + ((y-120)/100)**2)
                if .78 <= radius <= 1.08:
                    px[x,y] = (20, 180, 70)
        out=io.BytesIO(); image.save(out,format="PNG")
        result=inspect_avatar(out.getvalue(),ocr_engine=lambda image:"")
        self.assertFalse(result["is_open_to_work"])
        self.assertEqual(result["reason"],"OPEN_TO_WORK_TEXT_NOT_CONFIRMED")

    def test_rejects_non_linkedin_image_hosts(self):
        with self.assertRaises(ValueError):
            fetch_public_avatar("https://example.com/avatar.jpg")


if __name__ == "__main__":
    unittest.main()
