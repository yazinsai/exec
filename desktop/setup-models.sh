#!/bin/bash
set -e

MODEL_DIR="$HOME/.local/share/exec/models"
mkdir -p "$MODEL_DIR"

# Parakeet TDT 0.6B v2 (int8)
if [ ! -d "$MODEL_DIR/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8" ]; then
  echo "Downloading Parakeet TDT 0.6B v2 (int8)..."
  cd "$MODEL_DIR"
  curl -SL -O https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2
  tar xjf sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2
  rm sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2
  echo "Parakeet model downloaded."
else
  echo "Parakeet model already exists."
fi

# Silero VAD
if [ ! -f "$MODEL_DIR/silero_vad.onnx" ]; then
  echo "Downloading Silero VAD..."
  curl -SL -o "$MODEL_DIR/silero_vad.onnx" https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx
  echo "Silero VAD downloaded."
else
  echo "Silero VAD already exists."
fi

echo "All models ready in $MODEL_DIR"
