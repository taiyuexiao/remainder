# M12 Live2D routes verification (ASCII only)
$ErrorActionPreference = 'Stop'
$B = if ($env:VERIFY_BASE) { $env:VERIFY_BASE } else { 'http://127.0.0.1:3210' }

# 0. ensure a fake model exists
$root = Join-Path $PSScriptRoot 'data\live2d-models'
$fake = Join-Path $root 'm12-test-model'
New-Item -ItemType Directory -Force -Path (Join-Path $fake 'textures') | Out-Null
[System.IO.File]::WriteAllText((Join-Path $fake 'm12-test-model.model3.json'), '{"Version":3,"FileReferences":{"Moc":"m12-test-model.moc3","Textures":["textures/t0.png"]}}')
[System.IO.File]::WriteAllText((Join-Path $fake 'm12-test-model.moc3'), 'fake-moc3-bytes')
[byte[]](137,80,78,71,13,10,26,10) | Set-Content -Encoding Byte (Join-Path $fake 'textures\t0.png')

# 1. list models
$list = Invoke-RestMethod "$B/api/live2d/models"
$m = $list.models | Where-Object { $_.name -eq 'm12-test-model' }
if (-not $m) { throw 'FAIL: model not listed' }
"1. list OK: $($m.url)"

# 2. fetch model3.json via files route
$json = Invoke-RestMethod $m.url
if ($json.FileReferences.Moc -ne 'm12-test-model.moc3') { throw 'FAIL: model3.json content mismatch' }
"2. model3.json OK"

# 3. fetch nested texture (wildcard path)
$pngMeta = curl.exe -s -o NUL -w '%{http_code} %{content_type}' "$B/api/live2d/files/m12-test-model/textures/t0.png"
if ($pngMeta -ne '200 image/png') { throw "FAIL: texture fetch -> $pngMeta" }
"3. nested texture OK: $pngMeta"

# 4. path traversal must be rejected
$enc = [uri]::EscapeDataString('..\..\remainder.db')
$code = curl.exe -s -o NUL -w '%{http_code}' "$B/api/live2d/files/m12-test-model/$enc"
if ($code -notin '400','404') { throw "FAIL: traversal not rejected -> $code" }
"4. traversal rejected OK ($code)"

# 5. nonexistent file 404
$code = curl.exe -s -o NUL -w '%{http_code}' "$B/api/live2d/files/m12-test-model/nope.png"
if ($code -ne '404') { throw "FAIL: 404 expected -> $code" }
'5. 404 OK'

# cleanup fake model
Remove-Item -Recurse -Force $fake
'M12 VERIFY ALL PASS'
