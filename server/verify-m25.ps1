# M25 work-library project tree end-to-end verification (ASCII only)
$ErrorActionPreference = 'Stop'
$B = if ($env:VERIFY_BASE) { $env:VERIFY_BASE } else { 'http://127.0.0.1:3210' }
$H = @{ 'Content-Type' = 'application/json' }

# 1. create root project in personal team, owner = bob -> bob gets P0 notification
$p = Invoke-RestMethod -Method Post -Uri "$B/api/kb-projects" -Headers $H -Body (@{name='m25-verify-proj'; owners=@('bob')} | ConvertTo-Json)
"1. project created: $($p.id)"

# 2. subproject + cross-level listing
$sp = Invoke-RestMethod -Method Post -Uri "$B/api/kb-projects" -Headers $H -Body (@{name='m25-verify-sub'; parent_id=$p.id} | ConvertTo-Json)
$all = Invoke-RestMethod "$B/api/kb-projects?team=personal"
if (($all | Where-Object { $_.id -eq $sp.id -and $_.parent_id -eq $p.id }).Count -eq 0) { throw 'FAIL: subproject tree' }
"2. subproject OK"

# 3. invalid parent rejected
$code = curl.exe -s -o NUL -w '%{http_code}' -X POST "$B/api/kb-projects" -H 'Content-Type: application/json' -d '{\"name\":\"bad\",\"parent_id\":\"nonexistent\"}'
if ($code -ne '400') { throw "FAIL: invalid parent should be 400, got $code" }
"3. invalid parent guard OK"

# 4. item into project; filters: project / none
$k = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge" -Headers $H -Body (@{type='spec'; title='m25 verify spec'; project_id=$sp.id} | ConvertTo-Json)
if ($k.project_id -ne $sp.id) { throw 'FAIL: project_id not set' }
$inProj = Invoke-RestMethod "$B/api/knowledge?team=personal&project=$($sp.id)"
if (($inProj | Where-Object { $_.id -eq $k.id }).Count -eq 0) { throw 'FAIL: project filter' }
$unassigned = Invoke-RestMethod "$B/api/knowledge?team=personal&project=none"
if (($unassigned | Where-Object { $_.id -eq $k.id }).Count -gt 0) { throw 'FAIL: none filter leaked' }
"4. project filter OK"

# 5. move item to another project via PATCH + bad project rejected
$moved = Invoke-RestMethod -Method Patch -Uri "$B/api/knowledge/$($k.id)" -Headers $H -Body (@{project_id=$p.id} | ConvertTo-Json)
if ($moved.project_id -ne $p.id) { throw 'FAIL: move project' }
$code2 = curl.exe -s -o NUL -w '%{http_code}' -X PATCH "$B/api/knowledge/$($k.id)" -H 'Content-Type: application/json' -d '{\"project_id\":\"nonexistent\"}'
if ($code2 -ne '400') { throw "FAIL: bad project patch should be 400, got $code2" }
"5. item move + guard OK"

# 6. @人 P0: notification queue contains mention for bob
$notifs = Invoke-RestMethod "$B/api/notifications"
if (($notifs | Where-Object { $_.title -match 'bob|m25-verify' }).Count -eq 0) { throw 'FAIL: mention notification missing' }
"6. mention P0 notification OK ($($notifs.Count) in queue)"

# 7. delete guards: project with items/children cannot be deleted
$code3 = curl.exe -s -o NUL -w '%{http_code}' -X DELETE "$B/api/kb-projects/$($p.id)"
if ($code3 -ne '400') { throw "FAIL: non-empty project delete should be 400, got $code3" }
"7. delete guard OK"

# cleanup
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($k.id)" | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/kb-projects/$($sp.id)" | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/kb-projects/$($p.id)" | Out-Null
'M25 VERIFY ALL PASS'
