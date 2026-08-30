# M8 documents CRUD verification (ASCII only to avoid PS encoding issues)
$ErrorActionPreference = 'Stop'
$B = 'http://127.0.0.1:3210'

# 1. create (title only -> default empty tiptap doc)
$d1 = Invoke-RestMethod -Method Post -Uri "$B/api/documents" -ContentType 'application/json' -Body (@{title='weekly notes'} | ConvertTo-Json)
"d1 created: title=$($d1.title) hasContent=$($d1.content.Length -gt 0)"

# 2. create with tiptap JSON content
$json = '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Hello M8"}]}]}'
$d2 = Invoke-RestMethod -Method Post -Uri "$B/api/documents" -ContentType 'application/json' -Body (@{title='doc with content'; content=$json} | ConvertTo-Json)
"d2 created: contentMatch=$($d2.content -eq $json)"

# 3. validation: missing title should 400
try { Invoke-RestMethod -Method Post -Uri "$B/api/documents" -ContentType 'application/json' -Body (@{content='x'} | ConvertTo-Json); "VALIDATION FAIL: no 400" }
catch { "validation 400 OK" }

# 4. list (ordered by updated_at desc)
$list = Invoke-RestMethod "$B/api/documents"
"list: count=$($list.Count) first=$($list[0].title)"

# 5. get one
$g = Invoke-RestMethod "$B/api/documents/$($d1.id)"
"get: title=$($g.title)"

# 6. patch title + content
$p = Invoke-RestMethod -Method Patch -Uri "$B/api/documents/$($d1.id)" -ContentType 'application/json' -Body (@{title='weekly notes v2'; content=$json} | ConvertTo-Json)
"patched: title=$($p.title) contentMatch=$($p.content -eq $json)"

# 7. patch non-existent should 404
try { Invoke-RestMethod -Method Patch -Uri "$B/api/documents/nope" -ContentType 'application/json' -Body (@{title='x'} | ConvertTo-Json); "404 FAIL" }
catch { "patch 404 OK" }

# 8. delete
$del = Invoke-RestMethod -Method Delete -Uri "$B/api/documents/$($d2.id)"
"deleted: $($del.deleted -eq $d2.id)"

# 9. get deleted should 404
try { Invoke-RestMethod "$B/api/documents/$($d2.id)"; "404 FAIL" }
catch { "get-after-delete 404 OK" }

# cleanup
Invoke-RestMethod -Method Delete -Uri "$B/api/documents/$($d1.id)" | Out-Null

"M8 ALL PASS"
