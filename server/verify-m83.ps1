# M8.3 weekly report + polish verify script (pure ASCII, no CJK literals)
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:3210'
$fail = 0

function Ok($name, $cond, $detail) {
  if ($cond) { Write-Host "PASS  $name" }
  else { $script:fail++; Write-Host "FAIL  $name  -> $detail" }
}

# ---- 0. health ----
$h = Invoke-RestMethod "$base/api/health" -TimeoutSec 5
Ok 'health' ($h.status -eq 'ok') ($h | ConvertTo-Json -Compress)

$docsBeforeIds = @(Invoke-RestMethod "$base/api/documents" -TimeoutSec 5 | ForEach-Object { $_.id })

# ---- 1. weekly-report (fallback works without LLM key) ----
$r1code = 0; $d = $null
try {
  $d = Invoke-RestMethod -Method Post -Uri "$base/api/llm/weekly-report" -ContentType 'application/json' -Body '{}' -TimeoutSec 30
  $r1code = 201
} catch {
  $r1code = [int]$_.Exception.Response.StatusCode
}
Ok 'weekly-report: not 500/404' ($r1code -in @(200, 201, 503, 502)) "code=$r1code"
if ($r1code -in @(200, 201)) {
  # PS5.1 decodes JSON as latin-1 (no charset header) -> avoid CJK compare, check structure
  Ok 'weekly-report: document created (Tiptap JSON + 2-char tag)' `
    ($d.id -and $d.title.Length -gt 3 -and $d.tags.Length -eq 2 -and $d.content.StartsWith('{')) ($d.id)
  $docsAfterIds = @(Invoke-RestMethod "$base/api/documents" -TimeoutSec 5 | ForEach-Object { $_.id })
  Ok 'weekly-report: new doc id present in list' `
    (($docsAfterIds -contains $d.id) -and -not ($docsBeforeIds -contains $d.id)) `
    "before=$($docsBeforeIds.Count) after=$($docsAfterIds.Count)"
} else {
  Ok 'weekly-report: 502/503 (LLM upstream path)' ($r1code -in @(502, 503)) "code=$r1code"
}

# ---- 2. polish (LLM off -> 503 with clear hint) ----
$tmp = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmp, '{"text":"hello world test text"}', (New-Object System.Text.UTF8Encoding($false)))
$out = curl.exe -s -o - -w '\n%{http_code}' -X POST -H 'Content-Type: application/json; charset=utf-8' --data-binary "@$tmp" "$base/api/llm/polish"
Remove-Item $tmp -ErrorAction SilentlyContinue
$lines = @($out -split "`n")
$code2 = [int]$lines[-1]; $body2 = ($lines[0..($lines.Count - 2)] -join "`n")
Ok 'polish: not 500/404' ($code2 -in @(200, 503, 502)) "code=$code2 body=$body2"
if ($code2 -eq 503) { Ok 'polish: 503 with clear LLM hint' ($body2 -match 'LLM') $body2 }
elseif ($code2 -eq 200) { Ok 'polish: returns result' ($body2.Length -gt 10) $body2 }
else { Ok 'polish: 502 upstream fail (acceptable)' ($code2 -eq 502) $body2 }

# ---- 3. polish input validation ----
$tmp = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmp, '{"text":""}', (New-Object System.Text.UTF8Encoding($false)))
$out = curl.exe -s -o - -w '\n%{http_code}' -X POST -H 'Content-Type: application/json; charset=utf-8' --data-binary "@$tmp" "$base/api/llm/polish"
Remove-Item $tmp -ErrorAction SilentlyContinue
$lines = @($out -split "`n")
$code3 = [int]$lines[-1]
Ok 'polish: empty text -> 400' ($code3 -eq 400) "code=$code3"

Write-Host ''
if ($fail -eq 0) { Write-Host 'M8.3 BACKEND PASS' } else { Write-Host "M8.3 FAIL: $fail check(s) failed"; exit 1 }
