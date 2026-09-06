# M24 multi-team space end-to-end verification (ASCII only to avoid PS encoding issues)
$ErrorActionPreference = 'Stop'
$B = if ($env:VERIFY_BASE) { $env:VERIFY_BASE } else { 'http://127.0.0.1:3210' }
$H = @{ 'Content-Type' = 'application/json' }

# 1. default list contains personal space
$teams = Invoke-RestMethod "$B/api/teams"
if (($teams | Where-Object { $_.id -eq 'personal' }).Count -eq 0) { throw 'FAIL: personal team missing' }
"1. personal team OK (teams=$($teams.Count))"

# 2. create team
$t = Invoke-RestMethod -Method Post -Uri "$B/api/teams" -Headers $H -Body (@{name='m24-verify-team'} | ConvertTo-Json)
if ($t.my_role -ne 'owner') { throw 'FAIL: creator should be owner' }
$T = $t.id
"2. team created: $T"

# 3. isolation: zhangsan sees only personal; reading team knowledge -> 403
$zs = Invoke-RestMethod "$B/api/teams" -Headers @{ 'x-user-name' = 'zhangsan' }
if (($zs | Where-Object { $_.id -eq $T }).Count -gt 0) { throw 'FAIL: non-member should not see team' }
$code = curl.exe -s -o NUL -w '%{http_code}' "$B/api/knowledge?team=$T" -H 'x-user-name: zhangsan'
if ($code -ne '403') { throw "FAIL: non-member read should be 403, got $code" }
"3. non-member isolation OK"

# 4. create item in team; personal list must not contain it
$k = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge" -Headers $H -Body (@{type='note'; title='m24 verify item'; team_id=$T} | ConvertTo-Json)
if ($k.team_id -ne $T) { throw 'FAIL: team_id not set' }
$personal = Invoke-RestMethod "$B/api/knowledge?team=personal"
if (($personal | Where-Object { $_.id -eq $k.id }).Count -gt 0) { throw 'FAIL: item leaked to personal' }
"4. item scoped to team OK"

# 5. join via invite token
$detail = Invoke-RestMethod "$B/api/teams/$T"
$joined = Invoke-RestMethod -Method Post -Uri "$B/api/teams/join" -Headers @{ 'Content-Type'='application/json'; 'x-user-name'='zhangsan' } -Body (@{invite_token=$detail.invite_token} | ConvertTo-Json)
if ($joined.my_role -ne 'member') { throw 'FAIL: join role should be member' }
$zsList = Invoke-RestMethod "$B/api/knowledge?team=$T" -Headers @{ 'x-user-name' = 'zhangsan' }
if (($zsList | Where-Object { $_.id -eq $k.id }).Count -eq 0) { throw 'FAIL: member cannot read team item' }
"5. invite join + member read OK"

# 6. member cannot manage members (403); author defaults to x-user-name
$code2 = curl.exe -s -o NUL -w '%{http_code}' -X POST "$B/api/teams/$T/members" -H 'Content-Type: application/json' -H 'x-user-name: zhangsan' -d '{\"user_name\":\"lisi\"}'
if ($code2 -ne '403') { throw "FAIL: member manage should be 403, got $code2" }
$k2 = Invoke-RestMethod -Method Post -Uri "$B/api/knowledge" -Headers @{ 'Content-Type'='application/json'; 'x-user-name'='zhangsan' } -Body (@{type='intel'; title='m24 zs item'; team_id=$T} | ConvertTo-Json)
if ($k2.author -ne 'zhangsan') { throw 'FAIL: author should default to x-user-name' }
"6. role guard + author default OK"

# 7. admin ops: add member + rotate invite
Invoke-RestMethod -Method Post -Uri "$B/api/teams/$T/members" -Headers $H -Body (@{user_name='lisi'; role='admin'} | ConvertTo-Json) | Out-Null
$r2 = Invoke-RestMethod -Method Post -Uri "$B/api/teams/$T/rotate-invite" -Headers $H
if ($r2.invite_token -eq $detail.invite_token) { throw 'FAIL: invite token not rotated' }
"7. admin add member + rotate invite OK"

# cleanup
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($k.id)" | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/knowledge/$($k2.id)" -Headers @{ 'x-user-name'='zhangsan' } | Out-Null
Invoke-RestMethod -Method Delete -Uri "$B/api/teams/$T" | Out-Null
'M24 VERIFY ALL PASS'
