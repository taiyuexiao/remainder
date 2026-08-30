# M11.1 clip pipeline verify script (ASCII only)
# Full-chain check against http://127.0.0.1:3210
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:3210'
$fail = 0

function Ok($name, $cond, $detail) {
  if ($cond) { Write-Host "PASS  $name" }
  else { $script:fail++; Write-Host "FAIL  $name  -> $detail" }
}

function Api($method, $path, $body) {
  $p = @{ Method = $method; Uri = "$base$path"; TimeoutSec = 60 }
  if ($null -ne $body) { $p.ContentType = 'application/json'; $p.Body = ($body | ConvertTo-Json -Compress) }
  $r = Invoke-RestMethod @p
  return $r
}

# ---- 0. health ----
$h = Api 'GET' '/api/health' $null
Ok 'health' ($h.status -eq 'ok') ($h | ConvertTo-Json -Compress)

# ---- 1. POST full-page clip: extraction + sanitize + image localization ----
# reachable "image" (server itself, content-type json -> falls back to .jpg ext);
# mmbiz lazy-load image via data-src (will fail download -> placeholder);
# dirty script/style/onclick must be stripped.
$fullHtml = @"
<html><head><title>Mock Zhihu Page</title><style>.ad{color:red}</style></head>
<body>
<nav class="header">Top navigation junk link1 link2</nav>
<article>
<h1>How SQLite Migrations Work</h1>
<p>The first paragraph of the article body explains user_version pragma in detail.</p>
<p>Second paragraph with <strong>bold text</strong> and <a href="https://example.com/x" onclick="steal()">a link</a>.</p>
<script>alert('xss')</script>
<img src="http://127.0.0.1:3210/api/health" alt="reachable diagram">
<img data-src="https://mmbiz.qpic.cn/mmbiz_png/nonexistentfake12345/640?wx_fmt=png" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="wechat chart">
<blockquote>a quote block</blockquote>
</article>
<footer>footer junk</footer>
</body></html>
"@

$c1 = Api 'POST' '/api/clips' @{ html = $fullHtml; url = 'https://www.zhihu.com/question/123/answer/456'; title = 'M11V full page clip' }
Ok 'clip create returns id + imageStats' ($c1.id -and $null -ne $c1.imageStats) ($c1 | ConvertTo-Json -Compress)
Write-Host "       imageStats: $($c1.imageStats | ConvertTo-Json -Compress)"
$html1 = $c1.content_html
Ok 'extraction: article text present' ($html1 -match 'user_version pragma') $html1
Ok 'sanitize: script removed' ($html1 -notmatch '<script' -and $html1 -notmatch 'xss') $html1
Ok 'sanitize: style removed' ($html1 -notmatch '<style' -and $html1 -notmatch 'color:red') $html1
Ok 'sanitize: onclick stripped' ($html1 -notmatch 'onclick') $html1
Ok 'sanitize: link kept + target=_blank rel=noopener' ($html1 -match 'target="_blank"' -and $html1 -match 'rel="noopener"' -and $html1 -match 'example.com/x') $html1
Ok 'image localized: src rewritten to /api/clips/images/' ($html1 -match 'src="/api/clips/images/[0-9a-f-]+\.(jpg|png|gif|webp|avif|bmp)"') $html1
Ok 'image failure: mmbiz replaced by alt placeholder' ($html1 -match 'wechat chart' -and $html1 -notmatch 'mmbiz.qpic.cn') $html1
Ok 'image stats: 2 processed, 1 localized, 1 failed' ($c1.imageStats.total -eq 2 -and $c1.imageStats.localized -eq 1 -and $c1.imageStats.failed -eq 1) ($c1.imageStats | ConvertTo-Json -Compress)
Ok 'excerpt generated (<=200 chars)' ($c1.excerpt.Length -gt 10 -and $c1.excerpt.Length -le 200) $c1.excerpt
Ok 'status inbox by default' ($c1.status -eq 'inbox') $c1.status

# ---- 2. localized image served via /api/clips/images/:file ----
$m = [regex]::Match($html1, '/api/clips/images/([0-9a-f-]+\.(?:jpg|jpeg|png|gif|webp|avif|bmp))')
$imgFile = $m.Groups[1].Value
# NB: PS5.1 Invoke-WebRequest chokes on this chunked stream response; use curl.exe instead
$imgOut = curl.exe -s -o NUL -w '%{http_code} %{size_download}' "$base/api/clips/images/$imgFile"
$imgParts = $imgOut -split ' '
Ok 'localized image served (200)' ($imgParts[0] -eq '200' -and [int]$imgParts[1] -gt 0) $imgOut
$traversal = $false
try { Invoke-WebRequest "$base/api/clips/images/..%2F..%2Fpackage.json" -TimeoutSec 10 | Out-Null } catch { $traversal = $true }
Ok 'path traversal blocked (non-200)' $traversal 'expected error'

# ---- 3. fragment clip (selection-like, no full page) ----
$frag = '<div><p>A selected fragment about Fastify bodyLimit tuning.</p><ul><li>point one</li><li>point two</li></ul></div>'
$c2 = Api 'POST' '/api/clips' @{ html = $frag; source = 'clipboard' }
Ok 'fragment clip kept (fallback safe)' ($c2.content_html -match 'Fastify bodyLimit tuning' -and $c2.content_html -match 'point one') $c2.content_html
Ok 'fragment source=clipboard' ($c2.source -eq 'clipboard') $c2.source

# ---- 4. list: inbox first, desc by time ----
$list = @(Api 'GET' '/api/clips' $null)
$mine = @($list | Where-Object { $_.id -eq $c1.id -or $_.id -eq $c2.id })
Ok 'list contains both clips' ($mine.Count -eq 2) "count=$($mine.Count)"
Ok 'list has no content_html (light rows)' (-not ($list[0].PSObject.Properties.Name -contains 'content_html')) 'content_html leaked'

# ---- 5. convert to document ----
$doc = Api 'POST' "/api/clips/$($c1.id)/convert" @{ title = 'M11V converted doc' }
Ok 'convert creates document' ($doc.id -and $doc.title -eq 'M11V converted doc' -and $doc.content -match 'user_version pragma') ($doc | ConvertTo-Json -Compress).Substring(0, 200)
$c1After = Api 'GET' "/api/clips/$($c1.id)" $null
Ok 'clip status converted + doc backfilled' ($c1After.status -eq 'converted' -and $c1After.converted_doc_id -eq $doc.id) ($c1After | ConvertTo-Json -Compress)
$conflict = $false
try { Api 'POST' "/api/clips/$($c1.id)/convert" @{} | Out-Null } catch { $conflict = $true }
Ok 'double convert -> 409' $conflict 'expected 409'

# ---- 6. delete ----
$del = Api 'DELETE' "/api/clips/$($c2.id)" $null
Ok 'delete clip' ($del.deleted -eq $c2.id) ($del | ConvertTo-Json -Compress)
$gone = $false
try { Api 'GET' "/api/clips/$($c2.id)" $null | Out-Null } catch { $gone = $true }
Ok 'deleted clip 404' $gone 'still exists'

# ---- summary ----
Write-Host ''
if ($fail -eq 0) { Write-Host 'M11.1 ALL PASS' } else { Write-Host "M11.1 FAIL: $fail check(s) failed"; exit 1 }
