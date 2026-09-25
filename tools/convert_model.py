"""Convert SkyTNT anime-seg ISNet (fp32, 176MB) to fp16 (~88MB) for bundling.

Usage:
  curl -L -o isnetis.onnx https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.onnx
  python tools/convert_model.py isnetis.onnx public/models/anime-seg-fp16.onnx
"""
import sys

import onnx
from onnxconverter_common import float16

src, dst = sys.argv[1], sys.argv[2]
model = onnx.load(src)
# keep_io_types: the page feeds float32 tensors and reads a float32 mask.
model16 = float16.convert_float_to_float16(model, keep_io_types=True)
onnx.save(model16, dst)
print(f"saved {dst}")
