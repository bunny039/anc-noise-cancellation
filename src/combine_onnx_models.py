"""combine_onnx_models.py
Combine encoder, erb decoder, and df decoder ONNX models into a single ONNX model.

The three exported models are:
- enc.onnx   : Encoder (produces e0, e1, e2, e3, emb, c0)
- erb_dec.onnx : ERB decoder (takes emb, e3, e2, e1, e0 -> produces mask m)
- df_dec.onnx  : DeepFilter decoder (takes emb, c0 -> produces df coefficients)

We merge them so that the encoder outputs are directly fed into the decoders.
The resulting combined model has the same inputs as the encoder and produces
both decoder outputs as separate outputs.

Requires: onnx>=1.12 (for onnx.compose utilities)
"""

import os
import onnx
from onnx import save_model, helper, TensorProto
from onnx.compose import merge_models, add_prefix


def add_identity(model, input_name: str, output_name: str):
    """Add an Identity node that copies ``input_name`` to ``output_name``.
    The new output is added to the graph's output list with the same shape as ``input_name``.
    """
    # Create Identity node
    identity_node = helper.make_node(
        "Identity",
        inputs=[input_name],
        outputs=[output_name],
        name=output_name + "_identity",
    )
    model.graph.node.append(identity_node)
    # Find shape and type of the input tensor from graph outputs or value_info
    shape = None
    elem_type = TensorProto.FLOAT
    for info in list(model.graph.output) + list(model.graph.value_info):
        if info.name == input_name:
            elem_type = info.type.tensor_type.elem_type
            shape = [dim.dim_value for dim in info.type.tensor_type.shape.dim]
            break
    # If shape not found, fallback to empty (will be validated later)
    if shape is None:
        shape = []
    # Add new output tensor info with same type and shape
    model.graph.output.append(
        helper.make_tensor_value_info(output_name, elem_type, shape)
    )
    return model


def load_model(path):
    return onnx.load_model(path)


def combine_models(export_dir: str, output_name: str = "combined.onnx"):
    """Combine enc, erb_dec, and df_dec ONNX models into a single graph.

    Parameters
    ----------
    export_dir: str
        Directory containing the three ONNX files (enc.onnx, erb_dec.onnx, df_dec.onnx).
    output_name: str
        Filename for the merged model (saved inside ``export_dir``).
    """
    enc_path = os.path.join(export_dir, "enc.onnx")
    erb_path = os.path.join(export_dir, "erb_dec.onnx")
    df_path = os.path.join(export_dir, "df_dec.onnx")

    print(f"Loading models from {export_dir}...")
    enc = load_model(enc_path)
    erb = load_model(erb_path)
    df = load_model(df_path)
    # Duplicate 'emb' to preserve it for DF decoder
    enc = add_identity(enc, "emb", "emb_dup")
    # Add unique prefixes to decoder graphs to avoid name collisions
    erb = add_prefix(erb, prefix="erb_")
    df = add_prefix(df, prefix="df_")

    # Map encoder outputs to prefixed ERB decoder inputs (list of (output, input) tuples)
    io_map_erb = [
        ("emb", "erb_emb"),
        ("e3", "erb_e3"),
        ("e2", "erb_e2"),
        ("e1", "erb_e1"),
        ("e0", "erb_e0"),
    ]
    enc_erb = merge_models(enc, erb, io_map=io_map_erb, prefix1="", prefix2="")

    # Map encoder outputs to prefixed DF decoder inputs (list of (output, input) tuples)
    io_map_df = [
        ("emb_dup", "df_emb"),
        ("c0", "df_c0"),
    ]
    combined = merge_models(enc_erb, df, io_map=io_map_df, prefix1="", prefix2="")

    output_path = os.path.join(export_dir, output_name)
    save_model(combined, output_path)
    print(f"Combined model saved to {output_path}")
    return output_path


if __name__ == "__main__":
    # Assuming the script is run from the repository root.
    export_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models", "onnx_export"))
    combine_models(export_dir)
