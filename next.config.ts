import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Native/ONNX packages used for local embeddings must not be bundled by webpack.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'sharp'],
  poweredByHeader: false,
};

export default nextConfig;
