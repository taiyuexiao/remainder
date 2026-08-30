# M11.4 knowledge-base FTS5 search verify script (ASCII only)
# Chinese literals are built from code points; ConvertTo-Json emits XXXX escapes.
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:3210'
$fail = 0
$createdDocs = @()
$createdClips = @()

function Ok($name, $cond, $detail) {
  if ($cond) { Write-Host "PASS  $name" }
  else { $script:fail++; Write-Host "FAIL  $name  -> $detail" }
}

function Api($method, $path, $body) {
  $p = @{ Method = $method; Uri = "$base$path"; TimeoutSec = 30 }
  if ($null -ne $body) {
    # PS5.1 sends string bodies as latin-1 -> Chinese would garble; force UTF-8 bytes
    $p.ContentType = 'application/json; charset=utf-8'
    $p.Body = [System.Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress))
  }
  $r = Invoke-RestMethod @p
  return $r
}

function U([int[]]$codes) { -join ($codes | ForEach-Object { [char]$_ }) }
# keywords: zhi-shi-ku (knowledge base), jian-cang (clip), gong-zuo-liu (workflow)
$KW_KB   = U 0x77e5,0x8bc6,0x5e93
$KW_CLIP = U 0x526a,0x85cf
$KW_WF   = U 0x5de5,0x4f5c,0x6d41

function Search($q) { @(Api 'GET' ('/api/documents/search?q=' + [uri]::EscapeDataString($q)) $null) }
function HasDoc($rows, $id) { @($rows | Where-Object { $_.id -eq $id }).Count -gt 0 }

try {
  # ---- 0. health ----
  $h = Api 'GET' '/api/health' $null
  Ok 'health' ($h.status -eq 'ok') ($h | ConvertTo-Json -Compress)

  # ---- 1. create docs ----
  $a = Api 'POST' '/api/documents' @{ title = "M114 doc $KW_KB"; content = "<p>hello $KW_CLIP pipeline</p>"; tags = 'kb,test' }
  $script:createdDocs += $a.id
  Ok 'doc A created with metadata fields' ($a.id -and $a.tags -eq 'kb,test') ($a | ConvertTo-Json -Compress)
  $b = Api 'POST' '/api/documents' @{ title = 'M114 AI notes'; content = '<p>notes about AI agents</p>' }
  $script:createdDocs += $b.id

  # ---- 2. FTS trigram search (3 CJK chars) ----
  $r1 = Search $KW_KB
  Ok "FTS: search '$KW_KB' hits doc A" (HasDoc $r1 $a.id) ($r1 | ConvertTo-Json -Compress)
  Ok 'search rows are light (no content column)' (-not ($r1[0].PSObject.Properties.Name -contains 'content')) 'content leaked'
  Ok 'search rows carry rank' ($null -ne $r1[0].rank) 'rank missing'

  # ---- 3. LIKE fallback (<3 chars) ----
  $r2 = Search 'AI'
  Ok "LIKE: search 'AI' hits doc B" (HasDoc $r2 $b.id) ($r2 | ConvertTo-Json -Compress)
  $r3 = Search $KW_CLIP
  Ok "LIKE: search '$KW_CLIP' hits doc A (content_text stripped from HTML)" (HasDoc $r3 $a.id) ($r3 | ConvertTo-Json -Compress)

  # ---- 4. PATCH syncs index ----
  Api 'PATCH' "/api/documents/$($a.id)" @{ content = "<p>workflow $KW_WF only</p>"; tags = 'renamed' } | Out-Null
  $r4 = Search $KW_WF
  Ok "FTS: new term '$KW_WF' hits after PATCH" (HasDoc $r4 $a.id) ($r4 | ConvertTo-Json -Compress)
  $r5 = Search $KW_CLIP
  Ok "old term '$KW_CLIP' no longer hits doc A" (-not (HasDoc $r5 $a.id)) ($r5 | ConvertTo-Json -Compress)
  $r6 = Search 'renamed'
  Ok 'FTS: tags column searchable' (HasDoc $r6 $a.id) ($r6 | ConvertTo-Json -Compress)

  # ---- 5. DELETE removes from index ----
  Api 'DELETE' "/api/documents/$($b.id)" $null | Out-Null
  $script:createdDocs = @($script:createdDocs | Where-Object { $_ -ne $b.id })
  $r7 = Search 'agents'
  Ok 'deleted doc not searchable' (-not (HasDoc $r7 $b.id)) ($r7 | ConvertTo-Json -Compress)

  # ---- 6. clip convert fills metadata + indexed ----
  $clip = Api 'POST' '/api/clips' @{ html = "<p>$KW_CLIP smoke content for kb</p>"; url = 'https://example.com/article'; title = "M114 clip $KW_CLIP" }
  $script:createdClips += $clip.id
  $doc = Api 'POST' "/api/clips/$($clip.id)/convert" @{}
  $script:createdDocs += $doc.id
  Ok 'convert fills source_url/summary/clip_id' ($doc.source_url -eq 'https://example.com/article' -and $doc.summary -and $doc.clip_id -eq $clip.id) ($doc | ConvertTo-Json -Compress)
  $r8 = Search 'smoke'
  Ok 'converted doc searchable' (HasDoc $r8 $doc.id) ($r8 | ConvertTo-Json -Compress)
} finally {
  # cleanup
  foreach ($id in $createdClips) { try { Api 'DELETE' "/api/clips/$id" $null | Out-Null } catch {} }
  foreach ($id in $createdDocs) { try { Api 'DELETE' "/api/documents/$id" $null | Out-Null } catch {} }
}

Write-Host ''
if ($fail -eq 0) { Write-Host 'M11.4 ALL PASS' } else { Write-Host "M11.4 FAIL: $fail check(s) failed"; exit 1 }
