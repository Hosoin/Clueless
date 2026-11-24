# 옷 분석 확장 응답

- 기존 `POST /v1/garments/analyze`의 요청과 기존 응답 필드는 유지됩니다. 두 분석 경로 모두 기본 품목 모델이 [누적 MLP seed 0](../../ml/GARMENT_CATEGORY_MODEL.json)으로 바뀌고, 품목 입력은 EXIF 보정 원본입니다. 옷장에 저장하는 `embedding`은 기존 크롭 벡터이며 품목 벡터와 다릅니다.
- 확장 메타데이터까지 받으려면 `POST /v1/garments/analyze/attributes`를 호출합니다. 동일한 multipart `image`와 `X-API-Key` 정책이 적용됩니다. 동일한 분석을 한 번 실행한 뒤 이미 구한 크롭 벡터로 질감 점수를 매깁니다.
- 아래는 **API 응답 구조를 설명하기 위한 가상 값**입니다. `crop_png_base64`와 `embedding`은 축약했습니다. 실제 응답에는 전체 PNG 문자열 및 512개 실수가 들어갑니다. 별도 오프라인 속성 CLI의 출력은 다른 스키마입니다.

```json
{
  "category": {"name": "아우터", "prob": 0.89},
  "category_candidates": [
    {"name": "아우터", "prob": 0.89},
    {"name": "상의", "prob": 0.06},
    {"name": "하의", "prob": 0.03},
    {"name": "원피스", "prob": 0.02}
  ],
  "colors": [{"name": "네이비", "rgb": [31, 40, 77], "ratio": 1.0}],
  "color_name": {
    "name": "네이비", "prob": null,
    "candidates": [{"name": "네이비", "prob": null}], "needs_review": true
  },
  "sleeve": null,
  "mask_ratio": 0.55,
  "retake": false,
  "needs_review": false,
  "crop_png_base64": "iVBORw0KGgo...",
  "embedding": [0.0123, -0.0234],
  "model_version": "garment4_mlp_secondhand_balanced264_20261124_seed0@sha256:59232b1a34deb046984cce8b9d68dfd2a852ae53aa899ce62e5aae695eb7bd10",
  "model_versions": {
    "embedding": "patrickjohncyh/fashion-clip@7e3ba62",
    "embedding_preprocessing": "stored_orientation_rgb_thumbnail2048_birefnet_white_crop_fashionclip_l2_v1",
    "category": "garment4_mlp_secondhand_balanced264_20261124_seed0@sha256:59232b1a34deb046984cce8b9d68dfd2a852ae53aa899ce62e5aae695eb7bd10",
    "category_preprocessing": "exif_rgb_white_alpha_full_frame_fashionclip_l2_v1",
    "sleeve": null, "color": "rule"
  },
  "attributes": {
    "schema_version": 1,
    "target": {
      "mode": "single_representative_garment_assumption",
      "multi_garment_detection": false,
      "limitation": "If multiple garments or a person are visible, category, color and texture can refer to different content. BiRefNet selects foreground, not a specific garment."
    },
    "preprocessing": {
      "exif_transpose_applied": true,
      "clip": {
        "resize": {"shortest_edge": 224},
        "center_crop": {"height": 224, "width": 224},
        "limitation": "Processor center cropping can omit edges or a garment outside the center."
      },
      "clip_model": "patrickjohncyh/fashion-clip",
      "clip_revision": "7e3ba62ce16b379a1ab479346b66f192e76f51b7",
      "category_version": "exif_rgb_white_alpha_full_frame_fashionclip_l2_v1",
      "crop_version": "stored_orientation_rgb_thumbnail2048_birefnet_white_crop_fashionclip_l2_v1",
      "crop_exif_transpose_applied": false,
      "crop_max_side": 2048
    },
    "background_removal": {
      "model": "ZhengPeng7/BiRefNet_lite",
      "revision": "aa62cd87eafb9cc43056d08ef3615a14628b831d",
      "threshold": 0.5
    },
    "category": {
      "input_region": {"kind": "exif_corrected_full_frame", "clip_processor_applied": true},
      "score_type": "uncalibrated_softmax",
      "needs_review": false,
      "architecture": "MLP512->64->4 ReLU",
      "checkpoint": "garment4_mlp_secondhand_balanced264_20261124_seed0.pt",
      "checkpoint_sha256": "59232b1a34deb046984cce8b9d68dfd2a852ae53aa899ce62e5aae695eb7bd10",
      "clip_revision_source": "checkpoint_metadata_verified",
      "classes_in_head_order": ["상의", "하의", "아우터", "원피스"]
    },
    "embedding_input_region": {"kind": "birefnet_foreground_square_crop_white_background", "clip_processor_applied": true},
    "color": {
      "method": "cie_lab_kmeans_k3_nearest_palette20_cie76",
      "extraction_region": {"kind": "birefnet_foreground_pixels", "clip_processor_applied": false},
      "ratio_type": "share_of_selected_pixels_not_probability",
      "swatches_field": "colors",
      "representative_color_field": "color_name",
      "representative_color_method": "rule_palette_only",
      "representative_color_input_region": {"kind": "birefnet_foreground_pixels", "clip_processor_applied": false},
      "representative_color_score_type": null,
      "needs_review": true
    },
    "visual_texture": {
      "label": "니트", "score": 0.21, "prob": null,
      "method": "zero_shot_similarity", "score_type": "cosine_similarity",
      "input_region": {"kind": "birefnet_foreground_square_crop_white_background", "clip_processor_applied": true},
      "prompt_version": "visible_texture_en_v1",
      "non_exclusive": true,
      "candidate_policy": "Top-ranked suggestions only; no acceptance or abstention score threshold.",
      "candidates": [
        {"label": "니트", "score": 0.21},
        {"label": "레이스", "score": 0.17},
        {"label": "플리스", "score": 0.13}
      ],
      "review_options": ["판단 어려움"],
      "needs_review": true,
      "review_reason": "Visual-only zero-shot ranking without verified thresholds; choose one, multiple, or unclear."
    },
    "fiber_material": null,
    "fiber_material_reason": "Photo appearance cannot establish actual fiber composition (e.g. wool, cotton or acrylic). Check a care label or product information."
  }
}
```

## 필수 필드, null, 점수와 영역

- 요청에서 `image`는 필수입니다. 업로드 최대 10 MiB, 4천만 화소, 긴 변:짧은 변 64:1입니다. 제한 초과는 413입니다. **확장 경로의 성공 응답에서** `attributes`와 위에 나온 각 키는 필수입니다(기존 경로에는 `attributes` 자체가 없음). 값이 없는 경우의 `null`과 키 누락은 다릅니다. 기존 `color_name`, `color_name.prob`, `sleeve`, 일부 `model_versions` 값은 이전과 같이 `null`일 수 있습니다.
- `category.prob`는 활성 head의 보정되지 않은 4클래스 softmax를 소수점 3자리로 반올림한 값입니다 (`1.0`도 정확성을 보장하지 않습니다). 기존 최상위 `needs_review`는 품목 검토에만 해당하며 `attributes.category.needs_review`에 그대로 표시합니다. 높은 점수나 `false`가 정확성을 보장하지 않습니다.
- `colors[].ratio`는 BiRefNet이 고른 전경 픽셀 중 색 군집 비율입니다. 기존 `colors`·`color_name`에는 변경이 없습니다. `attributes.color`는 해당 필드를 가리키는 설명입니다. `color_probe.pt`가 활성화된 경우에만 대표색 방식이 `supervised_fashionclip_color_head`이고 점수 유형은 `uncalibrated_softmax`입니다. 그 외에는 `rule_palette_only`와 `null`이고, 규칙 대표색은 검토 대상입니다. 확장 색 검토는 기존 색 확인, 색 후보 없음 또는 `retake`를 반영합니다. 조명·사람·배경·다른 옷이 색에 영향을 줄 수 있습니다.
- `visual_texture.score`/`candidates[].score`는 영어 프롬프트 앙상블에 대한 원시 코사인 유사도(`-1`~`1`)입니다. 확률/퍼센트가 아니고 softmax·합계 1을 기대하면 안 됩니다. `label`/`score`는 첫 후보와 같으며 확정이 아닙니다. `prob`는 항상 `null`, `needs_review`는 항상 `true`입니다. 후보는 배타적이지 않으며 복수 선택이나 `판단 어려움`을 허용합니다. `retake: true`면 질감 점수를 내지 않아 `label`, `score`, `input_region`이 `null`이고 `candidates`는 `[]`입니다. `fiber_material`은 항상 `null`입니다. 실제 섬유는 케어 라벨 등으로 확인하세요.
- 품목은 EXIF 보정 원본을 사용합니다. 이 경로에는 업로드 썸네일이나 마스크를 적용하지 않지만, FashionCLIP 프로세서의 중심 크롭에서 가장자리가 잘릴 수 있습니다. `preprocessing.exif_transpose_applied`는 품목만 설명하고, `crop_exif_transpose_applied: false`는 기존 크롭 경로를 설명합니다. `preprocessing.clip.resize`·`center_crop`은 동작이 비활성일 때 `null`입니다.
- 규칙색은 기존 크롭 입력(저장 방향의 업로드를 최대 2048로 축소)의 전경 픽셀을 사용합니다. 질감·소매·학습색·반환 `embedding`은 표시용 크롭의 벡터를 사용합니다. 빈 마스크에서는 표시 이미지와 벡터가 마스크 입력 전체를 사용하고, `retake`인 경우 `embedding_input_region.kind`는 `birefnet_crop_or_full_frame_if_mask_empty`로 표시합니다. 옷 한 벌을 가정하며 사람/여러 겹의 옷을 분리하지 못합니다.
- `model_version`과 `model_versions.category`는 활성 체크포인트 이름과 SHA-256을 담습니다. `model_versions.embedding`은 기존 ID를 유지하며, 새 `embedding_preprocessing`과 `category_preprocessing` 키가 두 경로를 구별합니다. `attributes.schema_version`은 1을 유지하고 세부 메타데이터만 추가합니다. `attributes.visual_texture.prompt_version`은 질감 문구·후보 집합 버전, `attributes.background_removal.revision`은 마스크 모델 커밋입니다.

이 응답은 **ML HTTP 응답**이지 DB 저장 스키마가 아닙니다. Blob/PostgreSQL 저장·마이그레이션, Spring Boot DTO 및 화면 연동은 이 변경에서 구현하지 않았습니다. 미검토 질감 후보를 정답이나 실제 소재로 저장하지 마세요.
