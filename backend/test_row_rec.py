import sys
import os
import cv2
import numpy as np

# Add backend to sys.path
sys.path.insert(0, r"d:\Walvoil_New_Project\backend")

from app.services.layout_detection import detect_walvoil_dpr_layout
from app.services.image_preprocessing import decode_image_with_exif, estimate_skew_angle, apply_deskew
from app.services.recognition import PretrainedModelEngine, strip_printed_prefixes, sanitize_recognized_text

test_img_path = r"C:\Users\Pranav S P\.gemini\antigravity\brain\8785c1a9-8e61-4a2c-9aeb-be0163871d2a\.user_uploaded\media_1794555123997_f610f5e0.jpg"

with open(test_img_path, "rb") as f:
    img_bytes = f.read()

layout_res, _, warped_table = detect_walvoil_dpr_layout(
    image_bytes=img_bytes,
    filename="test_scan.jpg",
    preserve_color=True,
    save_diagnostic=False,
    return_warped=True,
)

print(f"Alignment Confidence: {layout_res.alignment_confidence}")
print(f"Warped table shape: {warped_table.shape if warped_table is not None else None}")

engine = PretrainedModelEngine()
engine.load_models_if_needed()

print("PP-OCR loaded:", engine._ppocr_model is not None)

# Test recognizing cells for Rows 1 to 4
for r_num in range(1, 6):
    print(f"\n--- ROW {r_num} ---")
    row_cells = [r for r in layout_res.regions if r.row_index == r_num]
    for cell in row_cells:
        box = cell.deskewed_box
        target_img = warped_table if warped_table is not None and cell.section in ("table", "table_subrow", "footer") else None
        if target_img is None:
            continue
        x1, y1 = max(0, box.x), max(0, box.y)
        x2, y2 = min(target_img.shape[1], box.x + box.width), min(target_img.shape[0], box.y + box.height)
        crop = target_img[y1:y2, x1:x2]
        
        # Test recognition
        res_list = list(engine._ppocr_model(crop))
        if res_list:
            raw = res_list[0].get("rec_text", "")
            score = res_list[0].get("rec_score", 0.0)
            cleaned = strip_printed_prefixes(raw, cell.field_name)
            sanitized = sanitize_recognized_text(cleaned, cell.field_name)
            if sanitized or raw:
                print(f"  [{cell.field_name}/{cell.sub_field}]: raw='{raw}' -> cleaned='{cleaned}' -> sanitized='{sanitized}' (conf: {score:.2f})")

