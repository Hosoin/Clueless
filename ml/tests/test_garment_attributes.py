"""Offline unit and API contract tests; all model calls are synthetic/mocked."""

import base64
import io
import json
import tempfile
import unittest
from hashlib import sha256
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np
import torch
from fastapi.testclient import TestClient
from PIL import Image
from torchvision.ops import MLP

from ml import api, garment, garment_attributes as ga
from ml.garment import GarmentClassifier


class FakeFeatures:
    image_preprocessing = {"resize": None, "center_crop": None}

    def __init__(self):
        self.texture = Mock()
        self.texture.candidates.return_value = [{"label": "니트", "score": 0.25}]
        self.embed = Mock(return_value=torch.eye(512)[:2])


class GarmentAttributeTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.pt = self.root / "test.pt"
        self.image = self.root / "옷.jpg"
        image = Image.new("RGB", (20, 12), "navy")
        exif = image.getexif()
        exif[274] = 6
        image.save(self.image, exif=exif)

    def checkpoint(self, model=None, **overrides):
        if model is None:
            model = torch.nn.Linear(512, 4)
        ck = dict(classes=list(ga.CLASSES), clip=ga.CLIP, clip_revision=ga.CLIP_REVISION, state_dict=model.state_dict())
        ck.update(overrides)
        torch.save(ck, self.pt)

    def test_supported_heads_and_revisions(self):
        self.checkpoint(MLP(512, [64, 4], dropout=0), architecture="MLP512->64->4 ReLU")
        self.assertEqual(ga.load_category_head(self.pt).architecture, "MLP512->64->4 ReLU")
        self.checkpoint()
        self.assertEqual(ga.load_category_head(self.pt).revision_source, "checkpoint_metadata_verified")
        ck = torch.load(self.pt, weights_only=True)
        ck.pop("clip_revision")
        ck["variant"] = "raw"
        torch.save(ck, self.pt)
        with self.assertRaisesRegex(ValueError, "revision missing"):
            ga.load_category_head(self.pt)
        self.assertIn("caller_declared", ga.load_category_head(self.pt, ga.CLIP_REVISION).revision_source)

    def test_reject_wrong_order_revision_dimension_and_nonraw(self):
        for overrides, error in [
            (dict(classes=ga.CLASSES[::-1]), "label order"),
            (dict(clip="other"), "FashionCLIP"),
            (dict(clip_revision="other"), "revision differs"),
            (dict(state_dict=torch.nn.Linear(511, 4).state_dict()), "embedding width"),
            (dict(variant="both"), "raw-trained"),
        ]:
            with self.subTest(overrides=list(overrides)):
                self.checkpoint(**overrides)
                with self.assertRaisesRegex(ValueError, error):
                    ga.load_category_head(self.pt, ga.CLIP_REVISION)

    def test_service_head_never_falls_back(self):
        linear = self.root / "legacy.pt"
        self.checkpoint(variant="raw")
        self.pt.rename(linear)
        digest = sha256(linear.read_bytes()).hexdigest()
        with (patch.object(ga, "GARMENT_CATEGORY_MODEL", "mlp"),
              patch.object(ga, "GARMENT_CATEGORY_WEIGHTS", {"mlp": self.pt, "legacy-linear": linear}),
              patch.dict(ga.SERVICE_HEADS, {"legacy-linear": ("linear", digest)})):
            with self.assertRaises(FileNotFoundError):
                ga.load_service_category_head()
            self.assertEqual(ga.load_service_category_head("legacy-linear").architecture, "linear")
            self.pt.write_bytes(linear.read_bytes())
            with patch.object(ga.torch, "load") as deserialize:
                with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                    ga.load_service_category_head()
                deserialize.assert_not_called()
            with patch.dict(ga.SERVICE_HEADS, {"mlp": (ga.MLP_ARCHITECTURE, digest)}):
                with self.assertRaisesRegex(ValueError, "expected category architecture"):
                    ga.load_service_category_head()

    def test_exif_roi_and_pixel_color_path(self):
        image = ga.read_rgb(self.image)
        self.assertEqual((image.mode, image.size), ("RGB", (12, 20)))
        self.checkpoint()
        features = FakeFeatures()
        regions = ga.RegionSelector("roi", roi=(1, 2, 7, 10))
        extractor = ga.GarmentAttributeExtractor(ga.load_category_head(self.pt), features, regions)
        result = extractor.analyze(self.image)
        inputs = features.embed.call_args.args[0]
        self.assertEqual([x.size for x in inputs], [(12, 20), (6, 8)])
        torch.testing.assert_close(features.texture.candidates.call_args.args[0], torch.eye(512)[1])
        self.assertEqual(result["color"]["input_region"]["bbox_xyxy"], [1, 2, 7, 10])
        self.assertFalse(result["color"]["input_region"]["uses_mask"])
        self.assertEqual(result["color"]["candidates"][0]["ratio"], 1)
        self.assertEqual(result["category"]["input_region"]["kind"], "exif_corrected_full_frame")
        self.assertTrue(result["visual_texture"]["needs_review"])
        self.assertEqual(result["visual_texture"]["score_type"], "cosine_similarity")
        self.assertEqual(result["visual_texture"]["score"], result["visual_texture"]["candidates"][0]["score"])
        self.assertIsNone(result["visual_texture"]["prob"])
        self.assertIsNone(result["fiber_material"])
        with self.assertRaisesRegex(ValueError, "outside"):
            ga.RegionSelector("roi", roi=(0, 0, 13, 12)).select(image)

    def test_mask_and_opt_in_failure_fallback(self):
        image = ga.read_rgb(self.image)
        mask = np.zeros((20, 12), dtype=bool)
        mask[:, 4:7] = True
        with patch.object(ga, "BackgroundRemover") as bg:
            bg.return_value.mask.return_value = mask
            selected = ga.RegionSelector().select(image)
            bg.assert_called_once_with("cpu", local_files_only=True)
            np.testing.assert_array_equal(selected.color_mask, mask)
            self.assertTrue(selected.color_info["uses_mask"])
            self.assertEqual(selected.background_removal["status"], "used")
            bg.return_value.mask.return_value = np.full(mask.shape, True)
            with self.assertRaisesRegex(ValueError, "unusable"):
                ga.RegionSelector().select(image)
        with patch.object(ga, "BackgroundRemover", side_effect=OSError) as bg:
            selector = ga.RegionSelector(mask_fallback=True)
            for status in ("error", "skipped_after_error"):
                selected = selector.select(image)
                self.assertEqual(selected.background_removal["status"], status)
                self.assertEqual(selected.texture_info["kind"], "central_60_percent_rectangle")
                self.assertFalse(selected.color_info["uses_mask"])
            bg.assert_called_once()

    def test_prompt_normalization_and_cosine_not_softmax(self):
        encoder, proc = Mock(), Mock()
        proc.return_value = Mock()
        proc.return_value.to.return_value = {}
        # Each class has 3 texts in the same direction but with different magnitudes.
        directions = torch.eye(512)[: len(ga.TEXTURE_PROMPTS)]
        texts = (directions[:, None, :] * torch.tensor([1, 2, 3])[None, :, None]).flatten(0, 1)
        encoder.get_text_features.return_value = SimpleNamespace(pooler_output=texts)
        texture = ga.VisualTextureScorer(encoder, proc)
        torch.testing.assert_close(texture.vectors, directions)
        candidates = texture.candidates(directions[0])
        self.assertEqual(candidates[0], {"label": "니트", "score": 1.0})
        self.assertEqual(candidates[1]["score"], 0)
        self.assertEqual(len(candidates), 3)
        self.assertIn("visible knitted stitches", proc.call_args.kwargs["text"][0])
        with self.assertRaisesRegex(ValueError, "cannot be normalized"):
            ga.unit_vectors(torch.zeros(1, 512), 1)

    def test_cli_json_swatches_and_refuse_overwrite(self):
        self.checkpoint()
        dest = self.root / "out"
        args = [str(self.image), str(self.image), "--classifier-checkpoint", str(self.pt), "--region", "central", "--out", str(dest), "--swatches"]
        with (patch.object(ga, "FashionCLIPFeatures", FakeFeatures), patch.object(ga.torch, "set_num_threads"),
              patch.object(ga.cv2, "setNumThreads")):
            ga.main(args)
            with self.assertRaises(SystemExit) as error:
                ga.main(args)
            self.assertEqual(error.exception.code, 1)
        summary = json.loads((dest / "summary.json").read_text(encoding="utf-8"))
        self.assertEqual([row["file"] for row in summary["images"]], ["001.json", "002.json"])
        result = json.loads((dest / "001.json").read_text(encoding="utf-8"))
        self.assertEqual(result["image"], "옷.jpg")
        with Image.open(dest / result["swatch"]) as swatch:
            self.assertEqual(swatch.format, "PNG")


class AttributeApiTests(unittest.TestCase):
    def test_raw_category_and_legacy_crop_vectors_are_separate(self):
        clf = GarmentClassifier.__new__(GarmentClassifier)
        image = Image.new("RGB", (3000, 1500), "red")
        image.getexif()[274] = 6
        expected_input = image.copy()
        expected_input.thumbnail((garment.MAX_ATTRIBUTE_SIDE,) * 2)
        crop = Image.new("RGB", (8, 8), "navy")
        raw_vector, crop_vector = np.eye(512, dtype=np.float32)[:2]
        clf.embed = Mock(side_effect=[raw_vector, crop_vector])
        clf.remover = Mock(return_value=(np.ones((4, 4), dtype=bool), crop))
        head = torch.nn.Linear(512, 4, bias=False)
        with torch.no_grad():
            head.weight.zero_()
            head.weight[0, 0] = 3
            head.weight[1, 1] = 3
        clf.category_head = SimpleNamespace(model=head)
        for attr, names in (("color", ["화이트", "네이비"]), ("sleeve", ["반팔", "긴팔"])):
            attr_head = torch.nn.Linear(512, 2, bias=False)
            with torch.no_grad():
                attr_head.weight.copy_(head.weight[:2])
            setattr(clf, attr, (names, attr_head, ga.CLIP))
        with patch.object(garment, "suggest_colors", return_value=[]):
            result, shown, vector = clf.analyze(image)
        raw_input, crop_input = (call.args[0] for call in clf.embed.call_args_list)
        self.assertEqual(raw_input.size, (1500, 3000))
        self.assertIs(crop_input, crop)
        self.assertEqual(clf.remover.call_args.args[0].tobytes(), expected_input.convert("RGB").tobytes())
        self.assertEqual(clf.remover.call_args.args[0].size, (2048, 1024))
        self.assertEqual(image.size, (3000, 1500))
        self.assertIs(shown, crop)
        np.testing.assert_array_equal(vector, crop_vector)
        self.assertEqual(result["category"]["name"], "상의")
        self.assertEqual(set(c["name"] for c in result["category_candidates"]), set(ga.CLASSES))
        self.assertAlmostEqual(sum(c["prob"] for c in result["category_candidates"]), 1, delta=.002)
        self.assertEqual(result["color_name"]["name"], "네이비")
        self.assertEqual(result["sleeve"]["name"], "긴팔")

    def test_opt_in_preserves_existing_payload_and_weights(self):
        expected_embedding = np.linspace(-0.06, 0.06, 512, dtype=np.float32)
        with io.BytesIO() as buf:
            Image.new("RGB", (12, 10), "navy").save(buf, format="PNG")
            files = {"image": ("input.png", buf.getvalue(), "image/png")}
        result = {
            "category": {"name": "아우터", "prob": 0.89},
            "category_candidates": [{"name": n, "prob": s} for n, s in zip(ga.CLASSES, [0.06, 0.03, 0.89, 0.02])],
            "colors": [{"name": "네이비", "rgb": (31, 40, 77), "ratio": 1.0}],
            "color_name": {"name": "네이비", "prob": None, "candidates": [{"name": "네이비", "prob": None}], "needs_review": True},
            "sleeve": None,
            "retake": False,
            "mask_ratio": 0.55,
            "needs_review": False,
        }
        # Exercise the real metadata adapter using synthetic base results and a texture scorer spy.
        clf = GarmentClassifier.__new__(GarmentClassifier)
        clf.color = None
        clf.category_head = ga.CategoryHead(Mock(), ga.MLP_ARCHITECTURE, "checkpoint_metadata_verified", "test.pt", "a" * 64)
        clf.versions = {"embedding": f"{ga.CLIP}@{ga.CLIP_REVISION[:7]}", "category": clf.model_version, "sleeve": None, "color": "rule"}
        clf.proc = SimpleNamespace(image_processor=SimpleNamespace(
            do_resize=True, size={"shortest_edge": 224}, do_center_crop=True, crop_size={"height": 224, "width": 224}
        ))
        clf.analyze = Mock(return_value=(result, Image.new("RGB", (8, 8), "white"), expected_embedding))
        scorer = Mock()
        scorer.candidates.return_value = [{"label": "니트", "score": 0.2}, {"label": "레이스", "score": 0.16}]
        clf.clip, clf.device = Mock(), "cpu"

        with (patch.dict(api.app.dependency_overrides, {api.get_classifier: lambda: clf}),
              patch.object(garment, "VisualTextureScorer", return_value=scorer) as create_scorer,
              patch.object(api, "API_KEY", "")):
            # Do not enter the TestClient lifespan; no production models are initialized.
            client = TestClient(api.app)
            self.addCleanup(client.close)
            self._assert_responses(client, files, clf, create_scorer, scorer, expected_embedding)

    def _assert_responses(self, client, files, clf, create_scorer, scorer, expected_embedding):
        base = client.post("/v1/garments/analyze", files=files)
        self.assertEqual(base.status_code, 200, base.text)
        self.assertNotIn("attributes", base.json())
        create_scorer.assert_not_called()
        ext = client.post("/v1/garments/analyze/attributes", files=files)
        self.assertEqual(ext.status_code, 200, ext.text)
        payload = ext.json()
        attrs = payload.pop("attributes")
        self.assertEqual(payload, base.json())
        self.assertEqual(clf.analyze.call_count, 2)
        self.assertEqual(payload["embedding"], [round(float(x), 6) for x in expected_embedding])
        png = base64.b64decode(payload["crop_png_base64"])
        with Image.open(io.BytesIO(png)) as crop:
            self.assertEqual((crop.format, crop.size), ("PNG", (8, 8)))
        self.assertEqual(payload["model_version"], clf.model_version)
        self.assertEqual(payload["model_versions"], clf.versions)
        self.assertEqual(attrs["category"]["input_region"]["kind"], ga.CATEGORY_INPUT)
        self.assertEqual(attrs["category"]["checkpoint_sha256"], "a" * 64)
        self.assertEqual(attrs["category"]["classes_in_head_order"], ga.CLASSES)
        self.assertEqual(attrs["embedding_input_region"], attrs["visual_texture"]["input_region"])
        self.assertNotEqual(attrs["category"]["input_region"], attrs["embedding_input_region"])
        self.assertNotEqual(attrs["category"]["input_region"], attrs["color"]["extraction_region"])
        self.assertTrue(attrs["preprocessing"]["exif_transpose_applied"])
        self.assertFalse(attrs["preprocessing"]["crop_exif_transpose_applied"])
        self.assertIsNone(attrs["color"]["representative_color_score_type"])
        texture = attrs["visual_texture"]
        self.assertTrue(texture["needs_review"])
        self.assertEqual(texture["score_type"], "cosine_similarity")
        self.assertEqual({"label": texture["label"], "score": texture["score"]}, texture["candidates"][0])
        self.assertEqual(texture["candidates"], scorer.candidates.return_value)
        self.assertIsNone(texture["prob"])
        self.assertIsNone(attrs["fiber_material"])
        create_scorer.assert_called_once_with(clf.clip, clf.proc, "cpu")
        torch.testing.assert_close(scorer.candidates.call_args.args[0], torch.from_numpy(expected_embedding))
        clf.color = object()
        saved_result, *_ = clf.analyze.return_value
        saved_result.update(retake=True, mask_ratio=0, colors=[], color_name=None)
        retake = client.post("/v1/garments/analyze/attributes", files=files).json()["attributes"]
        self.assertEqual(retake["color"]["representative_color_score_type"], "uncalibrated_softmax")
        self.assertEqual(retake["visual_texture"]["candidates"], [])
        for field in ("label", "score", "prob", "input_region"):
            self.assertIsNone(retake["visual_texture"][field])
        self.assertTrue(retake["visual_texture"]["needs_review"])
        create_scorer.assert_called_once()
        scorer.candidates.assert_called_once()
        with patch.object(api, "API_KEY", "dummy-test-value"):
            self.assertEqual(client.post("/v1/garments/analyze/attributes", files=files).status_code, 401)


if __name__ == "__main__":
    unittest.main()
