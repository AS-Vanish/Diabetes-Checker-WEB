$ErrorActionPreference = "Stop"

$version = "1.20.1"
$destination = Join-Path $PSScriptRoot "vendor\onnxruntime"
New-Item -ItemType Directory -Force -Path $destination | Out-Null

$base = "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/$version"
$files = @(
  "ort.min.js",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm"
)

foreach ($file in $files) {
  $url = "$base/$file"
  $out = Join-Path $destination $file
  Write-Host "Downloading $file ..."
  Invoke-WebRequest -Uri $url -OutFile $out
}

Write-Host ""
Write-Host "Done. Local ONNX Runtime Web assets are ready in:"
Write-Host $destination
