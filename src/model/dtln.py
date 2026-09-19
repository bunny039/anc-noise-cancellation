"""
Wrapper around the OFFICIAL DTLN implementation (Westhausen & Meyer, 2020),
vendored in external/DTLN/. We don't reimplement the architecture ourselves -
using their real code guarantees our model matches their pretrained weights
shape-for-shape, which a hand-built reimplementation could not guarantee.
"""

import sys
import os
import numpy as np

# external/DTLN is a vendored third-party dependency, not our own code -
# added to sys.path here rather than installed as a package, since it's not
# published on PyPI.
_EXTERNAL_DTLN_PATH = os.path.join(os.path.dirname(__file__), "../../external/DTLN")
sys.path.append(os.path.abspath(_EXTERNAL_DTLN_PATH))

from DTLN_model import DTLN_model as _OfficialDTLNModel


DEFAULT_WEIGHTS_PATH = os.path.join(
    os.path.dirname(__file__), "../../external/DTLN/pretrained_model/model.h5"
)


def load_pretrained_model(weights_path: str = DEFAULT_WEIGHTS_PATH):
    """Build the official stateful (real-time) architecture and load
    pretrained weights into it. Returns a compiled Keras model ready for
    frame-by-frame inference."""
    dtln_wrapper = _OfficialDTLNModel()
    dtln_wrapper.build_DTLN_model_stateful()
    dtln_wrapper.model.load_weights(weights_path)
    return dtln_wrapper.model


def enhance_frame(model, frame: np.ndarray) -> np.ndarray:
    """Run one 32ms frame through the model. Call once per frame, in order -
    the stateful LSTMs carry memory across calls."""
    frame_input = frame.reshape(1, -1).astype(np.float32)
    enhanced = model(frame_input, training=False)
    return np.array(enhanced).reshape(-1)


def reset_model_state(model) -> None:
    """Clear stateful LSTM memory. Call at the start of each new audio
    stream/session, or leftover state from a previous recording leaks in.

    Newer TF/Keras removed model.reset_states() from Functional models, so we
    reset each stateful layer directly instead."""
    for layer in model.layers:
        if hasattr(layer, "reset_states"):
            layer.reset_states()

