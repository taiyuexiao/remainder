# M27 publish/sync (K4) end-to-end verification (ASCII ONLY - PS 5.1 reads no-BOM ps1 as GBK)
$ErrorActionPreference = 'Stop'
$B = if ($env:VERIFY_BASE) { $env:VERIFY_BASE } else { 'http://127.0.0.1:3210' }
$H = @{ 'Content-Type' = 'application/json' }

# 1. two teams + item in team A
$ta = Invoke-RestMethod -Method Post -Uri "$B/api/teams" -Headers $H -Body (@{name='m27-a'} | ConvertTo-Json)
$tb = Invoke-RestMethod -Method Post -Uri "$B/api/teams" -Headers $H -Body (@{name='m27-b'} | ConvertTo-Json)
$A = $ta.id; $TmB = $tb.id
$k = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge" -Headers $H -Body (@{type='note'; title='m27 verify'; content='v1 content'; team_id=$A} | ConvertTo-Json)
"1. teams+item ready"

# 2. publish A -> B; inbox of B has it pending; duplicate publish rejected
$pub = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge/$($k.id)/publish" -Headers $H -Body (@{to_team=$TmB} | ConvertTo-Json)
$inbox = Invoke-RestMethod "$B/api/publications?team=$TmB"
if (@($inbox | Where-Object { $_.id -eq $pub.id -and $_.status -eq 'pending' }).Count -ne 1) { throw 'FAIL: inbox pending' }
$code = curl.exe -s -o NUL -w '%{http_code}' -X POST "$B/api/knowledge/$($k.id)/publish" -H 'Content-Type: application/json' -d ('{\"to_team\":\"' + $TmB + '\"}')
if ($code -ne '400') { throw "FAIL: duplicate publish should be 400, got $code" }
$cnt = Invoke-RestMethod "$B/api/publications/count?team=$TmB"
if ($cnt.c -ne 1) { throw 'FAIL: pending count' }
"2. publish + inbox + dup guard OK"

# 3. non-member of B cannot view; join B then view -> full content readable without A membership
$code2 = curl.exe -s -o NUL -w '%{http_code}' "$B/api/publications/$($pub.id)/item" -H 'x-user-name: stranger'
if ($code2 -ne '403') { throw "FAIL: stranger view should be 403, got $code2" }
$detailB = Invoke-RestMethod "$B/api/teams/$TmB"
Invoke-RestMethod -Method Post -Uri "$B/api/teams/join" -Headers @{ 'Content-Type'='application/json'; 'x-user-name'='teammate-b' } -Body (@{invite_token=$detailB.invite_token} | ConvertTo-Json) | Out-Null
$viewed = Invoke-RestMethod "$B/api/publications/$($pub.id)/item" -Headers @{ 'x-user-name' = 'teammate-b' }
if ($viewed.content -ne 'v1 content') { throw 'FAIL: view content' }
"3. view grant OK (no source-team membership needed)"

# 4. sync into B -> fork copy with upstream pointer; publication synced
$synced = Invoke-RestMethod -Method Post -Uri "$B/api/publications/$($pub.id)/sync" -Headers @{ 'x-user-name' = 'teammate-b' }
$copyId = $synced.item.id
$copy = Invoke-RestMethod "$B/api/knowledge/$copyId" -Headers @{ 'x-user-name' = 'teammate-b' }
if ($copy.upstream_id -ne $k.id -or $copy.team_id -ne $TmB) { throw 'FAIL: upstream pointer' }
"4. sync fork OK (copy=$copyId)"

# 5. upstream update -> copy flagged has_update; pull -> content updated, flag cleared
Invoke-RestMethod -Method Patch -Uri "$B/api/knowledge/$($k.id)" -Headers $H -Body (@{content='v2 content updated'} | ConvertTo-Json) | Out-Null
Start-Sleep -Milliseconds 50
$listB = Invoke-RestMethod "$B/api/knowledge?team=$TmB" -Headers @{ 'x-user-name' = 'teammate-b' }
$c2 = @($listB | Where-Object { $_.id -eq $copyId })[0]
if ($c2.upstream_has_update -ne 1) { throw 'FAIL: has_update flag' }
$pulled = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge/$copyId/pull" -Headers @{ 'x-user-name' = 'teammate-b' }
$copy2 = Invoke-RestMethod "$B/api/knowledge/$copyId" -Headers @{ 'x-user-name' = 'teammate-b' }
if ($copy2.content -ne 'v2 content updated') { throw 'FAIL: pull content' }
$listB2 = Invoke-RestMethod "$B/api/knowledge?team=$TmB" -Headers @{ 'x-user-name' = 'teammate-b' }
$c3 = @($listB2 | Where-Object { $_.id -eq $copyId })[0]
if ($c3.upstream_has_update -ne 0) { throw 'FAIL: flag should clear after pull' }
"5. upstream update + pull OK"

# 6. red line: upstream deleted -> pull 410, copy kept
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($k.id)" | Out-Null
$code3 = curl.exe -s -o NUL -w '%{http_code}' -X POST "$B/api/knowledge/$copyId/pull" -H 'x-user-name: teammate-b'
if ($code3 -ne '410') { throw "FAIL: deleted upstream pull should be 410, got $code3" }
$copyStill = Invoke-RestMethod "$B/api/knowledge/$copyId" -Headers @{ 'x-user-name' = 'teammate-b' }
if (-not $copyStill.id) { throw 'FAIL: copy must survive upstream deletion' }
"6. upstream-delete red line OK"

# cleanup
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$copyId" -Headers @{ 'x-user-name' = 'teammate-b' } | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/teams/$A" | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/teams/$TmB" | Out-Null
'M27 VERIFY ALL PASS'
